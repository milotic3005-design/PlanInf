/**
 * Input validation (Stage 4).
 *
 *  - blockingProblems(): inputs that would make the math meaningless (NaN,
 *    negative dollars, a coinsurance of 150%, an unknown state). compare()
 *    throws InputError on any of these instead of returning wrong numbers.
 *  - inputIssues(): advice and warnings shown next to the results; the
 *    comparison still runs. They cover the edge cases: income below the standard
 *    deduction, the HSA catch-up at 55+, Medicare at 65+, shared family HSA
 *    limits, and plans whose numbers don't hang together.
 */
import type { Household, Issue, Plan, ResolvedTaxConfig, Scenario } from './types';
import { COVERAGE_TIERS, FILING_STATUSES } from './types';
import { hsaAllowed } from './accounts';
import { standardDeductionFor } from './taxes';
import { fmtMoney } from './money';

export class InputError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Some inputs can't be used:\n- ${problems.join('\n- ')}`);
    this.name = 'InputError';
  }
}

const isMoney = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const isShare = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;

export function blockingProblems(h: Household, plans: Plan[], scenarios: Scenario[], cfg: ResolvedTaxConfig): string[] {
  const p: string[] = [];
  const money = (v: unknown, label: string) => {
    if (!isMoney(v)) p.push(`${label} must be a dollar amount of 0 or more (got ${String(v)}).`);
  };

  if (h.taxYear !== cfg.taxYear) p.push(`The inputs are for ${h.taxYear} but the tax values loaded are for ${cfg.taxYear}.`);
  money(h.grossWages, 'Gross wages');
  money(h.otherHouseholdIncome, 'Other household income');
  money(h.preTaxRetirement, '401(k)/403(b) contributions');
  money(h.hsaContribution, 'HSA contribution');
  money(h.fsaContribution, 'FSA election');
  if (!(typeof h.allowedPerVisit === 'number' && Number.isFinite(h.allowedPerVisit) && h.allowedPerVisit > 0)) {
    p.push('Allowed cost per visit must be more than $0.');
  }
  if (!Number.isInteger(h.age) || h.age < 0 || h.age > 120) p.push(`Age must be a whole number from 0 to 120 (got ${String(h.age)}).`);
  if (![12, 24, 26, 52].includes(h.payPeriodsPerYear)) p.push('Paychecks per year must be 12, 24, 26, or 52.');
  if (!FILING_STATUSES.includes(h.filingStatus)) p.push(`Unknown filing status "${String(h.filingStatus)}".`);
  if (!COVERAGE_TIERS.includes(h.coverageTier)) p.push(`Unknown coverage tier "${String(h.coverageTier)}".`);
  if (h.familySpend !== undefined && h.familySpend !== 'pooled' && h.familySpend !== 'onePerson') p.push('Family spending must be "pooled" or "onePerson".');
  if (h.state === 'CUSTOM') {
    const r = h.customState?.marginalRate;
    if (!(typeof r === 'number' && Number.isFinite(r) && r >= 0 && r < 1)) p.push('Your state tax rate must be from 0% to under 100%.');
  } else if (!cfg.states[h.state]) {
    p.push(`State "${h.state}" is not in the ${cfg.taxYear} tax values. Use "Another state" and enter its rate.`);
  }

  if (plans.length === 0) p.push('Add at least one plan.');
  if (new Set(plans.map((x) => x.id)).size !== plans.length) p.push('Each plan needs a unique id.');
  for (const pl of plans) {
    const n = pl.name.trim() || 'A plan';
    for (const t of COVERAGE_TIERS) money(pl.premiumPerPaycheck[t], `${n}: premium (${t})`);
    money(pl.deductible.individual, `${n}: individual deductible`);
    money(pl.deductible.family, `${n}: family deductible`);
    money(pl.oopMax.individual, `${n}: individual out-of-pocket max`);
    money(pl.oopMax.family, `${n}: family out-of-pocket max`);
    money(pl.employerHsa.selfOnly, `${n}: employer HSA (employee only)`);
    money(pl.employerHsa.family, `${n}: employer HSA (family)`);
    if (!isShare(pl.coinsurance)) p.push(`${n}: coinsurance must be from 0% to 100%.`);
    if (pl.copayPerVisit !== null && !isMoney(pl.copayPerVisit)) p.push(`${n}: copay must be blank or a dollar amount of 0 or more.`);
  }

  for (const s of scenarios) {
    if (s.allowedSpend !== 'reachOopMax') money(s.allowedSpend, `${s.label} spending`);
    if (!Number.isInteger(s.copayVisits) || s.copayVisits < 0) p.push(`${s.label}: visits must be a whole number of 0 or more.`);
  }
  return p;
}

