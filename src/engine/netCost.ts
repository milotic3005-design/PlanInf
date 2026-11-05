/**
 * Net after-tax cost of one plan in one scenario (SPEC F1, F8, F11), with a
 * step-by-step "show math" trace for every number.
 *
 *   Net = P + OOP + FSA forfeit − premium tax savings − account tax savings − employer HSA
 *
 * Tax savings are attributed in sequence: premium first, then HSA/FSA (SPEC F8).
 * The two parts add up exactly to T(no pre-tax) − T(all pre-tax).
 */
import type {
  Household,
  Issue,
  MathStep,
  Plan,
  PlanScenarioResult,
  ResolvedTaxConfig,
  Scenario,
  TaxBreakdown,
} from './types';
import { costShareFor, outOfPocket, outOfPocketAtMax, spendToReachOop, type CostShare } from './oop';
import { effectiveFsa, effectiveHsa, employerHsaFor, fsaForfeit, hdhpIssues, hsaAllowed } from './accounts';
import { computeTaxes, NO_PRE_TAX, taxSaved, type TaxDetail } from './taxes';
import { refsFor } from './config';
import { fmtMoney, fmtNum, fmtPct } from './money';

/** Everything about a plan that doesn't depend on how much care is used. */
export interface PlanContext {
  plan: Plan;
  costShare: CostShare;
  premiumPerPaycheck: number;
  payPeriods: number;
  annualPremium: number;
  /** Premium counted as Section 125 (0 if premiums are post-tax). */
  pretaxPremium: number;
  account: 'HSA' | 'FSA' | null;
  employeeHsa: number;
  employerHsa: number;
  fsaElection: number;
  /** Carryover that is not forfeited (0 unless the plan allows carryover). */
  fsaCarryover: number;
  taxBase: TaxDetail;
  taxAfterPremium: TaxDetail;
  taxAfterAll: TaxDetail;
  premiumTaxSavings: TaxBreakdown;
  accountTaxSavings: TaxBreakdown;
  /** P − premium savings − account savings − employer HSA. */
  fixedCost: number;
  issues: Issue[];
}

export function buildPlanContext(plan: Plan, h: Household, cfg: ResolvedTaxConfig): PlanContext {
  const issues = hdhpIssues(plan, cfg, h.coverageTier);
  const premiumPerPaycheck = plan.premiumPerPaycheck[h.coverageTier];
  const annualPremium = premiumPerPaycheck * h.payPeriodsPerYear; // F1
  const pretaxPremium = h.premiumsPreTax ? annualPremium : 0;
  const hsaOk = hsaAllowed(plan, cfg, h.coverageTier);
  const employeeHsa = effectiveHsa(plan, h, cfg, issues);
  const employerHsa = employerHsaFor(plan, h.coverageTier, cfg);
  const fsaElection = effectiveFsa(plan, h, cfg, issues);
  const fsaCarryover = fsaElection > 0 && h.fsaCarryoverAllowed ? Math.min(cfg.healthFsa.maxCarryover, fsaElection) : 0;

  const taxBase = computeTaxes(cfg, h, NO_PRE_TAX);
  const taxAfterPremium = computeTaxes(cfg, h, { premium: pretaxPremium, hsa: 0, fsa: 0 });
  const taxAfterAll = computeTaxes(cfg, h, { premium: pretaxPremium, hsa: employeeHsa, fsa: fsaElection });
  const premiumTaxSavings = taxSaved(taxBase, taxAfterPremium);
  const accountTaxSavings = taxSaved(taxAfterPremium, taxAfterAll);

  return {
    plan,
    costShare: costShareFor(plan, h.coverageTier, h.familySpend ?? 'pooled'),
    premiumPerPaycheck,
    payPeriods: h.payPeriodsPerYear,
    annualPremium,
    pretaxPremium,
    account: hsaOk ? 'HSA' : fsaElection > 0 ? 'FSA' : null,
    employeeHsa,
    employerHsa,
    fsaElection,
    fsaCarryover,
    taxBase,
    taxAfterPremium,
    taxAfterAll,
    premiumTaxSavings,
    accountTaxSavings,
    fixedCost: annualPremium - premiumTaxSavings.total - accountTaxSavings.total - employerHsa,
    issues,
  };
}

