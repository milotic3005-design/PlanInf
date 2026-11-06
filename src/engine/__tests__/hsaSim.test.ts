/**
 * HSA math, hand-checked against the MultiCare 2027 guide.
 * Employee only, single, WA, $85,000, tax year 2027, 24 paychecks.
 *
 * Marginal rate here: 22% income tax + 6.2% Social Security + 1.45% Medicare = 29.65%.
 * High Deductible PPO: premium $148 × 12 = $1,776, saves 29.65% = $526.584.
 * Expected care ($3,000): $1,750 deductible + 10% × $1,250 = $1,875 out of pocket.
 * MultiCare adds $800. So at $0: 1,776 + 1,875 − 526.584 − 800 = $2,324.416.
 * MyConnected Care: 1,188 + (80 copays + 10% × 2,400) − 352.242 = $1,155.758.
 */
import { describe, expect, it } from 'vitest';
import raw2027 from '../../config/tax-years/2027.json';
import { multicare2027Plans, MULTICARE_2027 } from '../../data/multicare2027';
import { resolveTaxConfig } from '../config';
import { buildScenarios, compare } from '../compare';
import { simulateHsa } from '../hsaSim';
import { cfg2026, hh } from './fixtures';

const cfg2027 = resolveTaxConfig(raw2027);
const plans = multicare2027Plans('fullTime');
const hdhp = plans.find((p) => p.id === 'mc-hdhp')!;
const scenarios = buildScenarios({ allowedSpend: 3000, copayVisits: 4 });
const [low, expected, high] = [scenarios[0]!, scenarios[1]!, scenarios[2]!];
const household = (over = {}) => hh({ taxYear: 2027, payPeriodsPerYear: MULTICARE_2027.payPeriodsPerYear, hsaContribution: 0, ...over });
const sim = (over = {}, scenario = expected, cfg = cfg2027, ps = plans) =>
  simulateHsa({ household: household(over), plan: ps.find((p) => p.id === 'mc-hdhp')!, plans: ps, scenario, config: cfg });

describe('HSA limits with the MultiCare employer contribution', () => {
  it('employee only: $800 from MultiCare leaves $3,700 of the $4,500 limit', () => {
    const s = sim();
    expect([s.irsLimit, s.catchUp, s.employerHsa, s.maxEmployee]).toEqual([4500, 0, 800, 3700]);
    expect(s.maxPerPaycheck).toBeCloseTo(154.1667, 3);
  });

  it('family: $1,600 from MultiCare leaves $7,400 of the $9,000 limit', () => {
    const s = sim({ coverageTier: 'family' });
    expect([s.irsLimit, s.employerHsa, s.maxEmployee]).toEqual([9000, 1600, 7400]);
  });

  it('age 55+: the $1,000 catch-up adds to your room', () => {
    expect(sim({ age: 54 }).maxEmployee).toBe(3700);
    expect(sim({ age: 55 }).maxEmployee).toBe(4700);
  });

  it('part-time: $400 from MultiCare leaves $4,100', () => {
    const pt = multicare2027Plans('partTime');
    const s = simulateHsa({ household: household(), plan: pt.find((p) => p.id === 'mc-hdhp')!, plans: pt, scenario: expected, config: cfg2027 });
    expect([s.employerHsa, s.maxEmployee]).toEqual([400, 4100]);
  });

  it('employer plus employee money at the max equals the IRS limit exactly, never above it', () => {
    expect(sim({ hsaContribution: 3700 }).current.totalIntoHsa).toBe(4500);
    const over = sim({ hsaContribution: 5000 }); // above the max: capped
    expect(over.current.employeeHsa).toBe(3700);
    expect(over.current.totalIntoHsa).toBe(4500);
  });

  it('the older 2026 tax year would allow only $3,600, which is why 2027 plans need 2027 limits', () => {
    expect(sim({ taxYear: 2026 }, expected, cfg2026).maxEmployee).toBe(3600);
  });
});

