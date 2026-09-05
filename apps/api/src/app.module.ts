import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { HealthController } from './health/health.controller';
import { AuthModule } from './auth/auth.module';
import { AuditModule } from './audit/audit.module';
import { CustomersModule } from './customers/customers.module';
import { ProductsModule } from './products/products.module';
import { QuotationsModule } from './quotations/quotations.module';
import { ApprovalsModule } from './approvals/approvals.module';
import { FulfillmentModule } from './fulfillment/fulfillment.module';
import { InvoicesModule } from './invoices/invoices.module';
import { AnalyticsModule } from './analytics/analytics.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuditModule,
    AuthModule,
    CustomersModule,
    ProductsModule,
    QuotationsModule,
    ApprovalsModule,
    FulfillmentModule,
    InvoicesModule,
    AnalyticsModule,
  ],
  controllers: [HealthController],
})
export class AppModule { }
