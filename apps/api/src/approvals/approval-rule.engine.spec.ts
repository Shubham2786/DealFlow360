import { UserRole } from '@dealflow/shared';
import { ApprovalRuleEngine } from './approval-rule.engine';

describe('ApprovalRuleEngine', () => {
  const engine = new ApprovalRuleEngine();

  it('auto-approves low discount + healthy margin (no chain)', () => {
    const { chain } = engine.computeChain({ discountPct: 3, marginPct: 30, total: 50000 });
    expect(chain).toEqual([]);
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
});
