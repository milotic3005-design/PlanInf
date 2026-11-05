import { describe, expect, it } from 'vitest';
import { effectiveFsa, effectiveHsa, fsaForfeit, hdhpIssues, hsaMaxEmployee } from '../accounts';
import { buildPlanContext, evaluateScenario } from '../netCost';
import type { Issue } from '../types';
import { cfg2026, hh, plan } from './fixtures';

describe('HSA rules', () => {
  it('T10: family coverage uses the family limit, minus employer money', () => {
    expect(hsaMaxEmployee(cfg2026, 'family', 40, 1000)).toBe(7750); // 8,750 − 1,000
    const c = buildPlanContext(plan('sample-hdhp'), hh({ coverageTier: 'family', hsaContribution: 9000 }), cfg2026);
    expect(c.employerHsa).toBe(1000);
    expect(c.employeeHsa).toBe(7750);
  });

  it('T11: catch-up at 55+ and employer money; an over-limit amount is capped with a warning', () => {
    expect(hsaMaxEmployee(cfg2026, 'selfOnly', 56, 500)).toBe(4900); // 4,400 + 1,000 − 500
    expect(hsaMaxEmployee(cfg2026, 'selfOnly', 54, 500)).toBe(3900);
    const issues: Issue[] = [];
    expect(effectiveHsa(plan('sample-hdhp'), hh({ age: 56, hsaContribution: 5000 }), cfg2026, issues)).toBe(4900);
    expect(issues.map((i) => i.code)).toEqual(['HSA_OVER_LIMIT']);
  });

  it('a plan marked HSA-eligible that fails the IRS HDHP test gets no HSA and no employer HSA', () => {
    const bad = { ...plan('sample-hdhp'), deductible: { individual: 1500, family: 3000 } };
    // The test uses the column for the coverage you buy: self-only $1,700, family $3,400 (2026).
    expect(hdhpIssues(bad, cfg2026, 'self').map((i) => i.code)).toEqual(['HDHP_DEDUCTIBLE_TOO_LOW']);
    expect(hdhpIssues(bad, cfg2026, 'family').map((i) => i.code)).toEqual(['HDHP_DEDUCTIBLE_TOO_LOW']);
    const c = buildPlanContext(bad, hh(), cfg2026);
    expect([c.employeeHsa, c.employerHsa, c.accountTaxSavings.total]).toEqual([0, 0, 0]);
  });

  it('flags an out-of-pocket max above the HDHP maximum', () => {
    const bad = { ...plan('sample-hdhp'), oopMax: { individual: 9000, family: 12000 } };
    expect(hdhpIssues(bad, cfg2026, 'self').map((i) => i.code)).toContain('HDHP_OOP_TOO_HIGH');
    expect(hdhpIssues(bad, cfg2026, 'family')).toEqual([]); // family max 12,000 is under 17,000
  });

  it('HSA money is ignored on a non-HSA plan', () => {
    const c = buildPlanContext(plan('sample-ppo'), hh({ hsaContribution: 2000 }), cfg2026);
    expect(c.employeeHsa).toBe(0);
    expect(c.account).toBeNull();
  });
});

describe('health FSA rules', () => {
  it('T12: forfeit = election − OOP − carryover, never below 0', () => {
    expect(fsaForfeit(1500, 600, 0)).toBe(900);
    expect(fsaForfeit(1500, 600, 680)).toBe(220);
    expect(fsaForfeit(1500, 2000, 0)).toBe(0);
  });

  it('T12: forfeit flows into net cost (PPO, Low use, $1,500 FSA)', () => {
    const low = { id: 'low' as const, label: 'Low', allowedSpend: 300, copayVisits: 2 };
    const noCarry = evaluateScenario(buildPlanContext(plan('sample-ppo'), hh({ fsaContribution: 1500 }), cfg2026), low, hh(), cfg2026);
    expect(noCarry.fsaForfeit).toBeCloseTo(1450, 9); // 1,500 − 50
    const h = hh({ fsaContribution: 1500, fsaCarryoverAllowed: true });
    const carry = evaluateScenario(buildPlanContext(plan('sample-ppo'), h, cfg2026), low, h, cfg2026);
    expect(carry.fsaForfeit).toBeCloseTo(770, 9); // 1,500 − 50 − 680
  });

  it('FSA applies only to non-HSA plans and is capped at the IRS limit', () => {
    const issues: Issue[] = [];
    expect(effectiveFsa(plan('sample-hdhp'), hh({ fsaContribution: 1000 }), cfg2026, issues)).toBe(0);
    expect(effectiveFsa(plan('sample-ppo'), hh({ fsaContribution: 5000 }), cfg2026, issues)).toBe(3400);
    expect(issues.map((i) => i.code)).toEqual(['FSA_OVER_LIMIT']);
  });
});
