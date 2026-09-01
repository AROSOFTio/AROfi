import { BadRequestException, Injectable, Logger, OnModuleDestroy, OnModuleInit, ServiceUnavailableException } from '@nestjs/common'
import { AuditSeverity, Prisma } from '@prisma/client'
import { createHash, randomUUID } from 'crypto'
import { execFile } from 'child_process'
import { createReadStream, existsSync, promises as fs } from 'fs'
import { basename, join, resolve } from 'path'
import { promisify } from 'util'
import type { AuthenticatedAdminUser } from '../auth/auth.module'
import { PrismaService } from '../../prisma.service'

const execFileAsync = promisify(execFile)

type BackupKind = 'manual' | 'scheduled' | 'pre-restore' | 'uploaded'

type BackupManifest = {
  version: 1
  id: string
  fileName: string
  kind: BackupKind
  createdAt: string
  database: string
  sha256: string
  dumpBytes: number
  bundleBytes: number
  format: 'AROFI_BACKUP_V1'
  source: 'local' | 'upload'
  r2Uploaded: boolean
}

type DatabaseConfig = {
  host: string
  port: string
  user: string
  password: string
  database: string
}

@Injectable()
export class BackupRecoveryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BackupRecoveryService.name)
  private readonly backupDir = resolve(process.env.AROFI_BACKUP_DIR || '/var/lib/arofi/backups')
  private readonly intervalMs = Math.max(
    60 * 60 * 1000,
    Number.parseInt(process.env.AROFI_BACKUP_INTERVAL_SECONDS || '21600', 10) * 1000,
  )
  private readonly retentionDays = Math.max(1, Number.parseInt(process.env.AROFI_BACKUP_RETENTION_DAYS || '30', 10))
  private timer?: ReturnType<typeof setInterval>
  private operation: 'backup' | 'restore' | null = null

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    void this.ensureBackupDir().catch((error) => this.logger.error(`Backup directory unavailable: ${this.errorMessage(error)}`))
    if (process.env.AROFI_BACKUP_AUTOMATION_ENABLED !== 'false') {
      this.timer = setInterval(() => {
        if (this.operation) return
        void this.createScheduledBackup().catch((error) => this.logger.error(`Scheduled backup failed: ${this.errorMessage(error)}`))
      }, this.intervalMs)
      this.timer.unref?.()
    }
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer)
  }

  async getStatus() {
    await this.ensureBackupDir()
    const db = this.databaseConfig()
    const tools = await this.toolStatus()
    const backups = await this.listBackups()
    const latest = backups[0] ?? null
    const writable = await this.isWritableDirectory(this.backupDir)
    const databaseReachable = await this.checkDatabaseReachable(db)
    const r2Configured = this.r2Configured()

    return {
      state: databaseReachable && writable && tools.pgDump && tools.pgRestore && tools.psql ? 'READY' : 'DEGRADED',
      operation: this.operation,
      database: {
        name: db.database,
        host: db.host,
        reachable: databaseReachable,
      },
      storage: {
        directory: this.backupDir,
        writable,
        persistentMountExpected: true,
        r2Configured,
        r2EndpointConfigured: Boolean(process.env.BACKUP_S3_ENDPOINT),
        r2BucketConfigured: Boolean(process.env.BACKUP_S3_BUCKET),
      },
      automation: {
        enabled: process.env.AROFI_BACKUP_AUTOMATION_ENABLED !== 'false',
        intervalSeconds: Math.round(this.intervalMs / 1000),
        retentionDays: this.retentionDays,
      },
      tools,
      backupCount: backups.length,
      latestBackup: latest,
      restoreSafety: {
        temporaryDatabaseValidation: true,
        preRestoreSnapshot: true,
        atomicDatabaseRename: true,
        keepsPreviousDatabaseForImmediateRollback: true,
        checksumValidation: true,
        auditLogging: true,
      },
    }
  }

  async listBackups(): Promise<BackupManifest[]> {
    await this.ensureBackupDir()
    const names = await fs.readdir(this.backupDir)
    const manifests: BackupManifest[] = []
    for (const name of names.filter((item) => item.endsWith('.arobackup.json'))) {
      try {
        const raw = await fs.readFile(join(this.backupDir, name), 'utf8')
        const manifest = JSON.parse(raw) as BackupManifest
        if (manifest?.format !== 'AROFI_BACKUP_V1') continue
        if (!existsSync(join(this.backupDir, manifest.fileName))) continue
        manifests.push(manifest)
      } catch {
        // Ignore incomplete/corrupt sidecar metadata; diagnostics will still show the directory itself.
      }
    }
    return manifests.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
  }

  async createManualBackup(actor: AuthenticatedAdminUser) {
    return this.withOperation('backup', async () => {
      const manifest = await this.createBackupInternal('manual', 'local')
      await this.writeAudit(actor, 'backup.created', manifest.fileName, {
        kind: manifest.kind,
        sha256: manifest.sha256,
        sizeBytes: manifest.bundleBytes,
        r2Uploaded: manifest.r2Uploaded,
      })
      return manifest
    })
  }

  async getBackupFile(name: string) {
    const safeName = this.requireBackupName(name)
    const filePath = join(this.backupDir, safeName)
    const stat = await fs.stat(filePath).catch(() => null)
    if (!stat?.isFile()) throw new BadRequestException('Backup file not found')
    return { fileName: safeName, size: stat.size, stream: createReadStream(filePath) }
  }

  async saveUploadedBackup(file: { originalname: string; buffer: Buffer }, actor: AuthenticatedAdminUser) {
    await this.ensureBackupDir()
    if (!file?.buffer?.length) throw new BadRequestException('Backup file is empty')
    const lower = file.originalname.toLowerCase()
    if (!lower.endsWith('.arobackup') && !lower.endsWith('.dump')) {
      throw new BadRequestException('Upload an .arobackup bundle or PostgreSQL custom .dump file')
    }
    const stamp = this.timestamp()
    const safeOriginal = basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_')
    const savedName = `uploaded_${stamp}_${safeOriginal}`
    const path = join(this.backupDir, savedName)
    await fs.writeFile(path, file.buffer, { mode: 0o600 })

    await this.writeAudit(actor, 'backup.uploaded', savedName, { sizeBytes: file.buffer.length })
    return { fileName: savedName, sizeBytes: file.buffer.length }
  }

  async restoreBackup(name: string, confirmation: string, reason: string | undefined, actor: AuthenticatedAdminUser) {
    const safeName = this.requireRestorableName(name)
    const required = `RESTORE ${safeName}`
    if ((confirmation || '').trim() !== required) {
      throw new BadRequestException(`Confirmation must exactly match: ${required}`)
    }
    if ((reason || '').trim().length < 8) {
      throw new BadRequestException('Provide a restore reason of at least 8 characters')
    }

    return this.withOperation('restore', async () => {
      const sourcePath = join(this.backupDir, safeName)
      if (!(await fs.stat(sourcePath).catch(() => null))?.isFile()) {
        throw new BadRequestException('Backup file not found')
      }

      const db = this.databaseConfig()
      const restoreId = `${this.timestamp()}_${randomUUID().slice(0, 8)}`
      const workDir = join(this.backupDir, `.restore_${restoreId}`)
      await fs.mkdir(workDir, { recursive: true, mode: 0o700 })
      let tempDatabase = this.databaseName(`${db.database}_restore_${Date.now()}`)
      let previousDatabase = this.databaseName(`${db.database}_before_restore_${Date.now()}`)
      let failedDatabase: string | null = null
      let swapped = false

      try {
        const prepared = await this.prepareRestoreSource(sourcePath, safeName, workDir)
        await this.verifyDump(prepared.dumpPath, prepared.expectedSha256)

        // The last known-good live state is always captured immediately before a destructive restore.
        const preRestore = await this.createBackupInternal('pre-restore', 'local')

        await this.dropDatabaseIfExists(db, tempDatabase)
        await this.execDatabaseTool('createdb', this.connectionArgs(db, ['-T', 'template0', tempDatabase]), db)
        try {
          await this.execDatabaseTool(
            'pg_restore',
            this.connectionArgs(db, ['--no-owner', '--no-privileges', '--exit-on-error', '-d', tempDatabase, prepared.dumpPath]),
            db,
            10 * 60 * 1000,
          )
          const validation = await this.validateDatabase(db, tempDatabase)
          if (!validation.valid) throw new Error(`Restore validation failed: ${validation.message}`)

          await this.swapDatabases(db, tempDatabase, previousDatabase)
          swapped = true

          const liveValidation = await this.validateDatabase(db, db.database)
          if (!liveValidation.valid) throw new Error(`Restored live database failed validation: ${liveValidation.message}`)

          await this.writeAudit(actor, 'backup.restored', safeName, {
            reason: reason!.trim(),
            preRestoreBackup: preRestore.fileName,
            previousDatabase,
            restoredFrom: safeName,
            checksum: prepared.expectedSha256,
            validation: liveValidation,
          }, AuditSeverity.CRITICAL)

          return {
            ok: true,
            restoredFrom: safeName,
            preRestoreBackup: preRestore.fileName,
            previousDatabase,
            validation: liveValidation,
            message: 'Restore completed. The previous live database is retained for immediate rollback until manually removed.',
          }
        } catch (error) {
          if (swapped) {
            failedDatabase = this.databaseName(`${db.database}_failed_restore_${Date.now()}`)
            await this.rollbackDatabaseSwap(db, previousDatabase, failedDatabase).catch((rollbackError) => {
              throw new Error(`${this.errorMessage(error)}; automatic rollback also failed: ${this.errorMessage(rollbackError)}`)
            })
            swapped = false
          }
          throw error
        }
      } catch (error) {
        await this.writeAudit(actor, 'backup.restore_failed', safeName, {
          reason: reason!.trim(),
          error: this.errorMessage(error),
          temporaryDatabase: tempDatabase,
          previousDatabase: swapped ? previousDatabase : null,
          failedDatabase,
        }, AuditSeverity.CRITICAL).catch(() => undefined)
        throw new ServiceUnavailableException(`Restore failed safely: ${this.errorMessage(error)}`)
      } finally {
        if (!swapped) {
          await this.dropDatabaseIfExists(db, tempDatabase).catch(() => undefined)
        }
        await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined)
      }
    })
  }

  private async createScheduledBackup() {
    return this.withOperation('backup', async () => {
      const manifest = await this.createBackupInternal('scheduled', 'local')
      await this.prisma.auditLog.create({
        data: {
          action: 'backup.scheduled_created',
          entity: 'SystemBackup',
          entityId: manifest.fileName,
          severity: AuditSeverity.INFO,
          details: this.json({ sha256: manifest.sha256, sizeBytes: manifest.bundleBytes, r2Uploaded: manifest.r2Uploaded }),
        },
      }).catch(() => undefined)
      return manifest
    })
  }

  private async createBackupInternal(kind: Exclude<BackupKind, 'uploaded'>, source: 'local') {
    await this.ensureBackupDir()
    const db = this.databaseConfig()
    const id = randomUUID()
    const stamp = this.timestamp()
    const base = `arofi_${kind.replace('-', '_')}_${stamp}`
    const workDir = join(this.backupDir, `.work_${id}`)
    const dumpPath = join(workDir, 'database.dump')
    const manifestPath = join(workDir, 'manifest.json')
    const fileName = `${base}.arobackup`
    const bundlePath = join(this.backupDir, fileName)
    const sidecarPath = `${bundlePath}.json`
    await fs.mkdir(workDir, { recursive: true, mode: 0o700 })

    try {
      await this.execDatabaseTool(
        'pg_dump',
        this.connectionArgs(db, ['-Fc', '--no-owner', '--no-privileges', '-f', dumpPath, db.database]),
        db,
        10 * 60 * 1000,
      )
      const dumpStat = await fs.stat(dumpPath)
      if (dumpStat.size < 1024) throw new Error('Database dump is unexpectedly small')
      await this.execDatabaseTool('pg_restore', ['--list', dumpPath], db)
      const sha256 = await this.sha256File(dumpPath)

      const manifest: BackupManifest = {
        version: 1,
        id,
        fileName,
        kind,
        createdAt: new Date().toISOString(),
        database: db.database,
        sha256,
        dumpBytes: dumpStat.size,
        bundleBytes: 0,
        format: 'AROFI_BACKUP_V1',
        source,
        r2Uploaded: false,
      }
      await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), { mode: 0o600 })
      await execFileAsync('tar', ['-czf', bundlePath, '-C', workDir, 'database.dump', 'manifest.json'], { timeout: 10 * 60 * 1000 })
      const bundleStat = await fs.stat(bundlePath)
      manifest.bundleBytes = bundleStat.size
      manifest.r2Uploaded = await this.uploadToR2(bundlePath, fileName)
      await fs.writeFile(sidecarPath, JSON.stringify(manifest, null, 2), { mode: 0o600 })
      await this.cleanupRetention()
      return manifest
    } finally {
      await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined)
    }
  }

  private async prepareRestoreSource(sourcePath: string, fileName: string, workDir: string) {
    if (fileName.toLowerCase().endsWith('.dump')) {
      const dumpPath = join(workDir, 'database.dump')
      await fs.copyFile(sourcePath, dumpPath)
      return { dumpPath, expectedSha256: await this.sha256File(dumpPath) }
    }

    await execFileAsync('tar', ['-xzf', sourcePath, '-C', workDir, 'database.dump', 'manifest.json'], { timeout: 2 * 60 * 1000 })
    const manifest = JSON.parse(await fs.readFile(join(workDir, 'manifest.json'), 'utf8')) as BackupManifest
    if (manifest.format !== 'AROFI_BACKUP_V1' || !manifest.sha256) throw new Error('Unsupported or incomplete .arobackup manifest')
    return { dumpPath: join(workDir, 'database.dump'), expectedSha256: manifest.sha256 }
  }

  private async verifyDump(dumpPath: string, expectedSha256: string) {
    const actual = await this.sha256File(dumpPath)
    if (actual !== expectedSha256) throw new Error('Backup checksum does not match its manifest')
    const { stdout } = await execFileAsync('pg_restore', ['--list', dumpPath], { timeout: 2 * 60 * 1000, maxBuffer: 8 * 1024 * 1024 })
    if (!stdout.includes('TABLE') && !stdout.includes('TABLE DATA')) throw new Error('Backup does not contain a valid PostgreSQL archive')
  }

  private async validateDatabase(db: DatabaseConfig, database: string) {
    const required = ['Tenant', 'User', 'Router', 'BillingTransaction', 'Voucher', 'AuditLog']
    const sql = `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN (${required.map((item) => `'${item}'`).join(',')}) ORDER BY table_name;`
    const { stdout } = await this.execDatabaseTool('psql', this.connectionArgs(db, ['-d', database, '-At', '-c', sql]), db)
    const present = new Set(stdout.split(/\r?\n/).map((item) => item.trim()).filter(Boolean))
    const missing = required.filter((item) => !present.has(item))
    if (missing.length) return { valid: false, message: `Missing required tables: ${missing.join(', ')}`, requiredTables: required, missingTables: missing }

    const countsSql = `SELECT (SELECT COUNT(*) FROM "Tenant")::text || '|' || (SELECT COUNT(*) FROM "User")::text || '|' || (SELECT COUNT(*) FROM "Router")::text || '|' || (SELECT COUNT(*) FROM "BillingTransaction")::text || '|' || (SELECT COUNT(*) FROM "Voucher")::text;`
    const counts = await this.execDatabaseTool('psql', this.connectionArgs(db, ['-d', database, '-At', '-c', countsSql]), db)
    const [tenants, users, routers, billingTransactions, vouchers] = counts.stdout.trim().split('|').map((item) => Number(item || 0))
    return {
      valid: true,
      message: 'Core AROFi tables and records validated',
      counts: { tenants, users, routers, billingTransactions, vouchers },
    }
  }

  private async swapDatabases(db: DatabaseConfig, tempDatabase: string, previousDatabase: string) {
    const sql = [
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname IN (${this.sqlString(db.database)}, ${this.sqlString(tempDatabase)}) AND pid <> pg_backend_pid();`,
      `ALTER DATABASE ${this.quoteIdent(db.database)} RENAME TO ${this.quoteIdent(previousDatabase)};`,
      `ALTER DATABASE ${this.quoteIdent(tempDatabase)} RENAME TO ${this.quoteIdent(db.database)};`,
    ].join('\n')
    await this.execDatabaseTool('psql', this.connectionArgs(db, ['-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', sql]), db)
  }

  private async rollbackDatabaseSwap(db: DatabaseConfig, previousDatabase: string, failedDatabase: string) {
    const sql = [
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname IN (${this.sqlString(db.database)}, ${this.sqlString(previousDatabase)}) AND pid <> pg_backend_pid();`,
      `ALTER DATABASE ${this.quoteIdent(db.database)} RENAME TO ${this.quoteIdent(failedDatabase)};`,
      `ALTER DATABASE ${this.quoteIdent(previousDatabase)} RENAME TO ${this.quoteIdent(db.database)};`,
    ].join('\n')
    await this.execDatabaseTool('psql', this.connectionArgs(db, ['-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', sql]), db)
  }

  private async dropDatabaseIfExists(db: DatabaseConfig, database: string) {
    const sql = `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=${this.sqlString(database)} AND pid <> pg_backend_pid(); DROP DATABASE IF EXISTS ${this.quoteIdent(database)};`
    await this.execDatabaseTool('psql', this.connectionArgs(db, ['-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', sql]), db)
  }

  private async uploadToR2(path: string, fileName: string) {
    if (!this.r2Configured()) return false
    const endpoint = process.env.BACKUP_S3_ENDPOINT!
    const bucket = process.env.BACKUP_S3_BUCKET!
    const prefix = (process.env.BACKUP_S3_PREFIX || 'arofi/production').replace(/^\/+|\/+$/g, '')
    const env = {
      ...process.env,
      AWS_ACCESS_KEY_ID: process.env.BACKUP_S3_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID || '',
      AWS_SECRET_ACCESS_KEY: process.env.BACKUP_S3_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY || '',
      AWS_DEFAULT_REGION: process.env.BACKUP_S3_REGION || process.env.AWS_DEFAULT_REGION || 'auto',
    }
    try {
      await execFileAsync('aws', ['--endpoint-url', endpoint, 's3', 'cp', path, `s3://${bucket}/${prefix}/${fileName}`, '--only-show-errors'], {
        env,
        timeout: 10 * 60 * 1000,
        maxBuffer: 4 * 1024 * 1024,
      })
      return true
    } catch (error) {
      this.logger.error(`Offsite backup upload failed: ${this.errorMessage(error)}`)
      return false
    }
  }

  private async cleanupRetention() {
    const cutoff = Date.now() - this.retentionDays * 24 * 60 * 60 * 1000
    for (const manifest of await this.listBackups()) {
      if (manifest.kind === 'pre-restore' || Date.parse(manifest.createdAt) >= cutoff) continue
      await fs.rm(join(this.backupDir, manifest.fileName), { force: true }).catch(() => undefined)
      await fs.rm(join(this.backupDir, `${manifest.fileName}.json`), { force: true }).catch(() => undefined)
    }
  }

  private async toolStatus() {
    const check = async (tool: string) => {
      try {
        await execFileAsync('sh', ['-lc', `command -v ${tool} >/dev/null 2>&1`], { timeout: 5000 })
        return true
      } catch {
        return false
      }
    }
    const [pgDump, pgRestore, psql, createdb, tar, aws] = await Promise.all([
      check('pg_dump'), check('pg_restore'), check('psql'), check('createdb'), check('tar'), check('aws'),
    ])
    return { pgDump, pgRestore, psql, createdb, tar, aws }
  }

  private async checkDatabaseReachable(db: DatabaseConfig) {
    try {
      await this.execDatabaseTool('psql', this.connectionArgs(db, ['-d', db.database, '-At', '-c', 'SELECT 1;']), db, 10000)
      return true
    } catch {
      return false
    }
  }

  private async isWritableDirectory(dir: string) {
    const probe = join(dir, `.write_probe_${process.pid}`)
    try {
      await fs.writeFile(probe, 'ok', { mode: 0o600 })
      await fs.rm(probe, { force: true })
      return true
    } catch {
      return false
    }
  }

  private async ensureBackupDir() {
    await fs.mkdir(this.backupDir, { recursive: true, mode: 0o700 })
  }

  private databaseConfig(): DatabaseConfig {
    const raw = process.env.DATABASE_URL
    if (!raw) throw new ServiceUnavailableException('DATABASE_URL is not configured')
    const url = new URL(raw)
    return {
      host: url.hostname,
      port: url.port || '5432',
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: decodeURIComponent(url.pathname.replace(/^\//, '')),
    }
  }

  private connectionArgs(db: DatabaseConfig, rest: string[]) {
    return ['-h', db.host, '-p', db.port, '-U', db.user, ...rest]
  }

  private async execDatabaseTool(command: string, args: string[], db: DatabaseConfig, timeout = 2 * 60 * 1000) {
    return execFileAsync(command, args, {
      env: { ...process.env, PGPASSWORD: db.password },
      timeout,
      maxBuffer: 16 * 1024 * 1024,
    })
  }

  private async sha256File(path: string) {
    const data = await fs.readFile(path)
    return createHash('sha256').update(data).digest('hex')
  }

  private r2Configured() {
    return Boolean(
      process.env.BACKUP_S3_BUCKET &&
      process.env.BACKUP_S3_ENDPOINT &&
      (process.env.BACKUP_S3_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID) &&
      (process.env.BACKUP_S3_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY),
    )
  }

  private requireBackupName(name: string) {
    const safe = basename(name || '')
    if (!safe || safe !== name || !safe.endsWith('.arobackup')) throw new BadRequestException('Invalid backup name')
    return safe
  }

  private requireRestorableName(name: string) {
    const safe = basename(name || '')
    if (!safe || safe !== name || (!safe.endsWith('.arobackup') && !safe.endsWith('.dump'))) {
      throw new BadRequestException('Invalid restore file name')
    }
    return safe
  }

  private databaseName(value: string) {
    return value.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 60)
  }

  private quoteIdent(value: string) {
    return `"${value.replace(/"/g, '""')}"`
  }

  private sqlString(value: string) {
    return `'${value.replace(/'/g, "''")}'`
  }

  private timestamp() {
    return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z').replace('T', '_')
  }

  private async withOperation<T>(operation: 'backup' | 'restore', task: () => Promise<T>) {
    if (this.operation) throw new ServiceUnavailableException(`A ${this.operation} operation is already running`)
    this.operation = operation
    try {
      return await task()
    } finally {
      this.operation = null
    }
  }

  private async writeAudit(
    actor: AuthenticatedAdminUser,
    action: string,
    entityId: string,
    details: unknown,
    severity: AuditSeverity = AuditSeverity.WARNING,
  ) {
    await this.prisma.auditLog.create({
      data: {
        tenantId: actor.tenantId ?? null,
        userId: actor.id,
        action,
        entity: 'SystemBackup',
        entityId,
        severity,
        details: this.json(details),
      },
    })
  }

  private json(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue
  }

  private errorMessage(error: unknown) {
    if (error instanceof Error) return error.message
    return String(error)
  }
}
