/** Stage 4: input validation and edge cases. */
import { describe, expect, it } from 'vitest';
import { buildScenarios, compare } from '../compare';
import { blockingProblems, InputError } from '../validate';
import { effectiveFsa, hdhpIssues, hsaMaxEmployee } from '../accounts';
import { buildPlanContext, evaluateScenario } from '../netCost';
import { costShareFor } from '../oop';
import type { Household, Issue, Plan } from '../types';
import { SAMPLE_PLANS } from '../../data/samplePlans';
import { cfg2026, hh, plan } from './fixtures';

const scenarios = buildScenarios({ allowedSpend: 3000, copayVisits: 4 });
const run = (h: Household, plans: Plan[] = SAMPLE_PLANS, sc = scenarios) => compare({ household: h, plans, scenarios: sc, config: cfg2026 });
const codes = (h: Household, plans: Plan[] = SAMPLE_PLANS) => run(h, plans).issues.map((i) => i.code);
const thrown = (f: () => unknown): string[] => {
  try {
    f();
  } catch (e) {
    if (e instanceof InputError) return e.problems;
    throw e;
  }
  return [];
};

describe('blocking input errors (no numbers rather than wrong numbers)', () => {
  it('rejects NaN, negative, and out-of-range inputs with plain-language messages', () => {
    expect(thrown(() => run(hh({ grossWages: Number.NaN })))).toEqual(['Gross wages must be a dollar amount of 0 or more (got NaN).']);
    expect(thrown(() => run(hh({ age: 130 })))).toEqual(['Age must be a whole number from 0 to 120 (got 130).']);
    expect(thrown(() => run(hh({ payPeriodsPerYear: 13 as 12 })))).toEqual(['Paychecks per year must be 12, 24, 26, or 52.']);
    expect(thrown(() => run(hh({ allowedPerVisit: 0 })))).toEqual(['Allowed cost per visit must be more than $0.']);
    expect(thrown(() => run(hh({ state: 'CUSTOM', customState: { marginalRate: 1.5, taxesHsa: false } })))).toEqual([
      'Your state tax rate must be from 0% to under 100%.',
    ]);
    expect(thrown(() => run(hh({ state: 'OR' })))[0]).toMatch(/State "OR" is not in the 2026 tax values/);
  });

  it('rejects impossible plan numbers', () => {
    const bad = { ...plan('sample-ppo'), coinsurance: 1.2, deductible: { individual: -5, family: 1000 } };
    expect(blockingProblems(hh(), [bad], scenarios, cfg2026)).toEqual([
      'Sample PPO: individual deductible must be a dollar amount of 0 or more (got -5).',
      'Sample PPO: coinsurance must be from 0% to 100%.',
    ]);
    expect(thrown(() => run(hh(), []))).toEqual(['Add at least one plan.']);
  });

  it('rejects bad scenario spending', () => {
    const sc = buildScenarios({ allowedSpend: -1, copayVisits: 1.5 });
    expect(thrown(() => run(hh(), SAMPLE_PLANS, sc))).toEqual([
      'Expected use spending must be a dollar amount of 0 or more (got -1).',
      'Expected use: visits must be a whole number of 0 or more.',
      'High use (out-of-pocket max reached): visits must be a whole number of 0 or more.',
    ]);
  });
});

describe('edge case: income below the standard deduction', () => {
  it('flags it, saves no income tax, and still counts FICA savings', () => {
    const h = hh({ grossWages: 15000, hsaContribution: 0 });
    expect(codes(h)).toContain('INCOME_BELOW_STANDARD_DEDUCTION');
    const c = buildPlanContext(plan('sample-ppo'), h, cfg2026);
    expect(c.premiumTaxSavings.federalIncome).toBe(0);
    expect(c.premiumTaxSavings.total).toBeCloseTo(1950 * 0.0765, 6);
  });

  it('zero wages: warns, and no plan gets tax savings', () => {
    const h = hh({ grossWages: 0, hsaContribution: 0 });
    expect(codes(h)).toContain('NO_WAGES');
    for (const p of SAMPLE_PLANS) expect(buildPlanContext(p, h, cfg2026).premiumTaxSavings.total, p.id).toBe(0);
  });

  it('pre-tax money above wages is an error on that plan', () => {
    const iss = run(hh({ grossWages: 1500, hsaContribution: 0 })).issues.filter((i) => i.code === 'PRE_TAX_EXCEEDS_WAGES');
    expect(iss.map((i) => i.planId)).toEqual(['sample-ppo']); // $1,950 PPO premium > $1,500 wages
  });
});

