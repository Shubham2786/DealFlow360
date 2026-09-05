import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InvoiceStatus, QuotationStatus } from '@dealflow/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { DealStateMachine } from '../quotations/deal-state-machine';

type Actor = { id?: string; name?: string };

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: DealStateMachine,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.prisma.invoice.findMany({
      orderBy: { createdAt: 'desc' },
      include: { customer: true, quotation: { select: { id: true, number: true } } },
    });
  }

  async get(id: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: {
        customer: true,
        quotation: { select: { id: true, number: true } },
        lines: true,
        payments: { orderBy: { receivedAt: 'desc' } },
      },
    });
    if (!invoice) throw new NotFoundException(`Invoice ${id} not found`);
    return invoice;
  }

  private async nextNumber(): Promise<string> {
    const count = await this.prisma.invoice.count();
    return `INV-${3000 + count + 1}`;
  }

  /** Generate an invoice from a fulfilled quotation (GST/INR). Idempotent per quotation. */
  async generateFromQuotation(quotationId: string, actor: Actor) {
    const quote = await this.prisma.quotation.findUnique({
      where: { id: quotationId },
      include: { lines: { include: { product: true } }, invoices: true },
    });
    if (!quote) throw new NotFoundException(`Quotation ${quotationId} not found`);
    if (quote.invoices.length > 0) return this.get(quote.invoices[0].id); // idempotent

    const billable: QuotationStatus[] = [
      QuotationStatus.FULFILLED,
      QuotationStatus.PARTIALLY_FULFILLED,
    ];
    if (!billable.includes(quote.status as QuotationStatus)) {
      throw new ConflictException('Only fulfilled deals can be invoiced');
    }

    const netSubtotal = Number(quote.subtotal) - Number(quote.discountTotal);
    const number = await this.nextNumber();

    const invoice = await this.prisma.$transaction(async (tx) => {
      const created = await tx.invoice.create({
        data: {
          number,
          customerId: quote.customerId,
          quotationId,
          status: InvoiceStatus.ISSUED,
          issueDate: new Date(),
          dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          paymentTerms: 'Net 30',
          subtotal: netSubtotal,
          gstTotal: quote.taxTotal,
          total: quote.total,
          lines: {
            create: quote.lines.map((l) => ({
              description: l.product.name,
              qty: l.qty,
              unitPrice: l.unitPrice,
              gstRate: l.taxRate,
              lineTotal: l.lineTotal,
            })),
          },
        },
      });

      // Lifecycle: FULFILLED → BILLING → INVOICED
      let status = quote.status as QuotationStatus;
      if (this.stateMachine.canTransition(status, QuotationStatus.BILLING)) {
        await tx.quotation.update({ where: { id: quotationId }, data: { status: QuotationStatus.BILLING } });
        status = QuotationStatus.BILLING;
      }
      if (this.stateMachine.canTransition(status, QuotationStatus.INVOICED)) {
        await tx.quotation.update({ where: { id: quotationId }, data: { status: QuotationStatus.INVOICED } });
      }
      return created;
    });

    await this.audit.record({
      actorId: actor.id,
      actorName: actor.name,
      entityType: 'Invoice',
      entityId: invoice.id,
      action: 'INVOICE_GENERATED',
      message: `${number} generated from ${quote.number}`,
    });
    return this.get(invoice.id);
  }

  /** Record a payment; updates status and, when fully paid, completes the deal. */
  async recordPayment(
    invoiceId: string,
    input: { amount: number; method?: string; reference?: string },
    actor: Actor,
  ) {
    if (input.amount <= 0) throw new BadRequestException('Payment amount must be greater than zero');
    const invoice = await this.get(invoiceId);
    if (invoice.status === InvoiceStatus.CANCELLED) throw new ConflictException('Invoice is cancelled');
    if (invoice.status === InvoiceStatus.PAID) throw new ConflictException('Invoice is already paid');

    const newPaid = Number(invoice.paidAmount) + input.amount;
    const total = Number(invoice.total);
    if (newPaid > total + 0.01) {
      throw new BadRequestException(`Payment exceeds outstanding balance (₹${(total - Number(invoice.paidAmount)).toFixed(2)})`);
    }
    const fullyPaid = newPaid >= total - 0.01;

    await this.prisma.$transaction(async (tx) => {
      await tx.payment.create({
        data: {
          invoiceId,
          amount: input.amount,
          method: input.method ?? 'UPI',
          reference: input.reference,
        },
      });
      await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          paidAmount: newPaid,
          status: fullyPaid ? InvoiceStatus.PAID : InvoiceStatus.PARTIALLY_PAID,
        },
      });

      if (fullyPaid && invoice.quotationId) {
        const q = await tx.quotation.findUnique({ where: { id: invoice.quotationId } });
        if (q) {
          let status = q.status as QuotationStatus;
          if (this.stateMachine.canTransition(status, QuotationStatus.PAID)) {
            await tx.quotation.update({ where: { id: q.id }, data: { status: QuotationStatus.PAID } });
            status = QuotationStatus.PAID;
          }
          if (this.stateMachine.canTransition(status, QuotationStatus.COMPLETED)) {
            await tx.quotation.update({ where: { id: q.id }, data: { status: QuotationStatus.COMPLETED } });
          }
        }
      }
    });

    await this.audit.record({
      actorId: actor.id,
      actorName: actor.name,
      entityType: 'Invoice',
      entityId: invoiceId,
      action: 'PAYMENT_RECORDED',
      message: `₹${input.amount} recorded on ${invoice.number}${fullyPaid ? ' (paid in full)' : ''}`,
    });
    return this.get(invoiceId);
  }

  async cancel(invoiceId: string, actor: Actor) {
    const invoice = await this.get(invoiceId);
    if (invoice.status === InvoiceStatus.PAID) throw new ConflictException('Cannot cancel a paid invoice');
    await this.prisma.invoice.update({ where: { id: invoiceId }, data: { status: InvoiceStatus.CANCELLED } });
    await this.audit.record({
      actorId: actor.id,
      actorName: actor.name,
      entityType: 'Invoice',
      entityId: invoiceId,
      action: 'INVOICE_CANCELLED',
      message: `${invoice.number} cancelled`,
    });
    return this.get(invoiceId);
  }
}
