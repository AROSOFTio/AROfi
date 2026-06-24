import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { PrismaService } from '../../prisma.service'
import * as net from 'net'

@Injectable()
export class RemoteProxyService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RemoteProxyService.name)
  private readonly activeProxies = new Map<number, net.Server>()

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    this.logger.log('Initializing remote WinBox access proxies...')
    try {
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
      
      const remoteSocket = net.connect(remotePort, remoteHost, () => {
        this.logger.log(`Established tunnel connection to ${routerName} (${remoteHost}:${remotePort})`)
        clientSocket.pipe(remoteSocket)
        remoteSocket.pipe(clientSocket)
      })

      clientSocket.on('error', (err) => {
        this.logger.debug(`Client socket error on port ${localPort}: ${err.message}`)
        remoteSocket.end()
      })

      remoteSocket.on('error', (err) => {
        this.logger.warn(`Tunnel socket error connecting to ${routerName} (${remoteHost}:${remotePort}): ${err.message}`)
        clientSocket.end()
      })

      clientSocket.on('close', () => {
        remoteSocket.end()
      })

      remoteSocket.on('close', () => {
        clientSocket.end()
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
}