describe('edge case: HSA catch-up at 55+ and Medicare at 65+', () => {
  it('the $1,000 catch-up starts exactly at 55', () => {
    expect(hsaMaxEmployee(cfg2026, 'selfOnly', 54, 0)).toBe(4400);
    expect(hsaMaxEmployee(cfg2026, 'selfOnly', 55, 0)).toBe(5400);
    expect(hsaMaxEmployee(cfg2026, 'family', 55, 1000)).toBe(8750); // 8,750 + 1,000 − 1,000 employer
    expect(codes(hh({ age: 55 }))).toContain('HSA_CATCH_UP');
    expect(codes(hh({ age: 54 }))).not.toContain('HSA_CATCH_UP');
  });

  it('at 55 a $5,400 HSA amount is accepted (minus employer money), not capped at $4,400', () => {
    const c = buildPlanContext(plan('sample-hdhp'), hh({ age: 55, hsaContribution: 4900 }), cfg2026);
    expect(c.employeeHsa).toBe(4900); // 4,400 + 1,000 − 500 employer
    expect(c.issues.map((i) => i.code)).not.toContain('HSA_OVER_LIMIT');
  });

  it('at 65+ warns that Medicare enrollment ends HSA contributions', () => {
    const c = codes(hh({ age: 66 }));
    expect(c).toContain('AGE_65_MEDICARE');
    expect(c).not.toContain('HSA_CATCH_UP');
  });
});

describe('edge case: family vs individual limits', () => {
  it('family tiers use the family HSA limit; the FSA limit stays per employee', () => {
    const fam = hh({ coverageTier: 'family', hsaContribution: 20000, fsaContribution: 9000 });
    expect(buildPlanContext(plan('sample-hdhp'), fam, cfg2026).employeeHsa).toBe(7750); // 8,750 − 1,000
    expect(effectiveFsa(plan('sample-ppo'), fam, cfg2026, [] as Issue[])).toBe(3400);
  });

  it('married with family HDHP coverage: the family HSA limit is shared (MFS: split)', () => {
    const mfj = run(hh({ coverageTier: 'family', filingStatus: 'mfj' })).issues.find((i) => i.code === 'HSA_FAMILY_LIMIT_SHARED');
    expect(mfj?.message).toMatch(/share one family HSA limit/);
    const mfs = run(hh({ coverageTier: 'family', filingStatus: 'mfs' })).issues.find((i) => i.code === 'HSA_FAMILY_LIMIT_SHARED');
    expect(mfs?.message).toMatch(/split equally/);
  });

  it('pooled family spending uses family limits; one-person spending uses per-person limits', () => {
    const ppo = plan('sample-ppo');
    const hdhp = plan('sample-hdhp');
    expect(costShareFor(ppo, 'family', 'pooled')).toMatchObject({ deductible: 1000, oopMax: 6000 });
    expect(costShareFor(ppo, 'family', 'onePerson')).toMatchObject({ deductible: 500, oopMax: 3000 }); // embedded
    expect(costShareFor(hdhp, 'family', 'onePerson')).toMatchObject({ deductible: 6000, oopMax: 6000 }); // aggregate
    const sc = scenarios[1]!;
    const pooled = evaluateScenario(buildPlanContext(ppo, hh({ coverageTier: 'family' }), cfg2026), sc, hh(), cfg2026);
    const one = evaluateScenario(buildPlanContext(ppo, hh({ coverageTier: 'family', familySpend: 'onePerson' }), cfg2026), sc, hh(), cfg2026);
    expect(pooled.outOfPocket).toBeCloseTo(1380, 6); // 100 copays + 1,000 + 20% × 1,400
    expect(one.outOfPocket).toBeCloseTo(980, 6); // 100 + 500 + 20% × 1,900
    expect(codes(hh({ coverageTier: 'family', familySpend: 'onePerson' }))).toContain('ONE_PERSON_SPEND');
  });

  it('a family HDHP with an embedded individual deductible below the family minimum is not HSA-eligible', () => {
    const embedded = { ...plan('sample-hdhp'), familyDeductible: 'embedded' as const };
    expect(hdhpIssues(embedded, cfg2026, 'family').map((i) => i.code)).toEqual(['HDHP_EMBEDDED_DEDUCTIBLE_TOO_LOW']);
    expect(hdhpIssues(embedded, cfg2026, 'self')).toEqual([]); // fine for employee-only coverage
    expect(buildPlanContext(embedded, hh({ coverageTier: 'family' }), cfg2026).employerHsa).toBe(0);
  });
});

