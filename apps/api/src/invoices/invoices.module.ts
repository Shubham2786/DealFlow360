import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { QuotationsModule } from '../quotations/quotations.module';
import { InvoicesController } from './invoices.controller';
import { BillingService } from './billing.service';

@Module({
  imports: [AuthModule, QuotationsModule],
  controllers: [InvoicesController],
  providers: [BillingService],
})
export class InvoicesModule { }
