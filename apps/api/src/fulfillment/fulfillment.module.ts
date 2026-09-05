import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { QuotationsModule } from '../quotations/quotations.module';
import { FulfillmentController } from './fulfillment.controller';
import { FulfillmentService } from './fulfillment.service';
import { AllocationEngine } from './allocation.engine';

@Module({
  imports: [AuthModule, QuotationsModule],
  controllers: [FulfillmentController],
  providers: [FulfillmentService, AllocationEngine],
  exports: [FulfillmentService],
})
export class FulfillmentModule {}
