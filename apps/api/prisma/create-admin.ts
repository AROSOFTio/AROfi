// One-off script to create/update a single SuperAdmin user without touching
// anything else in the database. Safe to run against production -- unlike
// seed.ts, this does NOT create demo tenants, routers, vouchers, or sample
// billing data.
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

  const masterTenant = await prisma.tenant.upsert({
    where: { domain: 'arosoft.io' },
    update: { name: 'AROSOFT Master Tenant' },
    create: { name: 'AROSOFT Master Tenant', domain: 'arosoft.io' },
  })

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      password: passwordHash,
      roleId: superAdminRole.id,
      tenantId: masterTenant.id,
    },
    create: {
      email,
      password: passwordHash,
      firstName: 'System',
      lastName: 'Administrator',
      roleId: superAdminRole.id,
      tenantId: masterTenant.id,
    },
  })

  console.log(`SuperAdmin user ready: ${user.email} (id: ${user.id})`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