/** Net cost at a given allowed spend (used by scenarios, break-even and the chart). */
export function netCostAt(ctx: PlanContext, spend: number, visits: number, perVisit: number) {
  const oop = outOfPocket(ctx.costShare, spend, visits, perVisit);
  const forfeit = fsaForfeit(ctx.fsaElection, oop.oop, ctx.fsaCarryover);
  return { oop, forfeit, netCost: ctx.fixedCost + oop.oop + forfeit };
}

export function evaluateScenario(ctx: PlanContext, sc: Scenario, h: Household, cfg: ResolvedTaxConfig): PlanScenarioResult {
  const n = sc.copayVisits;
  const a = h.allowedPerVisit;
  const oopDetail =
    sc.allowedSpend === 'reachOopMax'
      ? outOfPocketAtMax(ctx.costShare, n, a)
      : outOfPocket(ctx.costShare, sc.allowedSpend, n, a);
  const forfeit = fsaForfeit(ctx.fsaElection, oopDetail.oop, ctx.fsaCarryover);
  const netCost = ctx.fixedCost + oopDetail.oop + forfeit;

  const math: MathStep[] = [
    premiumStep(ctx),
    ...oopSteps(ctx, sc, a, oopDetail),
    ...taxSteps('Premium tax savings', ctx.taxBase, ctx.taxAfterPremium, ctx.premiumTaxSavings, h, cfg),
  ];
  if (ctx.account && (ctx.employeeHsa > 0 || ctx.fsaElection > 0)) {
    const amt = ctx.account === 'HSA' ? ctx.employeeHsa : ctx.fsaElection;
    math.push({
      label: `${ctx.account} contribution`,
      formula: ctx.account === 'HSA' ? 'H = your HSA amount, capped at limit + catch-up − employer HSA' : 'F = your FSA election, capped at the IRS limit',
      shown: fmtMoney(amt),
      result: amt,
      params:
        ctx.account === 'HSA'
          ? refsFor(cfg, `hsa.contributionLimit.${h.coverageTier === 'self' ? 'selfOnly' : 'family'}`, ...(h.age >= 55 ? ['hsa.catchUpAge55'] : []))
          : refsFor(cfg, 'healthFsa.salaryReductionLimit'),
    });
    math.push(...taxSteps(`${ctx.account} tax savings`, ctx.taxAfterPremium, ctx.taxAfterAll, ctx.accountTaxSavings, h, cfg));
  }
  if (ctx.employerHsa > 0) {
    math.push({ label: 'Employer HSA contribution', formula: 'E = employer HSA amount for your tier', shown: fmtMoney(ctx.employerHsa), result: ctx.employerHsa, params: [] });
  }
  if (ctx.fsaElection > 0) {
    math.push({
      label: 'FSA forfeit',
      formula: 'max(0, F − OOP − carryover)',
      shown: `max(0, ${fmtMoney(ctx.fsaElection)} − ${fmtMoney(oopDetail.oop)} − ${fmtMoney(ctx.fsaCarryover)}) = ${fmtMoney(forfeit)}`,
      result: forfeit,
      params: ctx.fsaCarryover > 0 ? refsFor(cfg, 'healthFsa.maxCarryover') : [],
    });
  }
  math.push({
    label: 'Net after-tax cost',
    formula: 'Net = P + OOP + FSA forfeit − premium tax savings − account tax savings − employer HSA',
    shown: `${fmtMoney(ctx.annualPremium)} + ${fmtMoney(oopDetail.oop)} + ${fmtMoney(forfeit)} − ${fmtMoney(ctx.premiumTaxSavings.total)} − ${fmtMoney(ctx.accountTaxSavings.total)} − ${fmtMoney(ctx.employerHsa)} = ${fmtMoney(netCost)} (terms rounded for display; total uses unrounded values)`,
    result: netCost,
    params: [],
  });

  return {
    planId: ctx.plan.id,
    scenarioId: sc.id,
    annualPremium: ctx.annualPremium,
    outOfPocket: oopDetail.oop,
    oopDetail,
    premiumTaxSavings: ctx.premiumTaxSavings,
    accountTaxSavings: ctx.accountTaxSavings,
    account: ctx.account,
    employeeHsa: ctx.employeeHsa,
    employerHsa: ctx.employerHsa,
    fsaElection: ctx.fsaElection,
    fsaForfeit: forfeit,
    netCost,
    math,
  };
}

// ------------------------------------------------------------------ math helpers

