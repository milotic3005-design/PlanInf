/**
 * Display helpers. The engine computes unrounded values; these round only for
 * display (SPEC A18): half away from zero, to the cent.
 */

/** Round half away from zero to cents. The 1e-6 nudge absorbs binary float error (578.175 → 578.18). */
export function roundCents(x: number): number {
  const sign = x < 0 ? -1 : 1;
  return (sign * Math.round(Math.abs(x) * 100 + 1e-6)) / 100;
}

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** "$1,234.56"; negatives as "−$335.73" (true minus sign). */
export function fmtMoney(x: number): string {
  if (!Number.isFinite(x)) return x > 0 ? '∞' : '−∞';
  const r = roundCents(x);
  const s = usd.format(Math.abs(r));
  return r < 0 ? `−${s}` : s;
}

const usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0, minimumFractionDigits: 0 });

/** Whole dollars for summaries: "$2,183", "−$336" (half away from zero). */
export function fmtMoney0(x: number): string {
  if (!Number.isFinite(x)) return x > 0 ? '∞' : '−∞';
  const sign = x < 0 ? -1 : 1;
  const r = sign * Math.round(Math.abs(x) + 1e-9);
  const s = usd0.format(Math.abs(r));
  return r < 0 ? `−${s}` : s;
}

/** "22%", "1.45%", "71.43%". */
export function fmtPct(rate: number): string {
  const pct = Math.round(rate * 1e6) / 1e4; // up to 4 decimals of a percent
  return `${pct}%`;
}

/** "1,950" style number without currency sign or cents, for counts. */
export function fmtNum(x: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(x);
}
