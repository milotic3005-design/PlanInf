/**
 * HSA simulator: what a given employee HSA contribution does to one HSA plan's
 * cost, your paycheck, and the plan's rank, compared with contributing nothing.
 *
 * Everything is recomputed through the same engine paths as the main results
 * (buildPlanContext → exact before/after taxes), so the simulator can't drift
 * from the numbers elsewhere on the page.
 */
import type { Household, Plan, ResolvedTaxConfig, Scenario, ScenarioId } from './types';
import { limitTierFor } from './types';
import { employerHsaFor, hsaMaxEmployee } from './accounts';
import { buildPlanContext, scenarioCost, type PlanContext } from './netCost';

export interface HsaSnapshot {
  /** Employee contribution used (capped at the plan's maximum). */
  employeeHsa: number;
  /** Tax saved by that contribution (income tax + Social Security + Medicare + state). */
  taxSavings: number;
  /** Employee + employer money going into the HSA. */
  totalIntoHsa: number;
  netCost: number;
  /** Balance after paying this year's out-of-pocket care from the HSA. Negative = paid from your own pocket. */
  hsaAfterCare: number;
}

export interface HsaSimulation {
  planId: string;
  scenarioId: ScenarioId;
  payPeriods: number;
  /** IRS annual limit for the tier, before the catch-up. */
  irsLimit: number;
  /** Age 55+ catch-up included in the limit (0 if under 55). */
  catchUp: number;
  employerHsa: number;
  maxEmployee: number;
  maxPerPaycheck: number;
  annualPremium: number;
  premiumTaxSavings: number;
  outOfPocket: number;
  atZero: HsaSnapshot;
  current: HsaSnapshot;
  atMax: HsaSnapshot;
  perPaycheck: number;
  /** Change in take-home pay per paycheck, compared with $0: −(contribution − tax saved) ÷ paychecks. */
  takeHomeChangePerPaycheck: number;
  /** Every other plan's net cost at the current contribution, cheapest first. */
  rivals: Array<{ planId: string; netCost: number }>;
  /** Smallest annual contribution that makes this plan cheapest. 0 = already is at $0; null = not even at the maximum. */
  contributionToBeCheapest: number | null;
}

export interface SimulateHsaInput {
  household: Household;
  plan: Plan;
  plans: Plan[];
  scenario: Scenario;
  config: ResolvedTaxConfig;
}

export function simulateHsa({ household: h, plan, plans, scenario, config: cfg }: SimulateHsaInput): HsaSimulation {
  const limitTier = limitTierFor(h.coverageTier);
  const irsLimit = cfg.hsa.contributionLimit[limitTier];
  const catchUp = h.age >= 55 ? cfg.hsa.catchUpAge55 : 0;
  const employerHsa = employerHsaFor(plan, h.coverageTier, cfg);
  const maxEmployee = hsaMaxEmployee(cfg, limitTier, h.age, employerHsa);
  const others = plans.filter((p) => p.id !== plan.id);

  const ctxAt = (p: Plan, hsa: number): PlanContext => buildPlanContext(p, { ...h, hsaContribution: hsa }, cfg);
  const snapshot = (hsa: number): HsaSnapshot => {
    const c = ctxAt(plan, hsa);
    const { oop, netCost } = scenarioCost(c, scenario, h.allowedPerVisit);
    return {
      employeeHsa: c.employeeHsa,
      taxSavings: c.accountTaxSavings.total,
      totalIntoHsa: c.employeeHsa + c.employerHsa,
      netCost,
      hsaAfterCare: c.employeeHsa + c.employerHsa - oop.oop,
    };
  };
  const rivalsAt = (hsa: number) =>
    others
      .map((p) => ({ planId: p.id, netCost: scenarioCost(ctxAt(p, hsa), scenario, h.allowedPerVisit).netCost }))
      .sort((a, b) => a.netCost - b.netCost);

  const base = ctxAt(plan, 0);
  const atZero = snapshot(0);
  const current = snapshot(h.hsaContribution);
  const atMax = snapshot(maxEmployee);

  // Gap to the cheapest other plan: ≤ 0 means this plan is cheapest.
  const gap = (hsa: number) => {
    const best = rivalsAt(hsa)[0]?.netCost;
    return best === undefined ? -Infinity : snapshot(hsa).netCost - best;
  };
  let contributionToBeCheapest: number | null;
  if (gap(0) <= 0) contributionToBeCheapest = 0;
  else if (gap(maxEmployee) > 0) contributionToBeCheapest = null;
  else {
    // Net cost falls as the contribution rises, so bisect to the first dollar amount that wins.
    let lo = 0;
    let hi = maxEmployee;
    while (hi - lo > 0.005) {
      const mid = (lo + hi) / 2;
      if (gap(mid) <= 0) hi = mid;
      else lo = mid;
    }
    contributionToBeCheapest = Math.ceil(hi * 100) / 100;
  }

  const periods = h.payPeriodsPerYear;
  return {
    planId: plan.id,
    scenarioId: scenario.id,
    payPeriods: periods,
    irsLimit,
    catchUp,
    employerHsa,
    maxEmployee,
    maxPerPaycheck: maxEmployee / periods,
    annualPremium: base.annualPremium,
    premiumTaxSavings: base.premiumTaxSavings.total,
    outOfPocket: scenarioCost(base, scenario, h.allowedPerVisit).oop.oop,
    atZero,
    current,
    atMax,
    perPaycheck: current.employeeHsa / periods,
    takeHomeChangePerPaycheck: -(current.employeeHsa - current.taxSavings) / periods,
    rivals: rivalsAt(h.hsaContribution),
    contributionToBeCheapest,
  };
}
