/**
 * Federal income tax from a bracket table (SPEC F4).
 * Uses the IRS rate-schedule formula, not the tax table (SPEC A6).
 */
import type { BracketRow } from './types';

/** Tax on taxable income `ti`: Σ rateᵢ × max(0, min(ti, overᵢ₊₁) − overᵢ). */
export function bracketTax(ti: number, rows: readonly BracketRow[]): number {
  let tax = 0;
  for (let i = 0; i < rows.length; i++) {
    const lo = rows[i]!.over;
    const hi = i + 1 < rows.length ? rows[i + 1]!.over : Infinity;
    if (ti > lo) tax += rows[i]!.rate * (Math.min(ti, hi) - lo);
  }
  return tax;
}

/**
 * The "$N plus" base amount at the start of each bracket after the first.
 * The config loader compares these to the IRS-printed amounts to catch typos.
 */
export function derivedBaseAmounts(rows: readonly BracketRow[]): number[] {
  const out: number[] = [];
  let base = 0;
  for (let i = 1; i < rows.length; i++) {
    base += rows[i - 1]!.rate * (rows[i]!.over - rows[i - 1]!.over);
    out.push(Math.round(base * 100) / 100);
  }
  return out;
}

/** Rate on the next dollar of taxable income (0 when taxable income is 0). Display only. */
export function marginalRate(ti: number, rows: readonly BracketRow[]): number {
  if (ti <= 0) return 0;
  let r = 0;
  for (const row of rows) if (ti > row.over) r = row.rate;
  return r;
}
