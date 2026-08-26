import { Injectable, OnModuleInit } from '@nestjs/common'
import { PrismaService } from '../../prisma.service'
import { STANDARD_ROLE_CATALOG } from './permissions.constants'

@Injectable()
export class RoleCatalogService implements OnModuleInit {
  private initialized = false
  private initializing: Promise<void> | null = null

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.ensureStandardRoles()
  }

  async ensureStandardRoles() {
    if (this.initialized) {
      return
    }

    if (!this.initializing) {
      this.initializing = (async () => {
        await Promise.all(
          Object.entries(STANDARD_ROLE_CATALOG).map(([name, permissions]) =>
            this.prisma.role.upsert({
              where: { name },
              update: { permissions },
              create: { name, permissions },
            }),
          ),
        )
        this.initialized = true
      })().finally(() => {
        this.initializing = null
      })
    }

    await this.initializing
  }
}
