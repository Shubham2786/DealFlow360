import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AnalyticsController } from './analytics.controller';
import { DashboardService } from './dashboard.service';
import { DealHealthService } from './deal-health.service';

@Module({
  imports: [AuthModule],
  controllers: [AnalyticsController],
  providers: [DashboardService, DealHealthService],
})
export class AnalyticsModule {}
