import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { Permission } from '@dealflow/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CurrentUser, type AuthUser } from '../auth/decorators/current-user.decorator';

export interface UpdateConfigDto {
  settings: Record<string, string>;
}

const DEFAULT_SETTINGS: Record<string, string> = {
  company_name: 'DealFlow360 Technologies Pvt Ltd',
  currency: 'INR',
  currency_symbol: '₹',
  default_gst_rate: '18',
  default_payment_terms: 'Net 30',
  discount_manager_threshold_pct: '10',
  discount_finance_threshold_pct: '15',
  deal_value_finance_threshold: '1000000',
  min_margin_threshold_pct: '15',
  support_email: 'support@dealflow360.com',
};

@Controller('admin/config')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ConfigController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions(Permission.USER_MANAGE)
  async getConfig() {
    const dbSettings = await this.prisma.appSetting.findMany();
    const settings: Record<string, string> = { ...DEFAULT_SETTINGS };

    for (const item of dbSettings) {
      settings[item.key] = item.value;
    }

    return {
      settings,
      system: {
        environment: process.env.NODE_ENV || 'development',
        databaseEngine: 'PostgreSQL 16',
        localization: 'India (en-IN, INR, GST)',
        rbacRoles: ['USER', 'MANAGER', 'FINANCE', 'ADMIN'],
      },
      approvalPolicy: {
        level1: {
          role: 'MANAGER',
          triggers: [
            `Discount > ${settings.discount_manager_threshold_pct}%`,
            `Deal total > ₹${(Number(settings.deal_value_finance_threshold) / 2).toLocaleString('en-IN')}`,
          ],
        },
        level2: {
          role: 'FINANCE',
          triggers: [
            `Discount > ${settings.discount_finance_threshold_pct}%`,
            `Deal total > ₹${Number(settings.deal_value_finance_threshold).toLocaleString('en-IN')}`,
            `Estimated margin < ${settings.min_margin_threshold_pct}%`,
            'Non-standard payment terms',
          ],
        },
      },
    };
  }

  @Patch()
  @RequirePermissions(Permission.USER_MANAGE)
  async updateConfig(@Body() body: UpdateConfigDto, @CurrentUser() user: AuthUser) {
    const entries = Object.entries(body.settings || {});
    for (const [key, value] of entries) {
      await this.prisma.appSetting.upsert({
        where: { key },
        create: { key, value: String(value) },
        update: { value: String(value) },
      });
    }

    await this.audit.record({
      actorId: user.id,
      actorName: user.name,
      entityType: 'SystemConfig',
      action: 'CONFIG_UPDATED',
      message: `Updated system settings: ${Object.keys(body.settings || {}).join(', ')}`,
    });

    return this.getConfig();
  }
}
