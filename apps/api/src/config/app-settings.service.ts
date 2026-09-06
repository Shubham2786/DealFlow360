import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export const DEFAULT_SETTINGS: Record<string, string> = {
  company_name: 'DealFlow360 Technologies Pvt Ltd',
  currency: 'INR',
  currency_symbol: '₹',
  default_gst_rate: '18',
  default_payment_terms_days: '30',
  default_payment_terms: 'Net 30',
  discount_auto_approve_threshold_pct: '5',
  discount_manager_threshold_pct: '10',
  discount_finance_threshold_pct: '15',
  discount_exec_threshold_pct: '25',
  deal_value_finance_threshold: '500000',
  deal_value_exec_threshold: '1500000',
  min_margin_threshold_pct: '15',
  healthy_margin_threshold_pct: '25',
  support_email: 'support@dealflow360.com',
  quotation_prefix: 'Q-',
  invoice_prefix: 'INV-',
  subscription_prefix: 'SUB-',
  category_ceilings_json: JSON.stringify({
    HARDWARE: { STANDARD: 5, SMB: 8, ENTERPRISE: 12, STRATEGIC: 15 },
    SERVICES: { STANDARD: 10, SMB: 15, ENTERPRISE: 20, STRATEGIC: 25 },
    SUBSCRIPTIONS: { STANDARD: 8, SMB: 12, ENTERPRISE: 15, STRATEGIC: 20 },
    ACCESSORIES: { STANDARD: 10, SMB: 15, ENTERPRISE: 20, STRATEGIC: 25 },
  }),
};

@Injectable()
export class AppSettingsService {
  private cache: Map<string, string> = new Map();
  private cacheExpiry = 0;
  private readonly CACHE_TTL_MS = 60_000; // 1 minute in-memory cache

  constructor(private readonly prisma: PrismaService) {}

  private async refreshCache(): Promise<void> {
    const now = Date.now();
    if (this.cache.size > 0 && now < this.cacheExpiry) return;

    const dbSettings = await this.prisma.appSetting.findMany();
    const map = new Map<string, string>();

    // Seed defaults first
    for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
      map.set(k, v);
    }
    // Overlay database values
    for (const item of dbSettings) {
      map.set(item.key, item.value);
    }

    this.cache = map;
    this.cacheExpiry = now + this.CACHE_TTL_MS;
  }

  async get(key: string, defaultValue?: string): Promise<string> {
    await this.refreshCache();
    return this.cache.get(key) ?? defaultValue ?? DEFAULT_SETTINGS[key] ?? '';
  }

  async getNumber(key: string, defaultValue: number): Promise<number> {
    const val = await this.get(key);
    const parsed = Number(val);
    return Number.isFinite(parsed) ? parsed : defaultValue;
  }

  async getJSON<T>(key: string, defaultValue: T): Promise<T> {
    const val = await this.get(key);
    if (!val) return defaultValue;
    try {
      return JSON.parse(val) as T;
    } catch {
      return defaultValue;
    }
  }

  async getAll(): Promise<Record<string, string>> {
    await this.refreshCache();
    const result: Record<string, string> = {};
    for (const [k, v] of this.cache.entries()) {
      result[k] = v;
    }
    return result;
  }

  async setMany(settings: Record<string, string>): Promise<void> {
    for (const [key, value] of Object.entries(settings)) {
      await this.prisma.appSetting.upsert({
        where: { key },
        create: { key, value: String(value) },
        update: { value: String(value) },
      });
    }
    this.cacheExpiry = 0; // Invalidate cache immediately
    await this.refreshCache();
  }
}
