/**
 * DealFlow360 seed — RBAC + demo data (India / INR / GST).
 * Idempotent: roles/permissions/users/products upsert by unique keys; domain rows seed
 * only when empty. Initial admin credentials come from env (see .env.example).
 */
import { PrismaClient, Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { UserRole, Permission, ROLE_PERMISSIONS } from '@dealflow/shared';

const prisma = new PrismaClient();

const daysFromNow = (d: number) => new Date(Date.now() + d * 24 * 60 * 60 * 1000);

const ROLE_DESCRIPTIONS: Record<string, string> = {
  [UserRole.USER]: 'Standard user — create and view own deals',
  [UserRole.MANAGER]: 'Sales manager — approve deals, allocate fulfillment, view team',
  [UserRole.FINANCE]: 'Finance — billing, invoices, payments, financial reports',
  [UserRole.ADMIN]: 'Administrator — full access incl. user & role management',
};

async function seedRbac() {
  // Permissions
  const permByName: Record<string, string> = {};
  for (const name of Object.values(Permission)) {
    const p = await prisma.permission.upsert({
      where: { name },
      update: {},
      create: { name, description: name.replaceAll('_', ' ').toLowerCase() },
    });
    permByName[name] = p.id;
  }

  // Roles + role→permission mappings
  const roleByName: Record<string, string> = {};
  for (const roleName of Object.values(UserRole)) {
    const role = await prisma.role.upsert({
      where: { name: roleName },
      update: { description: ROLE_DESCRIPTIONS[roleName] },
      create: { name: roleName, description: ROLE_DESCRIPTIONS[roleName] },
    });
    roleByName[roleName] = role.id;

    for (const perm of ROLE_PERMISSIONS[roleName]) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permByName[perm] } },
        update: {},
        create: { roleId: role.id, permissionId: permByName[perm] },
      });
    }
  }
  return roleByName;
}

async function seedUsers(roleByName: Record<string, string>) {
  const adminEmail = process.env.ADMIN_EMAIL ?? 'admin@dealflow.test';
  const adminPassword = process.env.ADMIN_PASSWORD ?? 'password123';
  const hash = await argon2.hash(adminPassword);
  const demoHash = await argon2.hash('password123');

  const users = [
    { email: adminEmail, name: 'Avery Admin', role: UserRole.ADMIN, passwordHash: hash },
    { email: 'morgan@dealflow.test', name: 'Morgan Manager', role: UserRole.MANAGER, passwordHash: demoHash },
    { email: 'fiona@dealflow.test', name: 'Fiona Finance', role: UserRole.FINANCE, passwordHash: demoHash },
    { email: 'sam@dealflow.test', name: 'Sam Sales', role: UserRole.USER, passwordHash: demoHash },
    { email: 'uma@dealflow.test', name: 'Uma User', role: UserRole.USER, passwordHash: demoHash },
  ];

  const byEmail: Record<string, string> = {};
  for (const u of users) {
    const created = await prisma.user.upsert({
      where: { email: u.email },
      update: { roleId: roleByName[u.role] },
      create: { email: u.email, name: u.name, passwordHash: u.passwordHash, roleId: roleByName[u.role] },
    });
    byEmail[u.email] = created.id;
  }
  return byEmail;
}

