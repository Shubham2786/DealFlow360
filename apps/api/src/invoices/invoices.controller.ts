import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('invoices')
@UseGuards(JwtAuthGuard)
export class InvoicesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list() {
    return this.prisma.invoice.findMany({
      orderBy: { createdAt: 'desc' },
      include: { customer: true },
    });
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.prisma.invoice.findUnique({
      where: { id },
      include: { customer: true, quotation: true },
    });
  }
}
