/**
 * DealFlow360 seed script.
 * Populates users, customers, products, quotations, invoices, and audit events so the
 * Sales Dashboard and Deal Health dashboard render meaningful data.
 * Idempotent: users/products upsert by unique key; domain rows seed only when empty.
 */
import { PrismaClient, Prisma } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

const daysFromNow = (d: number) => new Date(Date.now() + d * 24 * 60 * 60 * 1000);

async function main() {
  const passwordHash = await argon2.hash('password123');

  // ---- Users (upsert by email) ----
  const admin = await prisma.user.upsert({
    where: { email: 'admin@dealflow.test' },
    update: {},
    create: { email: 'admin@dealflow.test', name: 'Avery Admin', passwordHash, role: 'ADMIN' },
  });
  const sales = await prisma.user.upsert({
    where: { email: 'sam@dealflow.test' },
    update: {},
    create: { email: 'sam@dealflow.test', name: 'Sam Sales', passwordHash, role: 'SALESPERSON' },
  });
  await prisma.user.upsert({
    where: { email: 'morgan@dealflow.test' },
    update: {},
    create: { email: 'morgan@dealflow.test', name: 'Morgan Manager', passwordHash, role: 'SALES_MANAGER' },
  });

  // ---- Products (upsert by sku) ----
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
        sku: p.sku,
        name: p.name,
        category: p.category,
        basePrice: new Prisma.Decimal(p.basePrice),
        taxRate: new Prisma.Decimal(p.taxRate),
        type: p.type ?? 'ONE_TIME',
      },
    });
    products[p.sku] = { id: created.id, basePrice: p.basePrice };
  }

  // ---- Warehouses (upsert by code) ----
  const warehouseSpecs = [
    { code: 'WH-A', name: 'Central DC', priority: 10 },
    { code: 'WH-B', name: 'East DC', priority: 20 },
    { code: 'WH-C', name: 'West DC', priority: 30 },
  ];
  const warehouses: Record<string, string> = {};
  for (const w of warehouseSpecs) {
    const created = await prisma.warehouse.upsert({
      where: { code: w.code },
      update: {},
      create: { code: w.code, name: w.name, priority: w.priority },
    });
    warehouses[w.code] = created.id;
  }

  // ---- Inventory (per product/warehouse; abundant / low / zero mix) ----
  const invSpecs: { sku: string; code: string; onHand: number }[] = [
    { sku: 'SKU-100', code: 'WH-A', onHand: 5 },   // laptop: low at A
    { sku: 'SKU-100', code: 'WH-B', onHand: 3 },   // low at B -> backorders likely
    { sku: 'SKU-200', code: 'WH-A', onHand: 200 }, // keyboard: abundant
    { sku: 'SKU-300', code: 'WH-A', onHand: 500 }, // mouse: abundant
    { sku: 'SKU-400', code: 'WH-B', onHand: 40 },  // monitor
    { sku: 'SKU-400', code: 'WH-C', onHand: 10 },
    // SKU-500 (service) intentionally has no inventory
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

  // Seed domain rows only when empty (keeps re-runs idempotent).
  const existingQuotes = await prisma.quotation.count();
  if (existingQuotes > 0) {
    console.log('[seed] Domain data already present — skipping quotations/invoices.');
    return;
  }

  // ---- Customers ----
  const acme = await prisma.customer.create({
    data: { name: 'Acme Corp', segment: 'ENTERPRISE', contactName: 'Rita Reyes', contactEmail: 'rita@acme.test' },
  });
  const globex = await prisma.customer.create({
    data: { name: 'Globex LLC', segment: 'SMB', contactName: 'Ivan Ito', contactEmail: 'ivan@globex.test' },
  });
  const initech = await prisma.customer.create({
    data: { name: 'Initech', segment: 'STRATEGIC', contactName: 'Bill Lum', contactEmail: 'bill@initech.test' },
  });

  // ---- Quotations across statuses (values chosen to exercise Deal Health) ----
  type QSpec = {
    number: string;
    customerId: string;
    status: string;
    discountPct: number;
    marginPct: number;
    total: number;
    createdAt?: Date;
    expiresAt?: Date;
  };
  const quotes: QSpec[] = [
    { number: 'Q-1001', customerId: acme.id, status: 'DRAFT', discountPct: 5, marginPct: 32, total: 340000 },
    { number: 'Q-1002', customerId: globex.id, status: 'DRAFT', discountPct: 0, marginPct: 28, total: 89000 },
    // Pending approval, aged → APPROVAL_STUCK
    { number: 'Q-1003', customerId: acme.id, status: 'PENDING_APPROVAL', discountPct: 18, marginPct: 22, total: 1560000, createdAt: daysFromNow(-9) },
    // Approved, healthy
    { number: 'Q-1004', customerId: initech.id, status: 'APPROVED', discountPct: 8, marginPct: 30, total: 2200000 },
    // Low margin → CRITICAL
    { number: 'Q-1005', customerId: globex.id, status: 'APPROVED', discountPct: 12, marginPct: 9, total: 730000 },
    // Negotiation nearing expiry → NEARING_EXPIRY
    { number: 'Q-1006', customerId: acme.id, status: 'NEGOTIATION', discountPct: 10, marginPct: 24, total: 540000, expiresAt: daysFromNow(4) },
    // Invoiced/converted
    { number: 'Q-1007', customerId: initech.id, status: 'INVOICED', discountPct: 6, marginPct: 27, total: 3050000 },
  ];

  const quoteByNumber: Record<string, string> = {};
  for (const q of quotes) {
    const created = await prisma.quotation.create({
      data: {
        number: q.number,
        customerId: q.customerId,
        salespersonId: sales.id,
        status: q.status as never,
        discountPct: new Prisma.Decimal(q.discountPct),
        marginPct: new Prisma.Decimal(q.marginPct),
        subtotal: new Prisma.Decimal(q.total),
        total: new Prisma.Decimal(q.total),
        createdAt: q.createdAt ?? new Date(),
        expiresAt: q.expiresAt ?? null,
        lines: {
          create: [
            {
              productId: products['SKU-100'].id,
              qty: 2,
              unitPrice: new Prisma.Decimal(products['SKU-100'].basePrice),
              lineTotal: new Prisma.Decimal(products['SKU-100'].basePrice * 2),
            },
          ],
        },
      },
    });
    quoteByNumber[q.number] = created.id;
  }

  // ---- Invoices (revenue, outstanding, overdue) ----
  const inv = (total: number) => {
    const subtotal = Math.round((total / 1.18) * 100) / 100;
    return {
      subtotal: new Prisma.Decimal(subtotal),
      gstTotal: new Prisma.Decimal(Math.round((total - subtotal) * 100) / 100),
      total: new Prisma.Decimal(total),
    };
  };
  await prisma.invoice.createMany({
    data: [
      {
        number: 'INV-2001',
        customerId: initech.id,
        quotationId: quoteByNumber['Q-1007'],
        status: 'PAID',
        issueDate: daysFromNow(-30),
        dueDate: daysFromNow(-15),
        ...inv(3050000),
        paidAmount: new Prisma.Decimal(3050000),
      },
      {
        number: 'INV-2002',
        customerId: acme.id,
        status: 'PARTIALLY_PAID',
        issueDate: daysFromNow(-10),
        dueDate: daysFromNow(20),
        ...inv(1200000),
        paidAmount: new Prisma.Decimal(400000),
      },
      // Overdue → CRITICAL anomaly + overdue KPI
      {
        number: 'INV-2003',
        customerId: globex.id,
        quotationId: quoteByNumber['Q-1005'],
        status: 'OVERDUE',
        issueDate: daysFromNow(-45),
        dueDate: daysFromNow(-12),
        ...inv(730000),
        paidAmount: new Prisma.Decimal(0),
      },
      {
        number: 'INV-2004',
        customerId: acme.id,
        status: 'ISSUED',
        issueDate: daysFromNow(-3),
        dueDate: daysFromNow(27),
        ...inv(540000),
        paidAmount: new Prisma.Decimal(0),
      },
    ],
  });

  // ---- A pending approval request for Q-1003 (discount 18% → Manager + Finance) ----
  await prisma.approvalRequest.create({
    data: {
      quotationId: quoteByNumber['Q-1003'],
      status: 'PENDING',
      reason: 'Discount 18% / margin 22% requires manager review; Finance approval required',
      steps: {
        create: [
          { level: 1, role: 'SALES_MANAGER', status: 'PENDING' },
          { level: 2, role: 'FINANCE', status: 'PENDING' },
        ],
      },
    },
  });

  // ---- Recent activity feed ----
  await prisma.auditEvent.createMany({
    data: [
      { actorName: 'Sam Sales', entityType: 'Quotation', action: 'QUOTATION_CREATED', message: 'Quotation Q-1007 created' },
      { actorName: 'Morgan Manager', entityType: 'Approval', action: 'APPROVAL_APPROVED', message: 'Q-1004 approved' },
      { actorName: 'System', entityType: 'Invoice', action: 'INVOICE_GENERATED', message: 'Invoice INV-2001 generated' },
      { actorName: 'System', entityType: 'Payment', action: 'PAYMENT_RECORDED', message: 'Payment recorded for INV-2001' },
      { actorName: 'Sam Sales', entityType: 'Quotation', action: 'QUOTATION_SUBMITTED', message: 'Q-1003 submitted for approval' },
    ],
  });

  console.log('[seed] Seeded users, products, customers, quotations, invoices, activity.');
  console.log(`[seed] Login: admin@dealflow.test / password123 (also sam@, morgan@).`);
  void admin;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
