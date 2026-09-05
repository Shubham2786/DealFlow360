import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface QuotationLineInput {
  productId: string;
  qty: number;
  unitPrice?: number;
  discountPct?: number;
}

export interface CreateQuotationInput {
  customerId: string;
  salespersonId?: string;
  discountPct?: number;
  expiresAt?: string;
  lines: QuotationLineInput[];
}

@Injectable()
export class QuotationsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.quotation.findMany({
      orderBy: { createdAt: 'desc' },
      include: { customer: true, salesperson: { select: { id: true, name: true } } },
    });
  }

  async get(id: string) {
    const quotation = await this.prisma.quotation.findUnique({
      where: { id },
      include: {
        customer: true,
        salesperson: { select: { id: true, name: true } },
        lines: { include: { product: true } },
        invoices: true,
      },
    });
    if (!quotation) throw new NotFoundException(`Quotation ${id} not found`);
    return quotation;
  }

  private async nextNumber(): Promise<string> {
    const count = await this.prisma.quotation.count();
    return `Q-${1000 + count + 1}`;
  }

  /**
   * Creates a quotation, computing line totals and quotation-level pricing.
   * Cost is estimated at 70% of base price to derive a demonstrable margin.
   */
  async create(input: CreateQuotationInput) {
    if (!input.lines?.length) {
      throw new BadRequestException('Quotation must contain at least one line');
    }

    const productIds = input.lines.map((l) => l.productId);
    const products = await this.prisma.product.findMany({ where: { id: { in: productIds } } });
    const byId = new Map(products.map((p) => [p.id, p]));

    let subtotal = 0;
    let taxTotal = 0;
    let estimatedCost = 0;
    const headerDiscount = input.discountPct ?? 0;

    const lineData = input.lines.map((line) => {
      const product = byId.get(line.productId);
      if (!product) throw new BadRequestException(`Product ${line.productId} not found`);
      if (line.qty <= 0) throw new BadRequestException('Line quantity must be greater than zero');

      const unitPrice = line.unitPrice ?? Number(product.basePrice);
      const lineDiscount = line.discountPct ?? 0;
      const gross = unitPrice * line.qty;
      const afterLineDiscount = gross * (1 - lineDiscount / 100);
      const taxRate = Number(product.taxRate);

      subtotal += afterLineDiscount;
      estimatedCost += Number(product.basePrice) * line.qty * 0.7;

      return {
        productId: product.id,
        qty: line.qty,
        unitPrice,
        discountPct: lineDiscount,
        taxRate,
        lineTotal: afterLineDiscount,
      };
    });

    const discountTotal = subtotal * (headerDiscount / 100);
    const afterHeaderDiscount = subtotal - discountTotal;
    // Tax computed on the discounted subtotal using a blended average of line tax rates.
    const blendedTax =
      lineData.reduce((acc, l) => acc + l.taxRate, 0) / (lineData.length || 1);
    taxTotal = afterHeaderDiscount * (blendedTax / 100);
    const total = afterHeaderDiscount + taxTotal;
    const marginPct = total > 0 ? ((afterHeaderDiscount - estimatedCost) / afterHeaderDiscount) * 100 : 0;

    const number = await this.nextNumber();

    return this.prisma.quotation.create({
      data: {
        number,
        customerId: input.customerId,
        salespersonId: input.salespersonId,
        discountPct: headerDiscount,
        subtotal,
        discountTotal,
        taxTotal,
        total,
        marginPct: Number(marginPct.toFixed(2)),
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        lines: { create: lineData },
      },
      include: { lines: true },
    });
  }
}
