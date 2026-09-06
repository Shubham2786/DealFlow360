import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { IsNotEmpty, IsObject } from 'class-validator';
import { Permission } from '@dealflow/shared';
import { AuditService } from '../audit/audit.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CurrentUser, type AuthUser } from '../auth/decorators/current-user.decorator';
import { AppSettingsService } from '../config/app-settings.service';

export class UpdateConfigDto {
  @IsObject()
  @IsNotEmpty()
  settings!: Record<string, string>;
}

@Controller('admin/config')
export class ConfigController {
  constructor(
    private readonly appSettings: AppSettingsService,
    private readonly audit: AuditService,
  ) {}

  /** Public configuration parameters (safe for external portal & client-side formatters). */
  @Get('public')
  async getPublicConfig() {
    const settings = await this.appSettings.getAll();
    return {
      companyName: settings.company_name,
      currency: settings.currency,
      currencySymbol: settings.currency_symbol,
      defaultPaymentTerms: settings.default_payment_terms,
      defaultPaymentTermsDays: Number(settings.default_payment_terms_days || 30),
      defaultGstRate: Number(settings.default_gst_rate || 18),
      quotationPrefix: settings.quotation_prefix || 'Q-',
      invoicePrefix: settings.invoice_prefix || 'INV-',
    };
  }

  @Get()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.USER_MANAGE)
  async getConfig() {
    const settings = await this.appSettings.getAll();

    return {
      settings,
      system: {
        environment: process.env.NODE_ENV || 'development',
        databaseEngine: 'PostgreSQL 16',
        localization: `${settings.currency} (${settings.currency_symbol}), GST ${settings.default_gst_rate}%`,
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
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.USER_MANAGE)
  async updateConfig(@Body() body: UpdateConfigDto, @CurrentUser() user: AuthUser) {
    if (body.settings && typeof body.settings === 'object') {
      const sanitized: Record<string, string> = {};
      for (const [k, v] of Object.entries(body.settings)) {
        if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
        if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
          sanitized[k] = String(v);
        }
      }
      await this.appSettings.setMany(sanitized);

      await this.audit.record({
        actorId: user.id,
        actorName: user.name,
        entityType: 'SystemConfig',
        action: 'CONFIG_UPDATED',
        message: `Updated system settings: ${Object.keys(sanitized).join(', ')}`,
      });
    }

    return this.getConfig();
  }
}
