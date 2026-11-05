/**
 * The hand-calculated worked example from docs/SPEC.md §8.
 * Eval criterion 2: the engine must match the hand calculation within $1.
 * (It actually matches to the cent; both are asserted.)
 */
import { describe, expect, it } from 'vitest';
import { buildScenarios, compare } from '../compare';
import { SAMPLE_PLANS } from '../../data/samplePlans';
import type { ScenarioId } from '../types';
import { cfg2026, WORKED } from './fixtures';

const result = compare({
  household: WORKED,
  plans: SAMPLE_PLANS,
  scenarios: buildScenarios({ allowedSpend: 3000, copayVisits: 4 }),
  config: cfg2026,
});
const get = (planId: string, sc: ScenarioId) => result.results.find((r) => r.planId === planId && r.scenarioId === sc)!;

/** Hand-calculated net costs (SPEC §8 Step 4), unrounded. */
const HAND: Record<string, Record<ScenarioId, number>> = {
  'sample-ppo': { low: 1421.825, expected: 2351.825, high: 4371.825 },
  'sample-hmo': { low: 863.095, expected: 2183.095, high: 5323.095 },
  'sample-hdhp': { low: -335.725, expected: 2364.275, high: 5364.275 },
};

describe('worked example (SPEC §8)', () => {
  it('Step 2: tax savings match the hand calculation', () => {
    expect(get('sample-ppo', 'expected').premiumTaxSavings.total).toBeCloseTo(578.175, 6);
    expect(get('sample-hmo', 'expected').premiumTaxSavings.total).toBeCloseTo(346.905, 6);
    expect(get('sample-hdhp', 'expected').premiumTaxSavings.total).toBeCloseTo(192.725, 6);
    expect(get('sample-hdhp', 'expected').accountTaxSavings.total).toBeCloseTo(593, 6);
    const ppo = get('sample-ppo', 'expected').premiumTaxSavings;
    expect([ppo.federalIncome, ppo.socialSecurity, ppo.medicare]).toEqual([
      expect.closeTo(429, 6),
      expect.closeTo(120.9, 6),
      expect.closeTo(28.275, 6),
    ]);
  });

  it('Step 3: out-of-pocket per scenario', () => {
    const oop = (id: string) => (['low', 'expected', 'high'] as const).map((s) => get(id, s).outOfPocket);
    expect(oop('sample-ppo')).toEqual([expect.closeTo(50, 9), 980, 3000]);
    expect(oop('sample-hmo')).toEqual([expect.closeTo(40, 9), expect.closeTo(1360, 9), 4500]);
    expect(oop('sample-hdhp')).toEqual([300, 3000, 6000]);
  });

  it('T13: all 9 net costs match the hand calculation within $1 (and to the cent)', () => {
    for (const [planId, byScenario] of Object.entries(HAND)) {
      for (const [sc, hand] of Object.entries(byScenario) as [ScenarioId, number][]) {
        const engine = get(planId, sc).netCost;
        expect(Math.abs(engine - hand), `${planId} ${sc}`).toBeLessThan(1);
        expect(engine, `${planId} ${sc}`).toBeCloseTo(hand, 6);
      }
    }
  });

  it('ranks each scenario: Low → HDHP, Expected → HMO, High → PPO', () => {
    expect(result.rankings.low.map((r) => r.planId)).toEqual(['sample-hdhp', 'sample-hmo', 'sample-ppo']);
    expect(result.rankings.expected.map((r) => r.planId)).toEqual(['sample-hmo', 'sample-ppo', 'sample-hdhp']);
    expect(result.rankings.high.map((r) => r.planId)).toEqual(['sample-ppo', 'sample-hmo', 'sample-hdhp']);
    expect(result.rankings.expected[2]!.deltaVsBest).toBeCloseTo(181.18, 6);
  });

  it('T14: HDHP vs PPO break-even is $2,984.44 (within $1), HDHP cheaper below', () => {
    const be = result.breakEvens.find((b) => b.planA === 'sample-ppo' && b.planB === 'sample-hdhp')!;
    expect(be.crossings).toHaveLength(1);
    const c = be.crossings[0]!;
    expect(c.kind).toBe('point');
    if (c.kind !== 'point') return;
    expect(Math.abs(c.spend - 2984.44)).toBeLessThan(1);
    expect(c.spend).toBeCloseTo(2984.4375, 6); // 2,387.55 / 0.8
    expect([c.cheaperBelow, c.cheaperAbove]).toEqual(['sample-hdhp', 'sample-ppo']);
    expect(be.summary).toBe('Sample HDHP is cheaper below $2,984.44 of care; Sample PPO above $2,984.44.');
  });

  it('the other two break-evens: HMO vs HDHP $2,773.53, HMO vs PPO $13,943.65', () => {
    const point = (a: string, b: string) => {
      const be = result.breakEvens.find((x) => x.planA === a && x.planB === b)!;
      expect(be.crossings).toHaveLength(1);
      const c = be.crossings[0]!;
      return c.kind === 'point' ? c.spend : NaN;
    };
    expect(point('sample-hmo', 'sample-hdhp')).toBeCloseTo(2773.525, 6);
    expect(point('sample-ppo', 'sample-hmo')).toBeCloseTo(13943.65, 6);
  });

  it('chart range runs 10% past the last kink (HMO max at $18,700), rounded up to $500', () => {
    expect(result.chartMaxSpend).toBe(21000);
  });

  it('show math: every number has a trace; the last step equals the net cost; tax steps cite sources', () => {
    for (const r of result.results) {
      const last = r.math[r.math.length - 1]!;
      expect(last.label).toBe('Net after-tax cost');
      expect(last.result).toBe(r.netCost);
      for (const step of r.math) {
        expect(step.shown.length).toBeGreaterThan(0);
        if (step.label.includes('federal income tax')) expect(step.params.map((p) => p.path)).toContain('federal.brackets.single');
        for (const p of step.params) expect(p.url).toMatch(/^https:\/\//);
      }
    }
    const fit = get('sample-ppo', 'expected').math.find((s) => s.label === 'Premium tax savings: federal income tax')!;
    expect(fit.shown).toBe('FIT($68,900.00) − FIT($66,950.00) = $9,870.00 − $9,441.00 = $429.00 (marginal rate 22%)');
  });

  it('reports 37 unverified parameters and no plan issues for the sample plans', () => {
    expect(result.unverifiedParams).toHaveLength(37);
    expect(result.issues).toEqual([]);
  });

  it('rejects a household/config tax-year mismatch', () => {
    expect(() => compare({ household: { ...WORKED, taxYear: 2027 }, plans: SAMPLE_PLANS, scenarios: [], config: cfg2026 })).toThrow(/2027/);
  });
});
