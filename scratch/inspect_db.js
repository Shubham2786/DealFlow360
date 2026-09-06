const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: "postgresql://dealflow:dealflow@localhost:5433/dealflow360?schema=public"
    }
  }
});

async function main() {
  const quote = await prisma.quotation.findFirst({
    where: { number: 'Q-1011' },
    include: {
      invoices: true,
      approvalRequests: { include: { steps: true } },
      fulfillment: true,
      lines: true,
    },
  });
  console.log('Quote:', JSON.stringify(quote, null, 2));

  const allQuotes = await prisma.quotation.findMany({
    select: { id: true, number: true, status: true }
  });
  console.log('All quotes:', allQuotes);

  const allInvoices = await prisma.invoice.findMany({
    select: { id: true, number: true, status: true, quotationId: true }
  });
  console.log('All invoices:', allInvoices);
}

main().catch(console.error).finally(() => prisma.$disconnect());
