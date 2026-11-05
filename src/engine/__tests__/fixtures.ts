/** Shared test fixtures: the worked-example household from docs/SPEC.md §8. */
import raw2026 from '../../config/tax-years/2026.json';
import { resolveTaxConfig } from '../config';
import type { Household, Plan } from '../types';
import { SAMPLE_PLANS } from '../../data/samplePlans';

export const cfg2026 = resolveTaxConfig(raw2026);
export const raw2026Json = raw2026;

/** Tax year 2026, WA, single, employee-only, $85,000, age 40, 26 pay periods, HSA $2,000. */
export const WORKED: Household = {
  taxYear: 2026,
  grossWages: 85000,
  otherHouseholdIncome: 0,
  preTaxRetirement: 0,
  filingStatus: 'single',
  state: 'WA',
  coverageTier: 'self',
  age: 40,
  payPeriodsPerYear: 26,
  premiumsPreTax: true,
  allowedPerVisit: 150,
  hsaContribution: 2000,
  fsaContribution: 0,
  fsaCarryoverAllowed: false,
};

export const hh = (over: Partial<Household> = {}): Household => ({ ...WORKED, ...over });

export const plan = (id: 'sample-ppo' | 'sample-hmo' | 'sample-hdhp'): Plan => {
  const p = SAMPLE_PLANS.find((x) => x.id === id);
  if (!p) throw new Error(id);
  return structuredClone(p);
};

/** Deep copy of the raw 2026 JSON for tamper tests. */
export const rawCopy = (): Record<string, any> => structuredClone(raw2026) as Record<string, any>;
