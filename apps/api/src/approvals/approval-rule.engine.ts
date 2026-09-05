import { Injectable } from '@nestjs/common';
import { UserRole } from '@dealflow/shared';

export interface DealFacts {
  discountPct: number;
  marginPct: number;
  total: number;
}

/**
 * Determines the required approval chain for a deal from its commercial facts.
 * Thresholds are constants here for v1; the Admin module (ADR-0012) will make them
 * configuration-driven without changing this engine's interface.
 */
@Injectable()
export class ApprovalRuleEngine {
  // Configurable thresholds.
  private readonly AUTO_APPROVE_DISCOUNT = 5; // <= this and healthy margin => no approval
  private readonly HEALTHY_MARGIN = 20;
  private readonly FINANCE_DISCOUNT = 10; // > this needs finance
  private readonly FINANCE_MARGIN = 15; // < this needs finance
  private readonly FINANCE_VALUE = 200000; // ₹2 lakh
  private readonly EXEC_DISCOUNT = 20;
  private readonly EXEC_VALUE = 1000000; // ₹10 lakh

  /** Returns ordered approver roles. Empty array means the deal can auto-approve. */
  computeChain(facts: DealFacts): { chain: UserRole[]; reasons: string[] } {
    const reasons: string[] = [];

    if (facts.discountPct <= this.AUTO_APPROVE_DISCOUNT && facts.marginPct >= this.HEALTHY_MARGIN) {
      return { chain: [], reasons: ['Within salesperson authority — auto-approved'] };
    }

    const chain: UserRole[] = [UserRole.SALES_MANAGER];
    reasons.push(`Discount ${facts.discountPct}% / margin ${facts.marginPct}% requires manager review`);

    if (
      facts.discountPct > this.FINANCE_DISCOUNT ||
      facts.marginPct < this.FINANCE_MARGIN ||
      facts.total > this.FINANCE_VALUE
    ) {
      chain.push(UserRole.FINANCE);
      reasons.push('Finance approval required (discount/margin/value threshold)');
    }

    if (facts.discountPct > this.EXEC_DISCOUNT || facts.total > this.EXEC_VALUE) {
      chain.push(UserRole.ADMIN);
      reasons.push('Executive approval required (high discount/value)');
    }

    return { chain, reasons };
  }
}