function premiumStep(ctx: PlanContext): MathStep {
  return {
    label: 'Annual premium',
    formula: 'P = premium per paycheck × pay periods per year',
    shown: `${fmtMoney(ctx.premiumPerPaycheck)} × ${ctx.payPeriods} = ${fmtMoney(ctx.annualPremium)}`,
    result: ctx.annualPremium,
    params: [],
  };
}

function oopSteps(ctx: PlanContext, sc: Scenario, a: number, d: PlanScenarioResult['oopDetail']): MathStep[] {
  const cs = ctx.costShare;
  if (sc.allowedSpend === 'reachOopMax') {
    const s = spendToReachOop(cs, sc.copayVisits, a);
    return [
      {
        label: 'Out-of-pocket (High use)',
        formula: 'OOP = out-of-pocket max (High use means the max is reached)',
        shown: `${fmtMoney(cs.oopMax)}${Number.isFinite(s) ? ` (reached at about ${fmtMoney(s)} of allowed charges)` : ' (this plan only reaches it with more copay visits than entered)'}`,
        result: d.oop,
        params: [],
      },
    ];
  }
  const S = sc.allowedSpend;
  const n = sc.copayVisits;
  const steps: MathStep[] = [];
  if (cs.copayPerVisit !== null && n > 0) {
    const perVisit = Math.min(cs.copayPerVisit, a);
    steps.push(
      { label: 'Copay services', formula: 'V = min(n × a, S)', shown: `min(${fmtNum(n)} × ${fmtMoney(a)}, ${fmtMoney(S)}) = ${fmtMoney(d.copayPortion)}`, result: d.copayPortion, params: [] },
      { label: 'Copays', formula: 'C = V × min(copay, a) ÷ a', shown: `${fmtMoney(d.copayPortion)} × ${fmtMoney(perVisit)} ÷ ${fmtMoney(a)} = ${fmtMoney(d.copays)}`, result: d.copays, params: [] },
      { label: 'Rest of care', formula: 'R = S − V', shown: `${fmtMoney(S)} − ${fmtMoney(d.copayPortion)} = ${fmtMoney(d.remainder)}`, result: d.remainder, params: [] },
    );
  } else {
    steps.push({ label: 'Care subject to deductible', formula: 'R = S (no copays on this plan)', shown: fmtMoney(S), result: d.remainder, params: [] });
  }
  steps.push(
    { label: 'Deductible paid', formula: 'D = min(R, deductible)', shown: `min(${fmtMoney(d.remainder)}, ${fmtMoney(cs.deductible)}) = ${fmtMoney(d.deductiblePaid)}`, result: d.deductiblePaid, params: [] },
    {
      label: 'Coinsurance paid',
      formula: 'CI = coinsurance × max(0, R − deductible)',
      shown: `${fmtPct(cs.coinsurance)} × max(0, ${fmtMoney(d.remainder)} − ${fmtMoney(cs.deductible)}) = ${fmtMoney(d.coinsurancePaid)}`,
      result: d.coinsurancePaid,
      params: [],
    },
    {
      label: 'Out-of-pocket',
      formula: 'OOP = min(C + D + CI, out-of-pocket max)',
      shown: `min(${fmtMoney(d.copays)} + ${fmtMoney(d.deductiblePaid)} + ${fmtMoney(d.coinsurancePaid)}, ${fmtMoney(cs.oopMax)}) = ${fmtMoney(d.oop)}`,
      result: d.oop,
      params: [],
    },
  );
  return steps;
}

