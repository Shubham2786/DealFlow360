import { Injectable, Optional } from '@nestjs/common';
import { UserRole } from '@dealflow/shared';
import { AppSettingsService } from '../config/app-settings.service';

export interface DealLineFact {
  productId?: string;
  category?: string;
  basePrice?: number;
  costPrice?: number;
  unitPrice?: number;
  discountPct?: number;
  qty?: number;
  lineTotal?: number;
}

export interface DealFacts {
  discountPct: number;
  marginPct: number;
  total: number;
  paymentTerms?: string;
  customerSegment?: string; // STANDARD | SMB | ENTERPRISE | STRATEGIC
  lines?: DealLineFact[];
}

export interface LineAssessment {
  productId?: string;
  category: string;
  effectiveDiscountPct: number;
  ceilingDiscountPct: number;
  exceeded: boolean;
  excessDiscountPct: number;
  unitPriceBypassDetected: boolean;
}

export interface ApprovalChainResult {
  chain: UserRole[];
  reasons: string[];
  blendedRiskScore: number;
  lineAssessments: LineAssessment[];
}

export interface DynamicPolicyConfig {
  autoApproveDiscount: number;
  healthyMargin: number;
  financeDiscount: number;
  financeMargin: number;
  financeValue: number;
  execDiscount: number;
  execValue: number;
  tierCategoryCeilings: Record<string, Record<string, number>>;
}

const DEFAULT_CATEGORY_CEILINGS: Record<string, Record<string, number>> = {
  HARDWARE: { STANDARD: 5, SMB: 8, ENTERPRISE: 12, STRATEGIC: 15 },
  SERVICES: { STANDARD: 10, SMB: 15, ENTERPRISE: 20, STRATEGIC: 25 },
  SUBSCRIPTIONS: { STANDARD: 8, SMB: 12, ENTERPRISE: 15, STRATEGIC: 20 },
  ACCESSORIES: { STANDARD: 10, SMB: 15, ENTERPRISE: 20, STRATEGIC: 25 },
};

/**
 * Determines the required approval chain for a deal from its commercial facts.
 * Evaluates header discounts, margins, values, per-line category ceilings, customer segment tiers,
 * and detects hidden discounts passed via unitPrice markdown.
 *
 * Backed by AppSettingsService for 100% dynamic, database-driven thresholds.
 */
@Injectable()
export class ApprovalRuleEngine {
  constructor(@Optional() private readonly appSettings?: AppSettingsService) {}

  /** Loads policy thresholds dynamically from the database configuration with fallback defaults. */
  async loadDynamicPolicy(): Promise<DynamicPolicyConfig> {
    if (!this.appSettings) {
      return {
        autoApproveDiscount: 5,
        healthyMargin: 20,
        financeDiscount: 10,
        financeMargin: 15,
        financeValue: 200000,
        execDiscount: 20,
        execValue: 1000000,
        tierCategoryCeilings: DEFAULT_CATEGORY_CEILINGS,
      };
    }

    const [
      autoApproveDiscount,
      financeDiscount,
      execDiscount,
      healthyMargin,
      financeMargin,
      financeValue,
      execValue,
      customCeilings,
    ] = await Promise.all([
      this.appSettings.getNumber('discount_auto_approve_threshold_pct', 5),
      this.appSettings.getNumber('discount_finance_threshold_pct', 10),
      this.appSettings.getNumber('discount_exec_threshold_pct', 20),
      this.appSettings.getNumber('healthy_margin_threshold_pct', 20),
      this.appSettings.getNumber('min_margin_threshold_pct', 15),
      this.appSettings.getNumber('deal_value_finance_threshold', 200000),
      this.appSettings.getNumber('deal_value_exec_threshold', 1000000),
      this.appSettings.getJSON<Record<string, Record<string, number>>>('category_ceilings_json', DEFAULT_CATEGORY_CEILINGS),
    ]);

    return {
      autoApproveDiscount,
      healthyMargin,
      financeDiscount,
      financeMargin,
      financeValue,
      execDiscount,
      execValue,
      tierCategoryCeilings: Object.keys(customCeilings || {}).length > 0 ? customCeilings : DEFAULT_CATEGORY_CEILINGS,
    };
  }

  private getCategoryCeiling(
    category: string | undefined,
    tier: string,
    ceilingsMap: Record<string, Record<string, number>>,
  ): number {
    const normCategory = (category ?? 'HARDWARE').toUpperCase();
    const catMap =
      ceilingsMap[normCategory] ??
      (normCategory.includes('SERVICE')
        ? (ceilingsMap.SERVICES ?? DEFAULT_CATEGORY_CEILINGS.SERVICES)
        : normCategory.includes('SUB')
          ? (ceilingsMap.SUBSCRIPTIONS ?? DEFAULT_CATEGORY_CEILINGS.SUBSCRIPTIONS)
          : (ceilingsMap.HARDWARE ?? DEFAULT_CATEGORY_CEILINGS.HARDWARE));

    const normTier = (tier ?? 'STANDARD').toUpperCase();
    return catMap[normTier] ?? catMap.STANDARD ?? 5;
  }

  /** Dynamic evaluation entry point: loads active database settings and runs evaluation. */
  async evaluate(facts: DealFacts): Promise<ApprovalChainResult> {
    const policy = await this.loadDynamicPolicy();
    return this.computeChain(facts, policy);
  }

