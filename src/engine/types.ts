/**
 * Core data model (docs/SPEC.md §5).
 *
 * Every money value is an annual U.S.-dollar amount, unrounded. Rounding happens
 * only for display (see money.ts). No tax parameter lives in this file: all of
 * them come from src/config/tax-years/<year>.json through config.ts.
 */

export type FilingStatus = 'single' | 'mfj' | 'mfs' | 'hoh';
export const FILING_STATUSES: readonly FilingStatus[] = ['single', 'mfj', 'mfs', 'hoh'];

/** Coverage tier the employee enrolls in. */
export type CoverageTier = 'self' | 'selfSpouse' | 'selfChildren' | 'family';
export const COVERAGE_TIERS: readonly CoverageTier[] = ['self', 'selfSpouse', 'selfChildren', 'family'];

/** IRS HSA/HDHP limits have only two tiers: self-only, and family (any tier covering 2+ people). */
export type LimitTier = 'selfOnly' | 'family';
export const limitTierFor = (tier: CoverageTier): LimitTier => (tier === 'self' ? 'selfOnly' : 'family');

// ---------------------------------------------------------------- Plan

export interface Plan {
  id: string;
  name: string;
  /** Label only. Behavior comes from the cost-sharing fields. */
  kind: 'PPO' | 'HMO' | 'EPO' | 'POS' | 'HDHP';
  /** Sample rows are shown with a "SAMPLE DATA" badge. */
  isSample: boolean;
  /** Where the numbers came from, e.g. "MultiCare 2027 guide". Display only. */
  sourceNote?: string;
  /** Claimed HSA eligibility. Checked against the year's IRS HDHP limits (accounts.ts). */
  hsaEligible: boolean;
  /** Employee share of the premium, per paycheck, for each tier. */
  premiumPerPaycheck: Record<CoverageTier, number>;
  deductible: { individual: number; family: number };
  /**
   * How the family deductible works. 'embedded': each person also has the
   * individual deductible. 'aggregate': the family must meet the whole family
   * deductible first. Default 'embedded'. Only matters with familySpend 'onePerson'.
   */
  familyDeductible?: 'embedded' | 'aggregate';
  oopMax: { individual: number; family: number };
  /** Employee share after the deductible, 0–1. */
  coinsurance: number;
  /** Flat copay per copay service before the deductible. null = services go through deductible/coinsurance. */
  copayPerVisit: number | null;
  /** Employer HSA contribution per year. Ignored unless the plan is HSA-eligible. */
  employerHsa: Record<LimitTier, number>;
}

// ---------------------------------------------------------------- Scenario

export type ScenarioId = 'low' | 'expected' | 'high';

export interface Scenario {
  id: ScenarioId;
  label: string;
  /** Total allowed charges for the year, or 'reachOopMax' = every plan hits its OOP max. */
  allowedSpend: number | 'reachOopMax';
  /** Count of copay services (office visits, generic Rx fills). */
  copayVisits: number;
}

// ---------------------------------------------------------------- Household (user inputs)

export interface CustomState {
  /** Flat state marginal income tax rate, 0–1. */
  marginalRate: number;
  /** True if the state taxes HSA contributions (does not follow the federal exclusion). */
  taxesHsa: boolean;
}

export interface Household {
  taxYear: number;
  /** Employee's W-2 gross wages. */
  grossWages: number;
  /** Other household taxable income (spouse wages, etc.). Income tax only; MFJ: also counts toward the Additional Medicare threshold. */
  otherHouseholdIncome: number;
  /** Traditional 401(k)/403(b) deferrals. Lower income-tax wages, not FICA wages. */
  preTaxRetirement: number;
  filingStatus: FilingStatus;
  /** A state key present in the tax config (e.g. 'WA'), or 'CUSTOM'. */
  state: string;
  customState?: CustomState;
  coverageTier: CoverageTier;
  /**
   * Family tiers only. 'pooled' (default): everyone's spending counts against the
   * family limits. 'onePerson': one person has all the care, so per-person
   * limits apply (embedded deductible, individual OOP max). SPEC Q5.
   */
  familySpend?: 'pooled' | 'onePerson';
  age: number;
  payPeriodsPerYear: 52 | 26 | 24 | 12;
  /** Section 125 pre-tax premiums (true for nearly all employers). */
  premiumsPreTax: boolean;
  /** Allowed (negotiated) cost of one copay service. */
  allowedPerVisit: number;
  /** Employee payroll HSA contribution, applied to HSA-eligible plans only. */
  hsaContribution: number;
  /** Health FSA election, applied to non-HSA plans only. */
  fsaContribution: number;
  fsaCarryoverAllowed: boolean;
}

// ---------------------------------------------------------------- Tax config (resolved)

export interface BracketRow {
  /** Rate applies to taxable income over this amount, up to the next row's `over`. */
  over: number;
  rate: number;
}

/** One tax parameter as cited in the math panel. */
export interface ParamRef {
  /** Path inside the config file, e.g. "federal.standardDeduction.single". */
  path: string;
  /** Human-readable value. */
  display: string;
  source: string;
  sourceTitle: string;
  url: string;
  pinpoint: string;
  userVerified: boolean;
}

