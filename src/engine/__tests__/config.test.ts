import { describe, expect, it } from 'vitest';
import raw2027 from '../../config/tax-years/2027.json';
import { resolveTaxConfig, TaxConfigError, unverifiedParams } from '../config';
import { derivedBaseAmounts } from '../federal';
import { FILING_STATUSES } from '../types';
import { loadTaxYears, latestUsableYear } from '../../config';
import { cfg2026, raw2026Json, rawCopy } from './fixtures';

function problemsOf(raw: unknown): string[] {
  try {
    resolveTaxConfig(raw);
  } catch (e) {
    if (e instanceof TaxConfigError) return e.problems;
    throw e;
  }
  return [];
}

describe('tax config loader', () => {
  it('loads 2026 and cites a source for every one of its 37 parameters', () => {
    expect(cfg2026.taxYear).toBe(2026);
    const refs = Object.values(cfg2026.refs);
    expect(refs).toHaveLength(37);
    for (const r of refs) {
      expect(r.source, r.path).toBeTruthy();
      expect(r.url, r.path).toMatch(/^https:\/\//);
      expect(r.pinpoint.length, r.path).toBeGreaterThan(0);
    }
  });

  it('T1: 2026 bracket tables reproduce the IRS-printed base amounts for all 4 filing statuses', () => {
    const json = raw2026Json as unknown as { federal: { brackets: Record<string, { printedBaseAmounts: number[] }> } };
    for (const fs of FILING_STATUSES) {
      expect(derivedBaseAmounts(cfg2026.federal.brackets[fs]), fs).toEqual(json.federal.brackets[fs]!.printedBaseAmounts);
    }
  });

  it('T1: rejects a mistyped bracket threshold', () => {
    const raw = rawCopy();
    raw.federal.brackets.single.value[2].over = 50500; // IRS: 50,400
    const p = problemsOf(raw);
    expect(p.some((m) => m.includes('federal.brackets.single') && m.includes('Check the transcription'))).toBe(true);
  });

  it('T17: refuses a year with an unpublished (null) value', () => {
    const raw = rawCopy();
    raw.federal.standardDeduction.single = { value: null, status: 'awaiting-irs-publication', source: 'irs-rp-2025-32', pinpoint: 'x', userVerified: false };
    raw.healthFsa.maxCarryover.value = null;
    raw.healthFsa.maxCarryover.status = 'awaiting-irs-publication';
    const p = problemsOf(raw);
    expect(p).toHaveLength(2);
    expect(p.every((m) => m.includes('awaiting-irs-publication'))).toBe(true);
  });

  it('T17: refuses a parameter whose source is not listed', () => {
    const raw = rawCopy();
    raw.fica.medicareRate.source = 'made-up-source';
    expect(problemsOf(raw)).toContain('fica.medicareRate: source "made-up-source" is not listed in "sources"');
  });

  it('T17: refuses a parameter without a pinpoint or userVerified flag', () => {
    const raw = rawCopy();
    delete raw.hsa.catchUpAge55.pinpoint;
    delete raw.hsa.catchUpAge55.userVerified;
    const p = problemsOf(raw);
    expect(p).toContain('hsa.catchUpAge55: missing pinpoint (section/table/quote in the source)');
    expect(p).toContain('hsa.catchUpAge55: userVerified must be true or false');
  });

  it('refuses an out-of-range rate', () => {
    const raw = rawCopy();
    raw.fica.socialSecurityRate.value = 6.2; // percent typed instead of a fraction
    expect(problemsOf(raw).some((m) => m.startsWith('fica.socialSecurityRate: expected a rate'))).toBe(true);
  });

  it('T1: 2027 loads, and its brackets reproduce the base amounts printed in Rev. Proc. 2026-35', () => {
    const cfg = resolveTaxConfig(raw2027);
    expect(cfg.taxYear).toBe(2027);
    expect(Object.values(cfg.refs)).toHaveLength(37);
    const json = raw2027 as unknown as { federal: { brackets: Record<string, { printedBaseAmounts: number[] }> } };
    for (const fs of FILING_STATUSES) expect(derivedBaseAmounts(cfg.federal.brackets[fs]), fs).toEqual(json.federal.brackets[fs]!.printedBaseAmounts);
  });

  it('2027 values match Rev. Proc. 2026-35, Rev. Proc. 2026-24, Pub 15 (2027 draft), and ESD', () => {
    const cfg = resolveTaxConfig(raw2027);
    expect(cfg.federal.standardDeduction).toEqual({ single: 16600, mfj: 33200, mfs: 16600, hoh: 24925 });
    expect(cfg.federal.additionalStandardDeductionAge65OrBlind).toEqual({ married: 1700, unmarried: 2100 });
    expect(cfg.healthFsa).toEqual({ salaryReductionLimit: 3500, maxCarryover: 700 });
    expect(cfg.hsa.contributionLimit).toEqual({ selfOnly: 4500, family: 9000 });
    expect(cfg.hsa.hdhpMinDeductible).toEqual({ selfOnly: 1750, family: 3500 });
    expect(cfg.hsa.hdhpMaxOutOfPocket.family).toBe(17400);
    expect(cfg.fica.socialSecurityWageBase).toBe(192300);
    expect(cfg.states.WA!.payrollTaxes[0]!.totalRate).toBe(0.012);
  });

  it('registry: 2026 and 2027 are both usable; the default is the newest', () => {
    const years = loadTaxYears();
    expect(years.map((y) => [y.year, y.usable])).toEqual([
      [2026, true],
      [2027, true],
    ]);
    expect(latestUsableYear(years)?.year).toBe(2027);
  });

  it('lists every parameter as unverified until you flip userVerified', () => {
    expect(unverifiedParams(cfg2026)).toHaveLength(37);
    const raw = rawCopy();
    raw.fica.medicareRate.userVerified = true;
    expect(unverifiedParams(resolveTaxConfig(raw))).toHaveLength(36);
  });

  it('resolves the WA Paid Leave wage cap to the Social Security wage base and WA Cares to no cap', () => {
    const [pfml, cares] = cfg2026.states.WA!.payrollTaxes;
    expect(pfml!.wageCap).toBe(184500);
    expect(cares!.wageCap).toBeNull();
  });
});
