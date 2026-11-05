/** The MultiCare 2027 template: numbers match the guide, and every plan passes the engine's checks. */
import { describe, expect, it } from 'vitest';
import { multicare2027Plans, MULTICARE_2027 } from '../../data/multicare2027';
import { buildScenarios, compare } from '../compare';
import { buildPlanContext } from '../netCost';
import { COVERAGE_TIERS } from '../types';
import { cfg2026, hh } from './fixtures';

const ft = multicare2027Plans('fullTime');
const pt = multicare2027Plans('partTime');
const byId = (ps: typeof ft, id: string) => ps.find((p) => p.id === id)!;
const h24 = (over = {}) => hh({ payPeriodsPerYear: MULTICARE_2027.payPeriodsPerYear, hsaContribution: 0, ...over });

describe('MultiCare 2027 template', () => {
  it('annual premiums equal 12 × the monthly rates on guide page 16 (full-time)', () => {
    const annual = (id: string, tier: (typeof COVERAGE_TIERS)[number]) => byId(ft, id).premiumPerPaycheck[tier] * 24;
    expect(COVERAGE_TIERS.map((t) => annual('mc-myconnected', t))).toEqual([99, 280, 230, 320].map((m) => m * 12));
    expect(COVERAGE_TIERS.map((t) => annual('mc-standard-ppo', t))).toEqual([258, 508, 406, 626].map((m) => m * 12));
    expect(COVERAGE_TIERS.map((t) => annual('mc-hdhp', t))).toEqual([148, 302, 248, 358].map((m) => m * 12));
  });

  it('part-time rates (page 16) and HSA contributions (page 18)', () => {
    expect(byId(pt, 'mc-myconnected').premiumPerPaycheck.family * 24).toBe(716 * 12);
    expect(byId(ft, 'mc-hdhp').employerHsa).toEqual({ selfOnly: 800, family: 1600 });
    expect(byId(pt, 'mc-hdhp').employerHsa).toEqual({ selfOnly: 400, family: 800 });
  });

  it('cost sharing matches guide page 10 (Preferred Network)', () => {
    expect(byId(ft, 'mc-standard-ppo')).toMatchObject({ deductible: { individual: 750, family: 1500 }, oopMax: { individual: 4000, family: 8000 }, coinsurance: 0.2, copayPerVisit: 35 });
    expect(byId(ft, 'mc-hdhp')).toMatchObject({ deductible: { individual: 1750, family: 3500 }, oopMax: { individual: 3500, family: 7000 }, coinsurance: 0.1, copayPerVisit: null });
    expect(byId(ft, 'mc-myconnected')).toMatchObject({ oopMax: { individual: 3000, family: 6000 }, coinsurance: 0.1, copayPerVisit: 20 });
  });

  it('the High Deductible PPO passes the IRS HDHP test for every tier, so its HSA money counts', () => {
    for (const tier of COVERAGE_TIERS) {
      const c = buildPlanContext(byId(ft, 'mc-hdhp'), h24({ coverageTier: tier }), cfg2026);
      expect(c.issues.filter((i) => i.severity === 'error'), tier).toEqual([]);
      expect(c.employerHsa, tier).toBe(tier === 'self' ? 800 : 1600);
    }
  });

  it('compares cleanly for every tier and status (no errors or warnings)', () => {
    for (const plans of [ft, pt]) {
      for (const tier of COVERAGE_TIERS) {
        const res = compare({ household: h24({ coverageTier: tier }), plans, scenarios: buildScenarios({ allowedSpend: 3000, copayVisits: 4 }), config: cfg2026 });
        const bad = res.issues.filter((i) => i.severity !== 'info');
        expect(bad.map((i) => i.code), tier).toEqual([]);
        expect(res.results.every((r) => Number.isFinite(r.netCost))).toBe(true);
      }
    }
  });
});