async function main() {
  const roleByName = await seedRbac();
  const usersByEmail = await seedUsers(roleByName);
  const salespersonId = usersByEmail['sam@dealflow.test'];

  // ---- Products (INR / GST 18%) ----
  const productSpecs = [
    { sku: 'SKU-100', name: 'Laptop Pro 14', category: 'Hardware', basePrice: 85000, taxRate: 18 },
    { sku: 'SKU-200', name: 'Mechanical Keyboard', category: 'Accessories', basePrice: 4500, taxRate: 18 },
    { sku: 'SKU-300', name: 'Wireless Mouse', category: 'Accessories', basePrice: 1200, taxRate: 18 },
    { sku: 'SKU-400', name: '4K Monitor 27"', category: 'Hardware', basePrice: 22000, taxRate: 18 },
    { sku: 'SKU-500', name: 'Support Plan (Annual)', category: 'Services', basePrice: 40000, taxRate: 18, type: 'RECURRING' as const },
  ];
  const products: Record<string, { id: string; basePrice: number }> = {};
  for (const p of productSpecs) {
    const created = await prisma.product.upsert({
      where: { sku: p.sku },
      update: {},
      create: {
        sku: p.sku, name: p.name, category: p.category,
        basePrice: new Prisma.Decimal(p.basePrice), taxRate: new Prisma.Decimal(p.taxRate),
        type: p.type ?? 'ONE_TIME',
      },
    });
    products[p.sku] = { id: created.id, basePrice: p.basePrice };
  }

  // ---- Warehouses + Inventory ----
  const warehouseSpecs = [
    { code: 'WH-A', name: 'Mumbai DC', priority: 10 },
    { code: 'WH-B', name: 'Bengaluru DC', priority: 20 },
    { code: 'WH-C', name: 'Delhi DC', priority: 30 },
  ];
  const warehouses: Record<string, string> = {};
  for (const w of warehouseSpecs) {
    const created = await prisma.warehouse.upsert({ where: { code: w.code }, update: {}, create: w });
    warehouses[w.code] = created.id;
  }
  const invSpecs = [
    { sku: 'SKU-100', code: 'WH-A', onHand: 5 },
    { sku: 'SKU-100', code: 'WH-B', onHand: 3 },
    { sku: 'SKU-200', code: 'WH-A', onHand: 200 },
    { sku: 'SKU-300', code: 'WH-A', onHand: 500 },
    { sku: 'SKU-400', code: 'WH-B', onHand: 40 },
    { sku: 'SKU-400', code: 'WH-C', onHand: 10 },
  ];
  for (const s of invSpecs) {
    const productId = products[s.sku]?.id;
    if (!productId) continue;
    await prisma.inventory.upsert({
      where: { productId_warehouseId: { productId, warehouseId: warehouses[s.code] } },
      update: {},
      create: { productId, warehouseId: warehouses[s.code], onHand: s.onHand, reserved: 0 },
    });
  }

  const existingQuotes = await prisma.quotation.count();
  if (existingQuotes > 0) {
    console.log('[seed] Domain data already present — RBAC/users/products refreshed, skipping deals.');
    return;
  }

  // ---- Customers ----
  const acme = await prisma.customer.create({ data: { name: 'Acme Corp', segment: 'ENTERPRISE', contactName: 'Rita Reyes', contactEmail: 'rita@acme.test', contactPhone: '+91 98200 12345' } });
  const globex = await prisma.customer.create({ data: { name: 'Globex LLC', segment: 'SMB', contactName: 'Ivan Ito', contactEmail: 'ivan@globex.test', contactPhone: '+91 80100 22334' } });
  const initech = await prisma.customer.create({ data: { name: 'Initech', segment: 'STRATEGIC', contactName: 'Bill Lum', contactEmail: 'bill@initech.test', contactPhone: '+91 11400 55667' } });

  // ---- Quotations (INR) ----
  type QSpec = { number: string; customerId: string; status: string; discountPct: number; marginPct: number; total: number; createdAt?: Date; expiresAt?: Date };
  const quotes: QSpec[] = [
    { number: 'Q-1001', customerId: acme.id, status: 'DRAFT', discountPct: 5, marginPct: 32, total: 340000 },
    { number: 'Q-1002', customerId: globex.id, status: 'DRAFT', discountPct: 0, marginPct: 28, total: 89000 },
    { number: 'Q-1003', customerId: acme.id, status: 'PENDING_APPROVAL', discountPct: 18, marginPct: 22, total: 1560000, createdAt: daysFromNow(-9) },
    { number: 'Q-1004', customerId: initech.id, status: 'APPROVED', discountPct: 8, marginPct: 30, total: 2200000 },
    { number: 'Q-1005', customerId: globex.id, status: 'APPROVED', discountPct: 12, marginPct: 9, total: 730000 },
    { number: 'Q-1006', customerId: acme.id, status: 'NEGOTIATION', discountPct: 10, marginPct: 24, total: 540000, expiresAt: daysFromNow(4) },
    { number: 'Q-1007', customerId: initech.id, status: 'INVOICED', discountPct: 6, marginPct: 27, total: 3050000 },
  ];
  const quoteByNumber: Record<string, string> = {};
  for (const q of quotes) {
    const created = await prisma.quotation.create({
      data: {
        number: q.number, customerId: q.customerId, salespersonId, createdById: salespersonId,
        status: q.status as never,
        discountPct: new Prisma.Decimal(q.discountPct), marginPct: new Prisma.Decimal(q.marginPct),
        subtotal: new Prisma.Decimal(q.total), total: new Prisma.Decimal(q.total),
        createdAt: q.createdAt ?? new Date(), expiresAt: q.expiresAt ?? null,
        lines: { create: [{ productId: products['SKU-100'].id, qty: 2, unitPrice: new Prisma.Decimal(products['SKU-100'].basePrice), lineTotal: new Prisma.Decimal(products['SKU-100'].basePrice * 2) }] },
      },
    });
    quoteByNumber[q.number] = created.id;
  }

  // Pending approval chain for Q-1003 (Manager + Finance)
  await prisma.approvalRequest.create({
    data: {
      quotationId: quoteByNumber['Q-1003'], status: 'PENDING',
      reason: 'Discount 18% / value ₹15.6L requires manager + finance review',
      steps: { create: [{ level: 1, role: UserRole.MANAGER, status: 'PENDING' }, { level: 2, role: UserRole.FINANCE, status: 'PENDING' }] },
    },
  });

  // ---- Invoices (INR / GST) ----
  const inv = (total: number) => {
    const subtotal = Math.round((total / 1.18) * 100) / 100;
    return { subtotal: new Prisma.Decimal(subtotal), gstTotal: new Prisma.Decimal(Math.round((total - subtotal) * 100) / 100), total: new Prisma.Decimal(total) };
  };
  await prisma.invoice.createMany({
    data: [
      { number: 'INV-3001', customerId: initech.id, quotationId: quoteByNumber['Q-1007'], status: 'PAID', issueDate: daysFromNow(-30), dueDate: daysFromNow(-15), ...inv(3050000), paidAmount: new Prisma.Decimal(3050000) },
      { number: 'INV-3002', customerId: acme.id, status: 'PARTIALLY_PAID', issueDate: daysFromNow(-10), dueDate: daysFromNow(20), ...inv(1200000), paidAmount: new Prisma.Decimal(400000) },
      { number: 'INV-3003', customerId: globex.id, quotationId: quoteByNumber['Q-1005'], status: 'OVERDUE', issueDate: daysFromNow(-45), dueDate: daysFromNow(-12), ...inv(730000), paidAmount: new Prisma.Decimal(0) },
      { number: 'INV-3004', customerId: acme.id, status: 'ISSUED', issueDate: daysFromNow(-3), dueDate: daysFromNow(27), ...inv(540000), paidAmount: new Prisma.Decimal(0) },
    ],
  });

  await prisma.auditEvent.createMany({
    data: [
      { actorName: 'Sam Sales', entityType: 'Quotation', action: 'QUOTATION_CREATED', message: 'Quotation Q-1007 created' },
      { actorName: 'Morgan Manager', entityType: 'Approval', action: 'APPROVAL_APPROVED', message: 'Q-1004 approved' },
      { actorName: 'Fiona Finance', entityType: 'Invoice', action: 'INVOICE_GENERATED', message: 'Invoice INV-3001 generated' },
      { actorName: 'Fiona Finance', entityType: 'Payment', action: 'PAYMENT_RECORDED', message: 'Payment recorded for INV-3001' },
      { actorName: 'Sam Sales', entityType: 'Quotation', action: 'QUOTATION_SUBMITTED', message: 'Q-1003 submitted for approval' },
    ],
  });

  console.log('[seed] RBAC + demo data seeded.');
  console.log('[seed] Logins (password: password123): admin@ / morgan@ / fiona@ / sam@ / uma@ dealflow.test');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
