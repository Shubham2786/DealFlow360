import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { QuotationsController } from './quotations.controller';
import { QuotationsService } from './quotations.service';
import { DealStateMachine } from './deal-state-machine';

@Module({
  imports: [AuthModule],
  controllers: [QuotationsController],
  providers: [QuotationsService, DealStateMachine],
  exports: [QuotationsService, DealStateMachine],
})
export class QuotationsModule { }