  /**
   * Evaluates deal facts against policy and computes an ordered approval chain and 0–100 blended risk score.
   */
  computeChain(facts: DealFacts, policyOverride?: Partial<DynamicPolicyConfig>): ApprovalChainResult {
    const policy: DynamicPolicyConfig = {
      autoApproveDiscount: policyOverride?.autoApproveDiscount ?? 5,
      healthyMargin: policyOverride?.healthyMargin ?? 20,
      financeDiscount: policyOverride?.financeDiscount ?? 10,
      financeMargin: policyOverride?.financeMargin ?? 15,
      financeValue: policyOverride?.financeValue ?? 200000,
      execDiscount: policyOverride?.execDiscount ?? 20,
      execValue: policyOverride?.execValue ?? 1000000,
      tierCategoryCeilings: policyOverride?.tierCategoryCeilings ?? DEFAULT_CATEGORY_CEILINGS,
    };

    const reasons: string[] = [];
    const tier = (facts.customerSegment as string) ?? 'STANDARD';
    const lines = facts.lines ?? [];

    let totalLineValue = 0;
    let weightedExcessDiscount = 0;
    let hasLineExcess = false;
    let anyBypassDetected = false;

    const lineAssessments: LineAssessment[] = lines.map((l) => {
      const category = l.category ?? 'Hardware';
      const ceiling = this.getCategoryCeiling(category, tier, policy.tierCategoryCeilings);
      const basePrice = Number(l.basePrice ?? 0);
      const unitPrice = Number(l.unitPrice ?? basePrice);
      const explicitLineDiscount = Number(l.discountPct ?? 0);

      // Detect unit price markdown bypass
      let unitPriceDiscountPct = 0;
      let unitPriceBypassDetected = false;
      if (basePrice > 0 && unitPrice < basePrice) {
        unitPriceDiscountPct = ((basePrice - unitPrice) / basePrice) * 100;
        unitPriceBypassDetected = true;
        anyBypassDetected = true;
      }

      // Total effective discount combining unit price markdown, line discount and header discount
      const effectiveUnitPrice = unitPrice * (1 - explicitLineDiscount / 100);
      const effectiveLineDiscountPct =
        basePrice > 0
          ? ((basePrice - effectiveUnitPrice) / basePrice) * 100
          : explicitLineDiscount;

      // Combined line + header discount
      const totalEffectiveDiscountPct = Number(
        (
          effectiveLineDiscountPct +
          facts.discountPct * (1 - effectiveLineDiscountPct / 100)
        ).toFixed(2),
      );

      const excessDiscountPct = Math.max(0, totalEffectiveDiscountPct - ceiling);
      if (excessDiscountPct > 0) hasLineExcess = true;

      const lineValue = l.lineTotal ?? (unitPrice * (l.qty ?? 1));
      totalLineValue += lineValue;
      weightedExcessDiscount += excessDiscountPct * lineValue;

      return {
        productId: l.productId,
        category,
        effectiveDiscountPct: totalEffectiveDiscountPct,
        ceilingDiscountPct: ceiling,
        exceeded: excessDiscountPct > 0,
        excessDiscountPct: Number(excessDiscountPct.toFixed(2)),
        unitPriceBypassDetected,
      };
    });

    const avgWeightedExcess =
      totalLineValue > 0 ? weightedExcessDiscount / totalLineValue : Math.max(0, facts.discountPct - policy.autoApproveDiscount);

    // Blended Risk Score calculation (0 to 100)
    // 1. Excess discount risk (up to 50 pts)
    const discountRisk = Math.min(50, avgWeightedExcess * 2.5);
    // 2. Margin risk (up to 30 pts)
    const marginRisk = facts.marginPct < policy.healthyMargin
      ? Math.min(30, (policy.healthyMargin - facts.marginPct) * 1.5)
      : 0;
    // 3. Deal value risk (up to 20 pts)
    const valueRisk = facts.total > policy.execValue ? 20 : facts.total > policy.financeValue ? 10 : 0;

    const blendedRiskScore = Math.min(
      100,
      Math.max(0, Math.round(discountRisk + marginRisk + valueRisk)),
    );

    if (anyBypassDetected) {
      reasons.push('Unit price discount detected below base price');
    }

    if (hasLineExcess) {
      const breaches = lineAssessments.filter((a) => a.exceeded);
      reasons.push(
        `${breaches.length} line(s) exceed ${tier} category discount ceiling`,
      );
    }

    // Auto-approve condition:
    // Risk score <= 5, header discount <= autoApproveDiscount, no line ceiling breaches, and healthy margin
    if (
      blendedRiskScore <= 5 &&
      facts.discountPct <= policy.autoApproveDiscount &&
      !hasLineExcess &&
      !anyBypassDetected &&
      facts.marginPct >= policy.healthyMargin
    ) {
      return {
        chain: [],
        reasons: ['Within salesperson authority — auto-approved'],
        blendedRiskScore,
        lineAssessments,
      };
    }

    const chain: UserRole[] = [UserRole.MANAGER];
    reasons.push(
      `Risk score ${blendedRiskScore}/100: requires manager review`,
    );

    if (
      blendedRiskScore >= 30 ||
      facts.discountPct > policy.financeDiscount ||
      facts.marginPct < policy.financeMargin ||
      facts.total > policy.financeValue ||
      hasLineExcess
    ) {
      chain.push(UserRole.FINANCE);
      reasons.push('Finance approval required (margin/discount/risk threshold)');
    }

    if (
      blendedRiskScore >= 70 ||
      facts.discountPct > policy.execDiscount ||
      facts.total > policy.execValue
    ) {
      chain.push(UserRole.ADMIN);
      reasons.push('Executive approval required (high discount/value/risk)');
    }

    return {
      chain,
      reasons,
      blendedRiskScore,
      lineAssessments,
    };
  }
}
