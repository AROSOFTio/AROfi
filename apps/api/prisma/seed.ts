import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');
  
  // 1. Create Super Admin Role
  const adminRole = await prisma.role.upsert({
    where: { name: 'SuperAdmin' },
    update: {},
    create: {
      name: 'SuperAdmin',
      permissions: ['ALL'],
    },
  });

  // 2. Create Master Tenant
  const masterTenant = await prisma.tenant.create({
    data: {
      name: 'AROSOFT Master Tenant',
      domain: 'arosoft.io',
    },
  });

  // 3. Create Super Admin User
  const passwordHash = await bcrypt.hash('supersecret', 10);
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@arosoft.io' },
    update: {},
    create: {
      email: 'admin@arosoft.io',
      password: passwordHash,
      firstName: 'System',
      lastName: 'Administrator',
      roleId: adminRole.id,
      tenantId: masterTenant.id,
    },
  });

  console.log('Database seeded successfully!', { adminUserId: adminUser.id });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