export function inputIssues(h: Household, plans: Plan[], scenarios: Scenario[], cfg: ResolvedTaxConfig): Issue[] {
  const out: Issue[] = [];
  const add = (severity: Issue['severity'], code: string, message: string, planId?: string) => out.push({ severity, code, message, planId });
  const hsaPlans = plans.filter((p) => hsaAllowed(p, cfg, h.coverageTier));
  const married = h.filingStatus === 'mfj' || h.filingStatus === 'mfs';

  // ---- income
  const std = standardDeductionFor(cfg, h.filingStatus, h.age);
  if (h.grossWages === 0) {
    add('warning', 'NO_WAGES', 'With $0 in wages there is no paycheck to take pre-tax deductions from, so no plan gets tax savings.');
  } else if (h.grossWages + h.otherHouseholdIncome - h.preTaxRetirement <= std) {
    add(
      'info',
      'INCOME_BELOW_STANDARD_DEDUCTION',
      `Your income is at or below the ${cfg.taxYear} standard deduction (${fmtMoney(std)}), so you owe no federal income tax either way. Pre-tax deductions still save Social Security and Medicare tax. This tool doesn't model credits such as the EITC, which pre-tax deductions can change. Check those separately.`,
    );
  }

  // ---- HSA edge cases
  if (hsaPlans.length > 0) {
    if (h.age >= 65) {
      add(
        'warning',
        'AGE_65_MEDICARE',
        'Once you enroll in any part of Medicare (Part A starts automatically when you begin Social Security), you can no longer contribute to an HSA (IRS Pub. 969). If you are on Medicare, set your HSA amount to $0.',
      );
    } else if (h.age >= 55) {
      add(
        'info',
        'HSA_CATCH_UP',
        `At 55 or older your HSA maximum includes the ${fmtMoney(cfg.hsa.catchUpAge55)} catch-up. A spouse who is also 55+ needs their own HSA to make theirs.`,
      );
    }
    if (married && h.coverageTier !== 'self') {
      add(
        'info',
        'HSA_FAMILY_LIMIT_SHARED',
        h.filingStatus === 'mfs'
          ? 'With family HDHP coverage, you and your spouse share one family HSA limit, split equally unless you agree otherwise. Enter only your share.'
          : "With family HDHP coverage, you and your spouse share one family HSA limit. Your spouse's contributions count against it too.",
      );
    }
  }
  if (h.hsaContribution > 0 && hsaPlans.length === 0) {
    add('info', 'HSA_NO_ELIGIBLE_PLAN', 'None of your plans can be paired with an HSA for your tier, so your HSA amount is not used.');
  }
  if (h.fsaContribution > 0 && plans.length > 0 && plans.every((p) => hsaAllowed(p, cfg, h.coverageTier))) {
    add('info', 'FSA_ONLY_HSA_PLANS', 'Every plan here is HSA-eligible, and a general-purpose health FSA would make you ineligible for the HSA, so your FSA amount is not used.');
  }

  // ---- spending inputs
  const expected = scenarios.find((s) => s.id === 'expected');
  const low = scenarios.find((s) => s.id === 'low');
  if (expected && typeof expected.allowedSpend === 'number' && expected.copayVisits * h.allowedPerVisit > expected.allowedSpend) {
    add(
      'info',
      'VISITS_EXCEED_SPEND',
      `${expected.copayVisits} visits at ${fmtMoney(h.allowedPerVisit)} each (${fmtMoney(expected.copayVisits * h.allowedPerVisit)}) is more than your expected spending of ${fmtMoney(expected.allowedSpend)}. Copays are scaled down to fit the spending.`,
    );
  }
  if (low && expected && typeof low.allowedSpend === 'number' && typeof expected.allowedSpend === 'number' && low.allowedSpend > expected.allowedSpend) {
    add('info', 'LOW_ABOVE_EXPECTED', 'Your low-use spending is higher than your expected spending. Check the two amounts.');
  }
  if (h.coverageTier !== 'self' && (h.familySpend ?? 'pooled') === 'onePerson') {
    add('info', 'ONE_PERSON_SPEND', "Assuming one person has all the care, so each plan's per-person deductible and out-of-pocket max apply. Real costs fall between this and the pooled estimate.");
  }

  // ---- plans
  const names = new Map<string, number>();
  for (const p of plans) names.set(p.name.trim().toLowerCase(), (names.get(p.name.trim().toLowerCase()) ?? 0) + 1);
  for (const p of plans) {
    const n = p.name.trim() || 'A plan';
    if (!p.name.trim()) add('warning', 'PLAN_NO_NAME', 'A plan has no name, so it is hard to tell apart in the results.', p.id);
    else if ((names.get(p.name.trim().toLowerCase()) ?? 0) > 1) add('warning', 'PLAN_DUPLICATE_NAME', `Two plans are named "${p.name.trim()}". Rename one so the results are clear.`, p.id);

    for (const col of ['individual', 'family'] as const) {
      if (p.deductible[col] > p.oopMax[col]) {
        add('error', 'PLAN_DEDUCTIBLE_ABOVE_OOP', `${n}: the ${col} deductible (${fmtMoney(p.deductible[col])}) is higher than the ${col} out-of-pocket max (${fmtMoney(p.oopMax[col])}). The max includes the deductible, so check the numbers.`, p.id);
      }
    }
    if (p.deductible.family < p.deductible.individual || p.oopMax.family < p.oopMax.individual) {
      add('warning', 'PLAN_FAMILY_BELOW_INDIVIDUAL', `${n}: a family amount is lower than the individual amount. Family limits are usually about double.`, p.id);
    }
    const premium = p.premiumPerPaycheck[h.coverageTier] * h.payPeriodsPerYear;
    const pretax = (h.premiumsPreTax ? premium : 0) + (hsaAllowed(p, cfg, h.coverageTier) ? h.hsaContribution : h.fsaContribution);
    if (h.grossWages > 0 && pretax > h.grossWages) {
      add('error', 'PRE_TAX_EXCEEDS_WAGES', `${n}: premiums plus pre-tax account money (${fmtMoney(pretax)}) are more than your wages (${fmtMoney(h.grossWages)}). They can't all come out of your pay.`, p.id);
    }
    if (p.coinsurance > 0.5) add('info', 'PLAN_HIGH_COINSURANCE', `${n}: coinsurance over 50% is unusual. Check that it's your share, not the plan's.`, p.id);
    if (p.copayPerVisit !== null && p.copayPerVisit > h.allowedPerVisit) {
      add('info', 'COPAY_ABOVE_VISIT_COST', `${n}: the ${fmtMoney(p.copayPerVisit)} copay is more than the ${fmtMoney(h.allowedPerVisit)} allowed cost per visit, so each visit costs only ${fmtMoney(h.allowedPerVisit)}.`, p.id);
    }
    const empty = Object.values(p.premiumPerPaycheck).every((v) => v === 0) && p.deductible.individual === 0 && p.oopMax.individual === 0;
    if (empty) add('warning', 'PLAN_LOOKS_EMPTY', `${n} has no premium, deductible, or out-of-pocket max yet. Fill it in from your benefits guide.`, p.id);
  }
  return out;
}