/** One step per tax that changes, plus a total. Before/after are full tax computations (SPEC A7). */
function taxSteps(
  title: string,
  before: TaxDetail,
  after: TaxDetail,
  saved: TaxBreakdown,
  h: Household,
  cfg: ResolvedTaxConfig,
): MathStep[] {
  const fs = h.filingStatus;
  const f = cfg.fica;
  const steps: MathStep[] = [];

  steps.push({
    label: `${title}: federal income tax`,
    formula: 'FIT(TI before) − FIT(TI after); TI = max(0, wages − pre-tax − 401(k) + other income − standard deduction)',
    shown: `FIT(${fmtMoney(before.taxableIncome)}) − FIT(${fmtMoney(after.taxableIncome)}) = ${fmtMoney(before.federalIncome)} − ${fmtMoney(after.federalIncome)} = ${fmtMoney(saved.federalIncome)} (marginal rate ${fmtPct(before.federalMarginalRate)})`,
    result: saved.federalIncome,
    params: refsFor(
      cfg,
      `federal.brackets.${fs}`,
      `federal.standardDeduction.${fs}`,
      ...(h.age >= 65 ? [`federal.additionalStandardDeductionAge65OrBlind.${fs === 'mfj' || fs === 'mfs' ? 'married' : 'unmarried'}`] : []),
    ),
  });

  const ssB = Math.min(before.ficaWages, f.socialSecurityWageBase);
  const ssA = Math.min(after.ficaWages, f.socialSecurityWageBase);
  steps.push({
    label: `${title}: Social Security`,
    formula: 'SS rate × (min(FICA wages before, wage base) − min(FICA wages after, wage base))',
    shown: `${fmtPct(f.socialSecurityRate)} × (${fmtMoney(ssB)} − ${fmtMoney(ssA)}) = ${fmtMoney(saved.socialSecurity)}`,
    result: saved.socialSecurity,
    params: refsFor(cfg, 'fica.socialSecurityRate', 'fica.socialSecurityWageBase', 'fica.section125ExcludedFromFicaWages'),
  });
  steps.push({
    label: `${title}: Medicare`,
    formula: 'Medicare rate × (FICA wages before − FICA wages after)',
    shown: `${fmtPct(f.medicareRate)} × (${fmtMoney(before.ficaWages)} − ${fmtMoney(after.ficaWages)}) = ${fmtMoney(saved.medicare)}`,
    result: saved.medicare,
    params: refsFor(cfg, 'fica.medicareRate', 'fica.section125ExcludedFromFicaWages'),
  });
  if (before.additionalMedicare > 0) {
    const thr = f.additionalMedicareThreshold[fs];
    steps.push({
      label: `${title}: Additional Medicare tax`,
      formula: '0.9% × (max(0, wages before − threshold) − max(0, wages after − threshold))',
      shown: `${fmtPct(f.additionalMedicareRate)} × (${fmtMoney(Math.max(0, before.additionalMedicareWages - thr))} − ${fmtMoney(Math.max(0, after.additionalMedicareWages - thr))}) = ${fmtMoney(saved.additionalMedicare)}`,
      result: saved.additionalMedicare,
      params: refsFor(cfg, 'fica.additionalMedicareRate', `fica.additionalMedicareThreshold.${fs}`),
    });
  }

  if (h.state === 'CUSTOM' && h.customState) {
    steps.push({
      label: `${title}: state income tax (custom rate)`,
      formula: 'your state rate × (state taxable before − state taxable after)',
      shown: `${fmtPct(h.customState.marginalRate)} × (${fmtMoney(before.stateTaxable ?? 0)} − ${fmtMoney(after.stateTaxable ?? 0)}) = ${fmtMoney(saved.stateIncome)} (rate is your input, not a sourced parameter)`,
      result: saved.stateIncome,
      params: [],
    });
  } else {
    const st = cfg.states[h.state];
    if (st) {
      steps.push({
        label: `${title}: ${st.name} income tax`,
        formula: 'no state income tax on wages',
        shown: fmtMoney(saved.stateIncome),
        result: saved.stateIncome,
        params: refsFor(cfg, `states.${st.key}.incomeTax.type`),
      });
      st.payrollTaxes.forEach((pt, i) => {
        const b = before.payroll[i]!;
        const a = after.payroll[i]!;
        const p = `states.${st.key}.payrollTaxes[${i}]`;
        steps.push({
          label: `${title}: ${pt.name}`,
          formula: pt.reducedBySection125
            ? 'rate × employee share × (wages before − wages after)'
            : 'charged on gross wages; pre-tax deductions do not lower it',
          shown: `${fmtPct(pt.totalRate)} × ${fmtPct(pt.employeeShare)} × (${fmtMoney(b.wages)} − ${fmtMoney(a.wages)}) = ${fmtMoney(b.amount - a.amount)}`,
          result: b.amount - a.amount,
          params: refsFor(cfg, `${p}.totalRate`, `${p}.employeeShare`, `${p}.wageCap`, `${p}.reducedBySection125`),
        });
      });
    }
  }

  steps.push({
    label: `${title}: total`,
    formula: 'sum of the lines above = T(before) − T(after)',
    shown: `${fmtMoney(before.total)} − ${fmtMoney(after.total)} = ${fmtMoney(saved.total)}`,
    result: saved.total,
    params: [],
  });
  return steps;
}
