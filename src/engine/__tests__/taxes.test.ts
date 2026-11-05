import { describe, expect, it } from 'vitest';
import { bracketTax } from '../federal';
import { computeTaxes, NO_PRE_TAX, standardDeductionFor, taxSaved } from '../taxes';
import { buildPlanContext } from '../netCost';
import { cfg2026, hh, plan } from './fixtures';

const single = cfg2026.federal.brackets.single;
/** Tax saved by a pre-tax premium of `p` for household `h`. */
const premiumSavings = (p: number, over: Parameters<typeof hh>[0]) => {
  const h = hh({ hsaContribution: 0, ...over });
  return taxSaved(computeTaxes(cfg2026, h, NO_PRE_TAX), computeTaxes(cfg2026, h, { premium: p, hsa: 0, fsa: 0 }));
};

describe('federal income tax', () => {
  it('T2: tax at a bracket edge (single, TI = $50,400) is the IRS base amount $5,800', () => {
    expect(bracketTax(50400, single)).toBeCloseTo(5800, 6);
    expect(bracketTax(68900, single)).toBeCloseTo(9870, 6);
    expect(bracketTax(0, single)).toBe(0);
  });

  it('T3: income below the standard deduction saves no income tax, but FICA savings remain', () => {
    const s = premiumSavings(1000, { grossWages: 15000 });
    expect(computeTaxes(cfg2026, hh({ grossWages: 15000 }), NO_PRE_TAX).taxableIncome).toBe(0);
    expect(s.federalIncome).toBe(0);
    expect(s.socialSecurity + s.medicare).toBeCloseTo(76.5, 6); // 7.65% × 1,000
  });

  it('T4: a premium that crosses a bracket edge is taxed at both rates (not marginal × amount)', () => {
    // TI 51,000 → 49,000: 600 at 22% + 1,400 at 12% = 300
    const s = premiumSavings(2000, { grossWages: 51000 + 16100 });
    expect(s.federalIncome).toBeCloseTo(300, 6);
  });

  it('adds the age-65 standard deduction (single: $2,050)', () => {
    expect(standardDeductionFor(cfg2026, 'single', 64)).toBe(16100);
    expect(standardDeductionFor(cfg2026, 'single', 65)).toBe(18150);
    expect(standardDeductionFor(cfg2026, 'mfj', 70)).toBe(33850);
  });
});

describe('FICA', () => {
  it('T5: wages above the Social Security wage base: no SS savings; Medicare and Additional Medicare still save', () => {
    const s = premiumSavings(2000, { grossWages: 220000 });
    expect(s.socialSecurity).toBe(0);
    expect(s.medicare).toBeCloseTo(29, 6);
    expect(s.additionalMedicare).toBeCloseTo(18, 6);
    expect(s.federalIncome).toBeCloseTo(2000 * 0.32, 6); // TI 203,900 → 201,900, both above the 32% start (201,775)
  });

  it('T6: wages straddling the wage base save SS only on the part below it', () => {
    const s = premiumSavings(2000, { grossWages: 185500 });
    expect(s.socialSecurity).toBeCloseTo(62, 6); // 6.2% × 1,000
  });

  it('MFJ: other household income counts toward the $250,000 Additional Medicare threshold', () => {
    const t = computeTaxes(cfg2026, hh({ filingStatus: 'mfj', grossWages: 200000, otherHouseholdIncome: 100000 }), NO_PRE_TAX);
    expect(t.additionalMedicare).toBeCloseTo(450, 6); // 0.9% × (300,000 − 250,000)
    const s = premiumSavings(2000, { filingStatus: 'mfj', grossWages: 200000, otherHouseholdIncome: 100000 });
    expect(s.additionalMedicare).toBeCloseTo(18, 6);
  });
});

describe('state', () => {
  it('T18: WA Paid Leave and WA Cares are charged on gross wages, so they never change between plans', () => {
    const base = computeTaxes(cfg2026, hh(), NO_PRE_TAX);
    expect(base.payroll[0]!.amount).toBeCloseTo(85000 * 0.0113 * 0.7143, 6);
    expect(base.payroll[1]!.amount).toBeCloseTo(85000 * 0.0058, 6);
    for (const id of ['sample-ppo', 'sample-hmo', 'sample-hdhp'] as const) {
      const c = buildPlanContext(plan(id), hh(), cfg2026);
      expect(c.premiumTaxSavings.statePayroll, id).toBe(0);
      expect(c.accountTaxSavings.statePayroll, id).toBe(0);
      expect(c.premiumTaxSavings.stateIncome, id).toBe(0);
    }
  });

  it('custom state: flat rate on premiums; HSA taxed or not per the toggle', () => {
    const taxed = buildPlanContext(plan('sample-hdhp'), hh({ state: 'CUSTOM', customState: { marginalRate: 0.05, taxesHsa: true } }), cfg2026);
    expect(taxed.premiumTaxSavings.stateIncome).toBeCloseTo(0.05 * 650, 6);
    expect(taxed.accountTaxSavings.stateIncome).toBe(0);
    const excluded = buildPlanContext(plan('sample-hdhp'), hh({ state: 'CUSTOM', customState: { marginalRate: 0.05, taxesHsa: false } }), cfg2026);
    expect(excluded.accountTaxSavings.stateIncome).toBeCloseTo(100, 6);
  });

  it('throws on an unknown state key', () => {
    expect(() => computeTaxes(cfg2026, hh({ state: 'OR' }), NO_PRE_TAX)).toThrow(/not in the 2026 tax config/);
  });
});

describe('tax-savings attribution', () => {
  it('premium + account savings add up exactly to T(none) − T(all)', () => {
    const c = buildPlanContext(plan('sample-hdhp'), hh(), cfg2026);
    expect(c.premiumTaxSavings.total + c.accountTaxSavings.total).toBeCloseTo(c.taxBase.total - c.taxAfterAll.total, 9);
  });

  it('post-tax premiums produce no premium tax savings', () => {
    const c = buildPlanContext(plan('sample-ppo'), hh({ premiumsPreTax: false }), cfg2026);
    expect(c.premiumTaxSavings.total).toBe(0);
  });
});
