import { forwardRef, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { QuotationsModule } from '../quotations/quotations.module';
import { ApprovalsController } from './approvals.controller';
import { ApprovalsService } from './approvals.service';
import { ApprovalRuleEngine } from './approval-rule.engine';

@Module({
  imports: [AuthModule, forwardRef(() => QuotationsModule)],
  controllers: [ApprovalsController],
  providers: [ApprovalsService, ApprovalRuleEngine],
  exports: [ApprovalsService],
})
export class ApprovalsModule { }
