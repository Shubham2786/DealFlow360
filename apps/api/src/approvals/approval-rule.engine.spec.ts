import { CustomerSegment, UserRole } from '@dealflow/shared';
import { ApprovalRuleEngine } from './approval-rule.engine';

describe('ApprovalRuleEngine', () => {
  const engine = new ApprovalRuleEngine();

  it('auto-approves low discount + healthy margin (no chain)', () => {
    const { chain, blendedRiskScore } = engine.computeChain({ discountPct: 3, marginPct: 30, total: 50000 });
    expect(chain).toEqual([]);
    expect(blendedRiskScore).toBeLessThanOrEqual(5);
  });

  it('requires manager for a modest discount', () => {
    const { chain } = engine.computeChain({ discountPct: 8, marginPct: 25, total: 100000 });
    expect(chain).toEqual([UserRole.MANAGER]);
  });

  it('adds finance for high discount / low margin / large value', () => {
    const { chain } = engine.computeChain({ discountPct: 12, marginPct: 12, total: 300000 });
    expect(chain).toContain(UserRole.MANAGER);
    expect(chain).toContain(UserRole.FINANCE);
  });

  it('adds executive (admin) for very high value', () => {
    const { chain } = engine.computeChain({ discountPct: 25, marginPct: 20, total: 2000000 });
    expect(chain).toContain(UserRole.ADMIN);
  });

  it('detects unit price markdown bypass and flags risk', () => {
    // Rep marks unitPrice down from 100000 to 50000 with 0% explicit discount
    const { chain, reasons, lineAssessments } = engine.computeChain({
      discountPct: 0,
      marginPct: 25,
      total: 50000,
      customerSegment: CustomerSegment.STANDARD,
      lines: [
        {
          productId: 'prod-1',
          category: 'Hardware',
          basePrice: 100000,
          unitPrice: 50000,
          discountPct: 0,
          qty: 1,
          lineTotal: 50000,
        },
      ],
    });

    expect(lineAssessments[0].unitPriceBypassDetected).toBe(true);
    expect(lineAssessments[0].exceeded).toBe(true);
    expect(reasons).toContain('Unit price discount detected below base price');
    expect(chain).toContain(UserRole.MANAGER);
    expect(chain).toContain(UserRole.FINANCE);
  });

  it('honors higher discount ceilings for STRATEGIC tier customers', () => {
    // 12% discount on Hardware for STANDARD breaches ceiling (5%), but is within STRATEGIC ceiling (15%)
    const standardRes = engine.computeChain({
      discountPct: 0,
      marginPct: 25,
      total: 88000,
      customerSegment: CustomerSegment.STANDARD,
      lines: [
        {
          productId: 'prod-1',
          category: 'Hardware',
          basePrice: 100000,
          unitPrice: 100000,
          discountPct: 12,
          qty: 1,
          lineTotal: 88000,
        },
      ],
    });
    expect(standardRes.lineAssessments[0].exceeded).toBe(true);

    const strategicRes = engine.computeChain({
      discountPct: 0,
      marginPct: 25,
      total: 88000,
      customerSegment: CustomerSegment.STRATEGIC,
      lines: [
        {
          productId: 'prod-1',
          category: 'Hardware',
          basePrice: 100000,
          unitPrice: 100000,
          discountPct: 12,
          qty: 1,
          lineTotal: 88000,
        },
      ],
    });
    expect(strategicRes.lineAssessments[0].exceeded).toBe(false);
  });
});
