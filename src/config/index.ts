/**
 * Tax-year registry. To add a year: drop <year>.json next to the others and add it below.
 * A year with any unpublished (null) value is listed as unusable with its reasons.
 */
import { resolveTaxConfig, TaxConfigError } from '../engine/config';
import type { ResolvedTaxConfig } from '../engine/types';
import ty2026 from './tax-years/2026.json';
import ty2027 from './tax-years/2027.json';

export const RAW_TAX_YEARS: Record<number, unknown> = {
  2026: ty2026,
  2027: ty2027,
};

export interface TaxYearStatus {
  year: number;
  usable: boolean;
  config?: ResolvedTaxConfig;
  problems: string[];
}

export function loadTaxYears(raw: Record<number, unknown> = RAW_TAX_YEARS): TaxYearStatus[] {
  return Object.keys(raw)
    .map(Number)
    .sort((a, b) => a - b)
    .map((year) => {
      try {
        return { year, usable: true, config: resolveTaxConfig(raw[year]), problems: [] };
      } catch (e) {
        if (e instanceof TaxConfigError) return { year, usable: false, problems: e.problems };
        throw e;
      }
    });
}

/** The newest year whose config is complete (the app's default year). */
export function latestUsableYear(statuses: TaxYearStatus[]): TaxYearStatus | undefined {
  return [...statuses].reverse().find((s) => s.usable);
}
