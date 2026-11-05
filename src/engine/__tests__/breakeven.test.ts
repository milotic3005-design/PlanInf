import { describe, expect, it } from 'vitest';
import { breakEven, costCurve } from '../breakeven';
import { buildPlanContext } from '../netCost';
import type { Plan } from '../types';
import { cfg2026, hh, plan } from './fixtures';

/** A simple no-copay plan with an annual premium, for hand-checkable break-evens. */
function simplePlan(id: string, annualPremium: number, deductible: number, coinsurance: number, oopMax: number): Plan {
  const perCheck = annualPremium / 12;
  return {
    id,
    name: id,
    kind: 'PPO',
    isSample: true,
    hsaEligible: false,
    premiumPerPaycheck: { self: perCheck, selfSpouse: perCheck, selfChildren: perCheck, family: perCheck },
    deductible: { individual: deductible, family: deductible * 2 },
    oopMax: { individual: oopMax, family: oopMax * 2 },
    coinsurance,
    copayPerVisit: null,
    employerHsa: { selfOnly: 0, family: 0 },
  };
}
// Post-tax premiums, no accounts: net cost = premium + OOP, so every crossing is easy to hand-check.
const plain = hh({ premiumsPreTax: false, hsaContribution: 0, payPeriodsPerYear: 12 });
const ctx = (p: Plan, h = plain) => buildPlanContext(p, h, cfg2026);

describe('break-even solver', () => {
  it('T15: one plan cheaper everywhere → no crossing, with the smallest gap reported', () => {
    const cheap = plan('sample-ppo');
    const pricey = { ...plan('sample-ppo'), id: 'pricey', name: 'Pricey PPO', premiumPerPaycheck: { self: 125, selfSpouse: 0, selfChildren: 0, family: 0 } };
    const be = breakEven(ctx(cheap, hh()), ctx(pricey, hh()), 4, 150, 21000);
    expect(be.crossings).toEqual([]);
    expect(be.cheaperAtZero).toBe('sample-ppo');
    expect(be.minGapIfNoCrossing).toBeCloseTo(50 * 26 * (1 - 0.2965), 6); // $50/paycheck more, after tax
    expect(be.summary).toMatch(/^Sample PPO is cheaper at every spending level from \$0 to \$21,000\.00, by at least \$914\.55\.$/);
  });

  it('T16: equal until one plan hits its lower OOP max → reported as a tie range', () => {
    // Same premium/deductible/coinsurance; A's max is $3,000 (reached at $11,000), B's is $4,000.
    const a = simplePlan('A', 1200, 1000, 0.2, 3000);
    const b = simplePlan('B', 1200, 1000, 0.2, 4000);
    const be = breakEven(ctx(a), ctx(b), 0, 150, 30000);
    expect(be.cheaperAtZero).toBe('tie');
    expect(be.crossings).toEqual([{ kind: 'range', from: 0, to: 11000, cheaperBelow: 'tie', cheaperAbove: 'A' }]);
    expect(be.summary).toBe('They cost the same from $0.00 to $11,000.00; A above $11,000.00.');
  });

  it('finds every crossing when plans swap more than once', () => {
    // A: $0 premium, 50% coinsurance, $4,500 max. B: $1,200 premium, $2,000 deductible, then 10%.
    // d = 0.4S − 3,000 → 0 at $7,500; A maxes at $9,000; then d = 1,500 − 0.1S → 0 at $15,000.
    const a = simplePlan('A', 0, 0, 0.5, 4500);
    const b = simplePlan('B', 1200, 2000, 0.1, 4000);
    const be = breakEven(ctx(a), ctx(b), 0, 150, 30000);
    expect(be.crossings.map((c) => (c.kind === 'point' ? Math.round(c.spend * 100) / 100 : NaN))).toEqual([7500, 15000]);
    expect(be.summary).toBe('A is cheaper below $7,500.00 of care; B from $7,500.00 to $15,000.00; A above $15,000.00.');
    expect(be.math.filter((m) => m.label.startsWith('Break-even'))).toHaveLength(2);
  });

  it('includes the FSA forfeit kink: same PPO with and without a $1,500 FSA', () => {
    // FSA saves 29.65% × 1,500 = 444.75 in tax but forfeits max(0, 1,500 − OOP).
    // d = −444.75 + (1,500 − OOP) = 0 at OOP = 1,055.25 → S = 500 + 555.25 / 0.2 = 3,276.25
    const withFsa = ctx(plan('sample-ppo'), hh({ fsaContribution: 1500 }));
    const without = ctx({ ...plan('sample-ppo'), id: 'no-fsa', name: 'PPO without FSA' }, hh());
    const be = breakEven(withFsa, without, 0, 150, 21000);
    expect(be.crossings).toHaveLength(1);
    const c = be.crossings[0]!;
    expect(c.kind === 'point' && c.spend).toBeCloseTo(3276.25, 6);
    expect(c.kind === 'point' && [c.cheaperBelow, c.cheaperAbove]).toEqual(['no-fsa', 'sample-ppo']);
  });

  it('cost curve includes the kinks and never decreases', () => {
    const curve = costCurve(ctx(plan('sample-ppo'), hh()), 4, 150, 21000);
    const xs = curve.map((p) => p.spend);
    for (const k of [600, 1100, 13100]) expect(xs).toContain(k);
    for (let i = 1; i < curve.length; i++) expect(curve[i]!.netCost).toBeGreaterThanOrEqual(curve[i - 1]!.netCost - 1e-9);
  });
});