describe('plan sanity checks', () => {
  it('flags numbers that do not hang together', () => {
    const odd: Plan[] = [
      { ...plan('sample-ppo'), deductible: { individual: 4000, family: 1000 }, copayPerVisit: 400, coinsurance: 0.6 },
      { ...plan('sample-hmo'), name: 'Sample PPO' },
      { ...plan('sample-hdhp'), id: 'blank', name: '', premiumPerPaycheck: { self: 0, selfSpouse: 0, selfChildren: 0, family: 0 }, deductible: { individual: 0, family: 0 }, oopMax: { individual: 0, family: 0 }, hsaEligible: false },
    ];
    const c = codes(hh(), odd);
    for (const code of ['PLAN_DEDUCTIBLE_ABOVE_OOP', 'PLAN_FAMILY_BELOW_INDIVIDUAL', 'COPAY_ABOVE_VISIT_COST', 'PLAN_HIGH_COINSURANCE', 'PLAN_DUPLICATE_NAME', 'PLAN_NO_NAME', 'PLAN_LOOKS_EMPTY']) {
      expect(c, code).toContain(code);
    }
  });

  it('flags unusable account amounts and inconsistent spending', () => {
    expect(codes(hh({ hsaContribution: 1000 }), [plan('sample-ppo')])).toContain('HSA_NO_ELIGIBLE_PLAN');
    expect(codes(hh({ fsaContribution: 1000 }), [plan('sample-hdhp')])).toContain('FSA_ONLY_HSA_PLANS');
    const sc = buildScenarios({ allowedSpend: 200, copayVisits: 4 }, { allowedSpend: 300, copayVisits: 2 });
    const c = run(hh(), SAMPLE_PLANS, sc).issues.map((i) => i.code);
    expect(c).toContain('VISITS_EXCEED_SPEND');
    expect(c).toContain('LOW_ABOVE_EXPECTED');
  });
});

describe('robustness: random valid inputs never produce NaN or out-of-range results', () => {
  // Small deterministic PRNG (mulberry32), so failures are reproducible.
  function rng(seed: number) {
    return () => {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  it('300 random households × plan sets', () => {
    const r = rng(20261104);
    const pick = <T,>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)]!;
    const money = (max: number) => Math.round(r() * max);
    for (let i = 0; i < 300; i++) {
      const plans: Plan[] = [0, 1, 2].map((k) => {
        const ded = money(6000);
        return {
          ...plan(pick(['sample-ppo', 'sample-hmo', 'sample-hdhp'] as const)),
          id: `p${k}`,
          name: `Plan ${k}`,
          premiumPerPaycheck: { self: money(200), selfSpouse: money(400), selfChildren: money(400), family: money(600) },
          deductible: { individual: ded, family: ded * 2 },
          oopMax: { individual: ded + money(6000), family: (ded + money(6000)) * 2 },
          coinsurance: pick([0, 0.1, 0.2, 0.3, 0.5]),
          copayPerVisit: pick([null, 0, 20, 50, 250]),
        };
      });
      const h = hh({
        grossWages: money(400000),
        otherHouseholdIncome: money(100000),
        filingStatus: pick(['single', 'mfj', 'mfs', 'hoh'] as const),
        coverageTier: pick(['self', 'selfSpouse', 'selfChildren', 'family'] as const),
        familySpend: pick(['pooled', 'onePerson'] as const),
        age: 18 + Math.floor(r() * 60),
        hsaContribution: money(10000),
        fsaContribution: money(4000),
        fsaCarryoverAllowed: r() < 0.5,
        premiumsPreTax: r() < 0.9,
      });
      const res = run(h, plans, buildScenarios({ allowedSpend: money(40000), copayVisits: Math.floor(r() * 20) }));
      for (const x of res.results) {
        expect(Number.isFinite(x.netCost), `case ${i}`).toBe(true);
        expect(x.outOfPocket).toBeGreaterThanOrEqual(0);
        expect(x.fsaForfeit).toBeGreaterThanOrEqual(0);
        expect(x.premiumTaxSavings.total).toBeGreaterThanOrEqual(-1e-9);
        expect(x.accountTaxSavings.total).toBeGreaterThanOrEqual(-1e-9);
      }
      for (const be of res.breakEvens) {
        for (const c of be.crossings) {
          const s = c.kind === 'point' ? c.spend : c.from;
          expect(s).toBeGreaterThanOrEqual(0);
          expect(s).toBeLessThanOrEqual(res.chartMaxSpend);
        }
      }
      for (const rows of Object.values(res.rankings)) {
        for (let k = 1; k < rows.length; k++) expect(rows[k]!.netCost).toBeGreaterThanOrEqual(rows[k - 1]!.netCost);
      }
      expect(res.cheapestBySpend[0]!.from).toBe(0);
      expect(res.cheapestBySpend.at(-1)!.to).toBe(res.chartMaxSpend);
    }
  });
});

describe('explanation wording at the edges', () => {
  it('does not repeat the runner-up gap, and a one-sided boundary reads as a full sentence', async () => {
    const { explainScenario } = await import('../explain');
    const h = hh({ coverageTier: 'family', age: 40, hsaContribution: 0 });
    const res = run(h);
    const e = explainScenario(res, SAMPLE_PLANS, scenarios[1]!);
    expect(e.winnerId).toBe('sample-hdhp');
    const runnerUp = SAMPLE_PLANS.find((p) => p.id === res.rankings.expected[1]!.planId)!.name;
    expect(e.sentences.some((s) => s.startsWith(`${runnerUp} is `) && s.endsWith('behind here.'))).toBe(false);
    expect(e.sentences.at(-1)).toMatch(/^Above \$[\d,]+ of care, Sample \w+ is cheapest\.$/);
  });
});
