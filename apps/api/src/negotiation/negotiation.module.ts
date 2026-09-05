import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { QuotationsModule } from '../quotations/quotations.module';
import { NegotiationController } from './negotiation.controller';
import { PortalController } from './portal.controller';
import { NegotiationService } from './negotiation.service';

@Module({
  imports: [AuthModule, QuotationsModule],
  controllers: [NegotiationController, PortalController],
  providers: [NegotiationService],
})
export class NegotiationModule {}
