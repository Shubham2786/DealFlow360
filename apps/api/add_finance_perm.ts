import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
  const financeRole = await prisma.role.findFirst({ where: { name: 'FINANCE' } });
  const perm = await prisma.permission.findFirst({ where: { name: 'DEAL_VIEW_TEAM' } });
  console.log('FINANCE role:', financeRole?.id, 'DEAL_VIEW_TEAM perm:', perm?.id);

  if (!financeRole || !perm) {
    console.log('Role or permission not found');
    await prisma.$disconnect();
    return;
  }

  const existing = await prisma.rolePermission.findFirst({
    where: { roleId: financeRole.id, permissionId: perm.id }
  });

  if (existing) {
    console.log('DEAL_VIEW_TEAM already assigned to FINANCE role');
  } else {
    await prisma.rolePermission.create({
      data: { roleId: financeRole.id, permissionId: perm.id }
    });
    console.log('SUCCESS: DEAL_VIEW_TEAM added to FINANCE role in database');
  }
  await prisma.$disconnect();
}

run().catch((err) => { console.error(err); process.exit(1); });
