import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, type AuthUser } from '../auth/decorators/current-user.decorator';
import { DashboardService } from './dashboard.service';
import { DealHealthService } from './deal-health.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  constructor(
    private readonly dashboard: DashboardService,
    private readonly dealHealth: DealHealthService,
  ) { }

  @Get('dashboard/metrics')
  metrics(@CurrentUser() user: AuthUser) {
    return this.dashboard.metrics(user);
  }

  @Get('deal-health')
  health() {
    return this.dealHealth.overview();
  }
}
