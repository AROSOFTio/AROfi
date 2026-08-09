import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { PrismaService } from '../../prisma.service'
import * as net from 'net'

@Injectable()
export class RemoteProxyService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RemoteProxyService.name)
  private readonly activeProxies = new Map<number, net.Server>()

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    if (process.env.REMOTE_PROXY_ENABLED === 'false') {
      this.logger.warn('REMOTE_PROXY_ENABLED=false - remote WinBox proxy listeners disabled in this process')
      return
    }

    this.logger.log('Initializing remote WinBox access proxies...')
    try {
      // Sanitize any legacy remotePort values that are outside the 31000-31100 range
      const allRouters = await this.prisma.router.findMany({
        where: {
          remotePort: { not: null },
        },
      })

      for (const r of allRouters) {
        if (r.remotePort && (r.remotePort < 31000 || r.remotePort > 31100)) {
          const newPort = Math.floor(Math.random() * 100) + 31000
          await this.prisma.router.update({
            where: { id: r.id },
            data: { remotePort: newPort },
          })
          this.logger.log(`Sanitized legacy remotePort for router "${r.name}" from ${r.remotePort} to ${newPort}`)
        }
      }

      const activeRouters = await this.prisma.router.findMany({
        where: {
          isRemotePortOpen: true,
          remoteAccessEnabled: true,
          remotePort: { not: null },
          remoteSstpIp: { not: null },
        },
      })

      for (const router of activeRouters) {
        if (router.remotePort && router.remoteSstpIp) {
          this.startProxy(router.remotePort, router.remoteSstpIp, 8291, router.name)
        }
      }
    } catch (err) {
      this.logger.error('Failed to initialize active proxies on startup', err)
    }
  }

  onModuleDestroy() {
    this.logger.log('Shutting down all active remote proxies...')
    for (const [port, server] of this.activeProxies.entries()) {
      server.close()
      this.logger.log(`Closed remote proxy on port ${port}`)
    }
    this.activeProxies.clear()
  }

  startProxy(localPort: number, remoteHost: string, remotePort: number, routerName: string) {
    if (this.activeProxies.has(localPort)) {
      this.logger.warn(`Proxy on port ${localPort} is already active. Restarting it...`)
      this.stopProxy(localPort)
    }

    const server = net.createServer((clientSocket) => {
      this.logger.log(`New remote WinBox connection request for ${routerName} on port ${localPort}`)

      // Disable Nagle on the incoming side immediately — WinBox sends many
      // small packets during auth; buffering them delays the handshake and
      // causes the "Authenticating..." hang.
      clientSocket.setNoDelay(true)

      const remoteSocket = net.connect(remotePort, remoteHost)
      // Without this, a down/unreachable SSTP tunnel leaves the OS-level TCP
      // connect attempt to hang for minutes with no 'error' event, so WinBox
      // sits on "Authenticating..." forever instead of failing fast.
      remoteSocket.setTimeout(8000)

      remoteSocket.once('connect', () => {
        remoteSocket.setTimeout(0)
        // Disable Nagle on the router-side socket too so responses flow back
        // immediately; keepalive detects silently-dead VPN sessions.
        remoteSocket.setNoDelay(true)
        remoteSocket.setKeepAlive(true, 15000)
        clientSocket.setKeepAlive(true, 15000)
        this.logger.log(`Established tunnel connection to ${routerName} (${remoteHost}:${remotePort})`)
        clientSocket.pipe(remoteSocket)
        remoteSocket.pipe(clientSocket)
      })

      remoteSocket.on('timeout', () => {
        this.logger.warn(`Tunnel connection to ${routerName} (${remoteHost}:${remotePort}) timed out - is its SSTP VPN tunnel up?`)
        remoteSocket.destroy()
        clientSocket.destroy()
      })

      clientSocket.on('error', (err) => {
        this.logger.debug(`Client socket error on port ${localPort}: ${err.message}`)
        remoteSocket.destroy()
      })

      remoteSocket.on('error', (err) => {
        this.logger.warn(`Tunnel socket error connecting to ${routerName} (${remoteHost}:${remotePort}): ${err.message}`)
        clientSocket.destroy()
      })

      clientSocket.on('close', () => {
        remoteSocket.destroy()
      })

      remoteSocket.on('close', () => {
        clientSocket.destroy()
      })
    })

    server.on('error', (err) => {
      this.logger.error(`Failed to run proxy server on port ${localPort}: ${err.message}`)
    })

    // Listen on all interfaces inside the container (0.0.0.0)
    server.listen(localPort, '0.0.0.0', () => {
      this.logger.log(`Started remote WinBox proxy on port ${localPort} -> ${remoteHost}:${remotePort} (${routerName})`)
    })

    this.activeProxies.set(localPort, server)
  }

  stopProxy(localPort: number) {
    const server = this.activeProxies.get(localPort)
    if (server) {
      server.close(() => {
        this.logger.log(`Stopped remote WinBox proxy on port ${localPort}`)
      })
      this.activeProxies.delete(localPort)
    }
  }

  // Direct TCP probe of the router's SSTP tunnel IP, bypassing the public
  // proxy port entirely. Used by the "Test Connection" action so the admin UI
  // can report whether the tunnel itself is actually reachable right now,
  // instead of inferring it from the static isRemotePortOpen DB flag (which
  // only records that the proxy listener was switched on, not that the
  // router's SSTP client is currently connected to it).
  async probeTunnel(remoteHost: string, remotePort = 8291, timeoutMs = 5000) {
    return new Promise<{ reachable: boolean; latencyMs?: number; message: string }>((resolve) => {
      const socket = new net.Socket()
      const startedAt = Date.now()
      let settled = false

      const finish = (result: { reachable: boolean; latencyMs?: number; message: string }) => {
        if (settled) {
          return
        }
        settled = true
        socket.destroy()
        resolve(result)
      }

      socket.setTimeout(timeoutMs)

      socket.once('connect', () => {
        finish({
          reachable: true,
          latencyMs: Date.now() - startedAt,
          message: 'SSTP tunnel reachable; WinBox port responded',
        })
      })

      socket.once('timeout', () => {
        finish({
          reachable: false,
          message: `Timed out after ${timeoutMs}ms connecting to ${remoteHost}:${remotePort} - the router's SSTP tunnel is likely down`,
        })
      })

      socket.once('error', (error) => {
        finish({
          reachable: false,
          message: `${error.message} - the router's SSTP tunnel is likely down`,
        })
      })

      socket.connect(remotePort, remoteHost)
    })
  }
}
