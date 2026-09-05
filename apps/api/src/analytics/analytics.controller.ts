import { Controller, ForbiddenException, Get, UseGuards } from '@nestjs/common';
import { Permission, UserRole } from '@dealflow/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, type AuthUser } from '../auth/decorators/current-user.decorator';
import { DashboardService } from './dashboard.service';
import { DealHealthService } from './deal-health.service';
import { ReportingService } from './reporting.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  constructor(
    private readonly dashboard: DashboardService,
    private readonly dealHealth: DealHealthService,
    private readonly reporting: ReportingService,
  ) { }

  @Get('dashboard/metrics')
  metrics(@CurrentUser() user: AuthUser) {
    return this.dashboard.metrics(user);
  }

  @Get('deal-health')
  health(@CurrentUser() user: AuthUser) {
    if (user.role === UserRole.CUSTOMER) {
      throw new ForbiddenException('Deal health is for internal sales and operations personnel');
    }
    return this.dealHealth.overview();
  }

  @Get('reports')
  reports(@CurrentUser() user: AuthUser) {
    // Any-of authorization: managers (team view) OR finance/admin (report generate).
    const allowed =
      user.role === UserRole.ADMIN ||
      user.permissions.includes(Permission.FINANCE_REPORT_GENERATE) ||
      user.permissions.includes(Permission.TEAM_VIEW);
    if (!allowed) throw new ForbiddenException('You do not have access to reports');
    return this.reporting.report();
  }
}
