import type { CurvePoint } from '../engine/types';

/**
 * Net cost of one plan at any spend, read from the chart curve. The curve
 * contains every kink and crossing, so straight-line interpolation between
 * neighboring points is exact, not an approximation.
 */
export function costAt(curve: CurvePoint[], spend: number, planId: string): number {
  if (curve.length === 0) return NaN;
  if (spend <= curve[0]!.spend) return curve[0]!.costs[planId] ?? NaN;
  for (let i = 1; i < curve.length; i++) {
    const b = curve[i]!;
    if (spend <= b.spend) {
      const a = curve[i - 1]!;
      const ya = a.costs[planId] ?? NaN;
      const yb = b.costs[planId] ?? NaN;
      const t = b.spend === a.spend ? 0 : (spend - a.spend) / (b.spend - a.spend);
      return ya + t * (yb - ya);
    }
  }
  return curve[curve.length - 1]!.costs[planId] ?? NaN;
}
