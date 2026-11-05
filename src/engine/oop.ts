/**
 * Employee out-of-pocket cost for a year of care (SPEC F9, F13).
 *
 * Model (SPEC A11–A13):
 *  - Copay plans: the first n × a dollars of allowed spend are "copay services".
 *    Each costs min(copay, a), and copays don't count toward the deductible.
 *    If total spend is below n × a, copays scale down in proportion.
 *  - Everything else (and everything on a no-copay plan) goes through the
 *    deductible, then coinsurance.
 *  - The total is capped at the OOP max.
 * OOP is piecewise linear and nondecreasing in spend; the break-even solver relies on that.
 */
import type { CoverageTier, OopDetail, Plan } from './types';

export interface CostShare {
  deductible: number;
  oopMax: number;
  coinsurance: number;
  copayPerVisit: number | null;
}

/**
 * Deductible and OOP max that apply to the year's spending (SPEC A12, Q5).
 *  - Employee only: the individual amounts.
 *  - Family tiers, pooled spending (default): the family amounts.
 *  - Family tiers, one person has all the care: that person's limits. The
 *    deductible is the individual one if the plan embeds it, or the family one
 *    if the plan aggregates it. The OOP max is the individual one, because
 *    non-grandfathered plans must cap each person's cost sharing (assumption:
 *    the plan's individual max is that per-person cap; check plan documents).
 */
export function costShareFor(plan: Plan, tier: CoverageTier, familySpend: 'pooled' | 'onePerson' = 'pooled'): CostShare {
  const base = { coinsurance: plan.coinsurance, copayPerVisit: plan.copayPerVisit };
  if (tier === 'self') return { ...base, deductible: plan.deductible.individual, oopMax: plan.oopMax.individual };
  if (familySpend === 'pooled') return { ...base, deductible: plan.deductible.family, oopMax: plan.oopMax.family };
  const aggregate = plan.familyDeductible === 'aggregate';
  return {
    ...base,
    deductible: aggregate ? plan.deductible.family : Math.min(plan.deductible.individual, plan.deductible.family),
    oopMax: Math.min(plan.oopMax.individual, plan.oopMax.family),
  };
}

/** Copay-services dollars and copay dollars when all n visits happen. */
function copayTotals(cs: CostShare, n: number, a: number) {
  if (cs.copayPerVisit === null || n <= 0 || a <= 0) return { vFull: 0, cFull: 0, perDollar: 0 };
  const perVisit = Math.min(cs.copayPerVisit, a);
  return { vFull: n * a, cFull: n * perVisit, perDollar: perVisit / a };
}

export function outOfPocket(cs: CostShare, spend: number, n: number, a: number): OopDetail {
  const S = Math.max(0, spend);
  const { vFull, perDollar } = copayTotals(cs, n, a);
  const copayPortion = Math.min(vFull, S);
  const copays = copayPortion * perDollar;
  const remainder = S - copayPortion;
  const deductiblePaid = Math.min(remainder, cs.deductible);
  const coinsurancePaid = cs.coinsurance * Math.max(0, remainder - cs.deductible);
  const uncapped = copays + deductiblePaid + coinsurancePaid;
  const oop = Math.min(uncapped, cs.oopMax);
  return { allowedSpend: S, copayPortion, copays, remainder, deductiblePaid, coinsurancePaid, uncapped, oop, capped: uncapped > cs.oopMax };
}

/**
 * Smallest allowed spend at which OOP reaches `target` (default: the OOP max).
 * Infinity if it never does (for example, 0% coinsurance and a deductible below the max).
 */
export function spendToReachOop(cs: CostShare, n: number, a: number, target = cs.oopMax): number {
  if (target <= 0) return 0;
  const t = Math.min(target, cs.oopMax);
  const { vFull, cFull, perDollar } = copayTotals(cs, n, a);
  // Segment 1: copay services, slope perDollar.
  if (t <= cFull) return perDollar > 0 ? t / perDollar : (t <= 0 ? 0 : Infinity);
  // Segment 2: deductible, slope 1.
  if (t <= cFull + cs.deductible) return vFull + (t - cFull);
  // Segment 3: coinsurance.
  if (cs.coinsurance <= 0) return Infinity;
  return vFull + cs.deductible + (t - cFull - cs.deductible) / cs.coinsurance;
}

/** Spends where the OOP slope changes (finite ones only), for the break-even solver and chart. */
export function oopKinks(cs: CostShare, n: number, a: number): number[] {
  const { vFull } = copayTotals(cs, n, a);
  const out = [vFull, vFull + cs.deductible, spendToReachOop(cs, n, a)];
  return out.filter((s) => Number.isFinite(s) && s > 0);
}

/** High scenario: OOP max reached by definition (SPEC §3.3). */
export function outOfPocketAtMax(cs: CostShare, n: number, a: number): OopDetail {
  const s = spendToReachOop(cs, n, a);
  if (Number.isFinite(s)) return { ...outOfPocket(cs, s, n, a), oop: cs.oopMax };
  return {
    allowedSpend: null,
    copayPortion: 0,
    copays: 0,
    remainder: 0,
    deductiblePaid: 0,
    coinsurancePaid: 0,
    uncapped: cs.oopMax,
    oop: cs.oopMax,
    capped: true,
  };
}
