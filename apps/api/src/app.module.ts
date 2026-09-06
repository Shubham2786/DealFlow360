import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { HealthController } from './health/health.controller';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { AuditModule } from './audit/audit.module';
import { CustomersModule } from './customers/customers.module';
import { ProductsModule } from './products/products.module';
import { QuotationsModule } from './quotations/quotations.module';
import { ApprovalsModule } from './approvals/approvals.module';
import { NegotiationModule } from './negotiation/negotiation.module';
import { FulfillmentModule } from './fulfillment/fulfillment.module';
import { InvoicesModule } from './invoices/invoices.module';
import { AnalyticsModule } from './analytics/analytics.module';

import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { AppConfigModule } from './config/config.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AppConfigModule,
    PrismaModule,
    AuditModule,
    AuthModule,
    UsersModule,
    CustomersModule,
    ProductsModule,
    QuotationsModule,
    ApprovalsModule,
    NegotiationModule,
    FulfillmentModule,
    InvoicesModule,
    AnalyticsModule,
    SubscriptionsModule,
  ],
  controllers: [HealthController],
})
export class AppModule { }
