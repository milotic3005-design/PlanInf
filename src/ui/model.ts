/**
 * UI state shape and defaults. The form holds only what the user types; it is
 * never stored or sent anywhere (SPEC A19). Reloading the page clears it.
 */
import type { CoverageTier, FilingStatus, Household, Plan, Scenario } from '../engine/types';
import { buildScenarios, LOW_USE_DEFAULT } from '../engine/compare';
import { SAMPLE_PLANS } from '../data/samplePlans';

export interface FormState {
  grossWages: number;
  filingStatus: FilingStatus;
  state: string; // 'WA' or 'CUSTOM'
  customRatePct: number;
  customTaxesHsa: boolean;
  coverageTier: CoverageTier;
  familySpend: 'pooled' | 'onePerson';
  age: number;
  payPeriodsPerYear: Household['payPeriodsPerYear'];
  premiumsPreTax: boolean;
  expectedSpend: number;
  expectedVisits: number;
  allowedPerVisit: number;
  hsaContribution: number;
  fsaContribution: number;
  fsaCarryoverAllowed: boolean;
  otherHouseholdIncome: number;
  preTaxRetirement: number;
  lowSpend: number;
  lowVisits: number;
}

/** Starting values: the spec's worked example, except the HSA amount is blank (SPEC Q4). */
export const DEFAULT_FORM: FormState = {
  grossWages: 85000,
  filingStatus: 'single',
  state: 'WA',
  customRatePct: 5,
  customTaxesHsa: false,
  coverageTier: 'self',
  familySpend: 'pooled',
  age: 40,
  payPeriodsPerYear: 26,
  premiumsPreTax: true,
  expectedSpend: 3000,
  expectedVisits: 4,
  allowedPerVisit: 150,
  hsaContribution: 0,
  fsaContribution: 0,
  fsaCarryoverAllowed: false,
  otherHouseholdIncome: 0,
  preTaxRetirement: 0,
  lowSpend: LOW_USE_DEFAULT.allowedSpend,
  lowVisits: LOW_USE_DEFAULT.copayVisits,
};

/** docs/SPEC.md §8 exactly (HSA $2,000), for checking the app against the hand calculation. */
export const WORKED_EXAMPLE_FORM: FormState = { ...DEFAULT_FORM, hsaContribution: 2000 };

export function toHousehold(f: FormState, taxYear: number): Household {
  return {
    taxYear,
    grossWages: f.grossWages,
    otherHouseholdIncome: f.otherHouseholdIncome,
    preTaxRetirement: f.preTaxRetirement,
    filingStatus: f.filingStatus,
    state: f.state,
    customState: f.state === 'CUSTOM' ? { marginalRate: f.customRatePct / 100, taxesHsa: f.customTaxesHsa } : undefined,
    coverageTier: f.coverageTier,
    familySpend: f.familySpend,
    age: f.age,
    payPeriodsPerYear: f.payPeriodsPerYear,
    premiumsPreTax: f.premiumsPreTax,
    allowedPerVisit: f.allowedPerVisit,
    hsaContribution: f.hsaContribution,
    fsaContribution: f.fsaContribution,
    fsaCarryoverAllowed: f.fsaCarryoverAllowed,
  };
}

export function toScenarios(f: FormState): Scenario[] {
  return buildScenarios(
    { allowedSpend: f.expectedSpend, copayVisits: f.expectedVisits },
    { allowedSpend: f.lowSpend, copayVisits: f.lowVisits },
  );
}

export const MAX_PLANS = 6;

export const samplePlans = (): Plan[] => structuredClone(SAMPLE_PLANS);

let nextId = 1;
export function blankPlan(): Plan {
  return {
    id: `plan-${nextId++}`,
    name: 'New plan',
    kind: 'PPO',
    isSample: false,
    hsaEligible: false,
    premiumPerPaycheck: { self: 0, selfSpouse: 0, selfChildren: 0, family: 0 },
    deductible: { individual: 0, family: 0 },
    familyDeductible: 'embedded',
    oopMax: { individual: 0, family: 0 },
    coinsurance: 0.2,
    copayPerVisit: null,
    employerHsa: { selfOnly: 0, family: 0 },
  };
}

export const TIER_LABEL: Record<CoverageTier, string> = {
  self: 'Employee only',
  selfSpouse: 'Employee + spouse',
  selfChildren: 'Employee + child(ren)',
  family: 'Family',
};

export const FILING_LABEL: Record<FilingStatus, string> = {
  single: 'Single',
  mfj: 'Married filing jointly',
  mfs: 'Married filing separately',
  hoh: 'Head of household',
};

/** Categorical slot CSS variables, in fixed order. Color follows the plan, never its rank. */
export const SLOT_VARS = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)', 'var(--s6)'] as const;
/** Ink for text set inside a slot fill: near-black on yellow (slot 4), white otherwise. */
export const SLOT_INK = ['#ffffff', '#ffffff', '#ffffff', '#0b0b0b', '#ffffff', '#ffffff'] as const;
