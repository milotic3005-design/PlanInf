/**
 * Employee taxes for a given set of pre-tax (Section 125) amounts (SPEC F2–F8).
 *
 * Tax savings are measured exactly, as T(before) − T(after), never as
 * marginal rate × amount (SPEC A7). That stays correct when a deduction
 * crosses a bracket edge or the Social Security wage base.
 */
import type { FilingStatus, Household, ResolvedTaxConfig, TaxBreakdown } from './types';
import { bracketTax, marginalRate } from './federal';

/** Section 125 amounts. `premium` must already be 0 if premiums are post-tax. */
export interface PreTaxAmounts {
  premium: number;
  hsa: number;
  fsa: number;
}

export const NO_PRE_TAX: PreTaxAmounts = { premium: 0, hsa: 0, fsa: 0 };

export interface PayrollTaxLine {
  id: string;
  name: string;
  wages: number;
  amount: number;
}

export interface TaxDetail extends TaxBreakdown {
  standardDeduction: number;
  taxableIncome: number;
  federalMarginalRate: number;
  ficaWages: number;
  /** Wages counted toward the Additional Medicare threshold (MFJ adds other household income). */
  additionalMedicareWages: number;
  /** Custom-state taxable income; null for a configured state. */
  stateTaxable: number | null;
  payroll: PayrollTaxLine[];
}

/** Standard deduction including the age-65 add-on (employee only; SPEC A6). */
export function standardDeductionFor(cfg: ResolvedTaxConfig, fs: FilingStatus, age: number): number {
  const base = cfg.federal.standardDeduction[fs];
  if (age < 65) return base;
  const married = fs === 'mfj' || fs === 'mfs';
  return base + cfg.federal.additionalStandardDeductionAge65OrBlind[married ? 'married' : 'unmarried'];
}

export function computeTaxes(cfg: ResolvedTaxConfig, h: Household, pre: PreTaxAmounts): TaxDetail {
  const fs = h.filingStatus;
  const s125 = pre.premium + pre.hsa + pre.fsa;

  // F3–F4: federal income tax
  const standardDeduction = standardDeductionFor(cfg, fs, h.age);
  const agi = h.grossWages - s125 - h.preTaxRetirement + h.otherHouseholdIncome;
  const taxableIncome = Math.max(0, agi - standardDeduction);
  const rows = cfg.federal.brackets[fs];
  const federalIncome = bracketTax(taxableIncome, rows);

  // F5: FICA. Section 125 amounts leave FICA wages; 401(k) deferrals do not.
  const ficaWages = Math.max(0, h.grossWages - (cfg.fica.section125ExcludedFromFicaWages ? s125 : 0));
  const socialSecurity = cfg.fica.socialSecurityRate * Math.min(ficaWages, cfg.fica.socialSecurityWageBase);
  const medicare = cfg.fica.medicareRate * ficaWages;
  const additionalMedicareWages = ficaWages + (fs === 'mfj' ? h.otherHouseholdIncome : 0); // SPEC Q7
  const additionalMedicare =
    cfg.fica.additionalMedicareRate * Math.max(0, additionalMedicareWages - cfg.fica.additionalMedicareThreshold[fs]);

  // F6: state
  let stateIncome = 0;
  let stateTaxable: number | null = null;
  const payroll: PayrollTaxLine[] = [];
  if (h.state === 'CUSTOM') {
    const cs = h.customState;
    if (!cs) throw new Error('state is CUSTOM but customState is missing');
    const stateExcluded = pre.premium + pre.fsa + (cs.taxesHsa ? 0 : pre.hsa);
    stateTaxable = Math.max(0, h.grossWages + h.otherHouseholdIncome - h.preTaxRetirement - stateExcluded);
    stateIncome = cs.marginalRate * stateTaxable;
  } else {
    const st = cfg.states[h.state];
    if (!st) throw new Error(`state "${h.state}" is not in the ${cfg.taxYear} tax config`);
    // incomeTax 'none' is the only v1 type (the loader rejects anything else).
    for (const pt of st.payrollTaxes) {
      const wages = Math.max(0, h.grossWages - (pt.reducedBySection125 ? s125 : 0));
      const capped = pt.wageCap === null ? wages : Math.min(wages, pt.wageCap);
      payroll.push({ id: pt.id, name: pt.name, wages: capped, amount: pt.totalRate * pt.employeeShare * capped });
    }
  }
  const statePayroll = payroll.reduce((a, p) => a + p.amount, 0);

  return {
    federalIncome,
    socialSecurity,
    medicare,
    additionalMedicare,
    stateIncome,
    statePayroll,
    total: federalIncome + socialSecurity + medicare + additionalMedicare + stateIncome + statePayroll,
    standardDeduction,
    taxableIncome,
    federalMarginalRate: marginalRate(taxableIncome, rows),
    ficaWages,
    additionalMedicareWages,
    stateTaxable,
    payroll,
  };
}

/** Component-wise a − b: the tax saved going from `a` (before) to `b` (after). */
export function taxSaved(before: TaxBreakdown, after: TaxBreakdown): TaxBreakdown {
  return {
    federalIncome: before.federalIncome - after.federalIncome,
    socialSecurity: before.socialSecurity - after.socialSecurity,
    medicare: before.medicare - after.medicare,
    additionalMedicare: before.additionalMedicare - after.additionalMedicare,
    stateIncome: before.stateIncome - after.stateIncome,
    statePayroll: before.statePayroll - after.statePayroll,
    total: before.total - after.total,
  };
}