describe('what a contribution does to the math', () => {
  it('at $0 the plan still gets the full $800 from MultiCare', () => {
    const s = sim();
    expect(s.atZero.employeeHsa).toBe(0);
    expect(s.atZero.taxSavings).toBe(0);
    expect(s.atZero.totalIntoHsa).toBe(800);
    expect(s.atZero.netCost).toBeCloseTo(2324.416, 6);
    expect(s.outOfPocket).toBeCloseTo(1875, 6);
  });

  it('$150 a paycheck: $3,600 a year saves 29.65% = $1,067.40, and net cost falls by exactly that', () => {
    const s = sim({ hsaContribution: 3600 });
    expect(s.perPaycheck).toBeCloseTo(150, 6);
    expect(s.current.taxSavings).toBeCloseTo(1067.4, 6);
    expect(s.current.netCost).toBeCloseTo(2324.416 - 1067.4, 6);
    expect(s.atZero.netCost - s.current.netCost).toBeCloseTo(s.current.taxSavings, 6);
  });

  it('take-home drops by the contribution minus the tax saved, per paycheck', () => {
    const s = sim({ hsaContribution: 3600 });
    expect(s.takeHomeChangePerPaycheck).toBeCloseTo(-(3600 - 1067.4) / 24, 6); // −$105.525
  });

  it('HSA balance after care: short $1,075 at $0, $2,525 left at $150 a paycheck', () => {
    const s = sim({ hsaContribution: 3600 });
    expect(s.atZero.hsaAfterCare).toBeCloseTo(800 - 1875, 6);
    expect(s.current.hsaAfterCare).toBeCloseTo(800 + 3600 - 1875, 6);
  });

  it('the math is exact across a bracket edge, not marginal rate × amount', () => {
    // $70,000: TI 53,400; after the $1,776 premium TI is 51,624, already below the 22% start (52,025).
    // So the HSA dollars save 12% + 7.65%, not 29.65%.
    const s = sim({ grossWages: 70000, hsaContribution: 1000 });
    expect(s.current.taxSavings).toBeCloseTo(1000 * (0.12 + 0.0765), 6);
    const c = sim({ grossWages: 70000 });
    expect(c.premiumTaxSavings).toBeCloseTo(1776 * 0.0765 + (53400 - 52025) * 0.22 + (52025 - 51624) * 0.12, 6);
  });

  it('non-HSA plans do not move with the slider', () => {
    const a = sim().rivals;
    const b = sim({ hsaContribution: 3600 }).rivals;
    expect(b).toEqual(a);
    expect(a[0]).toMatchObject({ planId: 'mc-myconnected' });
    expect(a[0]!.netCost).toBeCloseTo(1155.758, 3);
  });

  it('the simulator agrees with the main comparison at every scenario', () => {
    const h = household({ hsaContribution: 2400 });
    const res = compare({ household: h, plans, scenarios, config: cfg2027 });
    for (const sc of scenarios) {
      const main = res.results.find((r) => r.planId === 'mc-hdhp' && r.scenarioId === sc.id)!;
      expect(simulateHsa({ household: h, plan: hdhp, plans, scenario: sc, config: cfg2027 }).current.netCost, sc.id).toBeCloseTo(main.netCost, 9);
    }
  });
});

describe('contribution needed to become the cheapest plan', () => {
  it('Low use: already cheapest at $0', () => {
    expect(sim({}, low).contributionToBeCheapest).toBe(0);
  });

  it('Expected use: not cheapest even at the maximum (MyConnected Care stays $71.61 ahead)', () => {
    const s = sim({ hsaContribution: 3700 });
    expect(s.contributionToBeCheapest).toBeNull();
    expect(s.current.netCost - s.rivals[0]!.netCost).toBeCloseTo(2324.416 - 3700 * 0.2965 - 1155.758, 3);
  });

  it('High use: $383.34 a year closes the $113.66 gap (113.658 ÷ 0.2965)', () => {
    const s = sim({}, high);
    expect(s.atZero.netCost).toBeCloseTo(3949.416, 6);
    expect(s.contributionToBeCheapest).toBeCloseTo(113.658 / 0.2965, 1);
    const at = sim({ hsaContribution: s.contributionToBeCheapest! }, high);
    expect(at.current.netCost).toBeLessThanOrEqual(at.rivals[0]!.netCost);
  });
});
