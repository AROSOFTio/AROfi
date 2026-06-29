// One-off script to create/update a single platform-level developer admin
// without touching anything else in the database. Safe to run against
// production -- unlike seed.ts, this does NOT create demo tenants, routers,
// vouchers, or sample billing data.
//
// tenantId is intentionally left null: authorization (both
// apps/admin-web/src/lib/workspace.ts's isPlatformAdmin/isVendorWorkspace and
// apps/api's AccessScopeService.isSuperAdmin/resolveTenantScope) gates on
// role/permissions ('SuperAdmin' / 'ALL'), not on tenantId. But
// resolveTenantScope falls back to `requestedTenantId ?? user.tenantId` --
// if this user had a real tenantId, any caller that forgets to pass
// requestedTenantId would silently scope to that one tenant instead of
// seeing/operating platform-wide. null makes that fallback a no-op.
//
// Usage:
//   ADMIN_EMAIL=admin@arofi.net ADMIN_PASSWORD_HASH='$2a$12$...' npx tsx prisma/create-admin.ts
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const email = process.env.ADMIN_EMAIL
  const passwordHash = process.env.ADMIN_PASSWORD_HASH

  if (!email || !passwordHash) {
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD_HASH env vars are required')
  }

  const superAdminRole = await prisma.role.upsert({
    where: { name: 'SuperAdmin' },
    update: { permissions: ['ALL'] },
    create: { name: 'SuperAdmin', permissions: ['ALL'] },
  })

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      password: passwordHash,
      roleId: superAdminRole.id,
      tenantId: null,
    },
    create: {
      email,
      password: passwordHash,
      firstName: 'System',
      lastName: 'Administrator',
      roleId: superAdminRole.id,
      tenantId: null,
    },
  })

  console.log(`Platform devadmin ready: ${user.email} (id: ${user.id}, tenantId: ${user.tenantId})`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