export interface ResolvedStatePayrollTax {
  id: string;
  name: string;
  totalRate: number;
  employeeShare: number;
  /** null = no wage cap. */
  wageCap: number | null;
  reducedBySection125: boolean;
}

export interface ResolvedState {
  key: string;
  name: string;
  incomeTax: 'none';
  payrollTaxes: ResolvedStatePayrollTax[];
}

export interface SourceInfo {
  title: string;
  publisher: string;
  url: string;
  retrieved: string | null;
  readBy: string;
}

/** Plain-number view of a validated tax-year file, plus citations for every value. */
export interface ResolvedTaxConfig {
  taxYear: number;
  federal: {
    standardDeduction: Record<FilingStatus, number>;
    additionalStandardDeductionAge65OrBlind: { married: number; unmarried: number };
    brackets: Record<FilingStatus, BracketRow[]>;
  };
  fica: {
    socialSecurityRate: number;
    socialSecurityWageBase: number;
    medicareRate: number;
    additionalMedicareRate: number;
    additionalMedicareThreshold: Record<FilingStatus, number>;
    section125ExcludedFromFicaWages: boolean;
  };
  hsa: {
    contributionLimit: Record<LimitTier, number>;
    catchUpAge55: number;
    hdhpMinDeductible: Record<LimitTier, number>;
    hdhpMaxOutOfPocket: Record<LimitTier, number>;
  };
  healthFsa: { salaryReductionLimit: number; maxCarryover: number };
  states: Record<string, ResolvedState>;
  sources: Record<string, SourceInfo>;
  /** Citation for every parameter, keyed by path. */
  refs: Record<string, ParamRef>;
}

// ---------------------------------------------------------------- Results

export interface MathStep {
  label: string;
  /** Symbolic formula, e.g. "Net = P + OOP − TSp − TSa − E". */
  formula: string;
  /** The same formula with numbers filled in. */
  shown: string;
  result: number;
  /** Tax parameters this step used. */
  params: ParamRef[];
}

export interface TaxBreakdown {
  federalIncome: number;
  socialSecurity: number;
  medicare: number;
  additionalMedicare: number;
  stateIncome: number;
  statePayroll: number;
  total: number;
}

export type IssueSeverity = 'error' | 'warning' | 'info';

export interface Issue {
  severity: IssueSeverity;
  code: string;
  message: string;
  planId?: string;
}

export interface OopDetail {
  /** Allowed spend used; null when the High scenario's spend is unbounded. */
  allowedSpend: number | null;
  copayPortion: number;
  copays: number;
  remainder: number;
  deductiblePaid: number;
  coinsurancePaid: number;
  uncapped: number;
  oop: number;
  capped: boolean;
}

export interface PlanScenarioResult {
  planId: string;
  scenarioId: ScenarioId;
  annualPremium: number;
  outOfPocket: number;
  oopDetail: OopDetail;
  premiumTaxSavings: TaxBreakdown;
  accountTaxSavings: TaxBreakdown;
  /** Which account the account savings came from. */
  account: 'HSA' | 'FSA' | null;
  employeeHsa: number;
  employerHsa: number;
  fsaElection: number;
  fsaForfeit: number;
  netCost: number;
  math: MathStep[];
}

export interface RankRow {
  planId: string;
  netCost: number;
  /** netCost minus the cheapest plan's netCost (0 for the winner). */
  deltaVsBest: number;
}

export type BreakEvenCrossing =
  | { kind: 'point'; spend: number; cheaperBelow: string; cheaperAbove: string }
  | { kind: 'range'; from: number; to: number; cheaperBelow: string | 'tie'; cheaperAbove: string | 'tie' };

export interface BreakEven {
  planA: string;
  planB: string;
  /** Copay-visit count held fixed while spend varies. */
  copayVisits: number;
  /** Spend range searched: [0, searchedTo]. */
  searchedTo: number;
  crossings: BreakEvenCrossing[];
  cheaperAtZero: string | 'tie';
  /** Smallest gap (Net_loser − Net_winner) when there is no crossing. */
  minGapIfNoCrossing: number | null;
  summary: string;
  math: MathStep[];
}

/** One x-position of the cost-by-usage chart: net cost of every plan at that allowed spend. */
export interface CurvePoint {
  spend: number;
  costs: Record<string, number>;
}

/** A spend interval in which one plan is the cheapest. */
export interface CheapestSegment {
  from: number;
  to: number;
  planId: string;
}

export interface ComparisonResult {
  taxYear: number;
  results: PlanScenarioResult[];
  rankings: Record<ScenarioId, RankRow[]>;
  breakEvens: BreakEven[];
  /** Upper end of the cost-by-usage chart (spend axis). */
  chartMaxSpend: number;
  /** Copay visits held fixed for the chart and break-evens (the Expected scenario's). */
  chartVisits: number;
  curve: CurvePoint[];
  cheapestBySpend: CheapestSegment[];
  issues: Issue[];
  /** Config paths you have not yet marked userVerified. */
  unverifiedParams: string[];
}
