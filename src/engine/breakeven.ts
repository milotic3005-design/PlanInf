/**
 * Break-even spend between two plans (SPEC §7.1), plus chart helpers.
 *
 * d(S) = Net_A(S) − Net_B(S) is piecewise linear in allowed spend S: tax savings
 * don't depend on S, and OOP and FSA forfeit are piecewise linear. So it is exact
 * to evaluate d at every kink, then solve the line inside any segment where
 * the sign changes. There is no numeric search and no tolerance on the root.
 */
import type { BreakEven, BreakEvenCrossing, CheapestSegment, CurvePoint, MathStep } from './types';
import { netCostAt, type PlanContext } from './netCost';
import { oopKinks, spendToReachOop } from './oop';
import { fmtMoney } from './money';

/** |d| below half a cent counts as a tie. */
const TIE_EPS = 0.005;

/** Spends where a plan's net-cost slope can change. */
export function netCostKinks(ctx: PlanContext, visits: number, perVisit: number): number[] {
  const k = oopKinks(ctx.costShare, visits, perVisit);
  const fsaTarget = ctx.fsaElection - ctx.fsaCarryover;
  if (fsaTarget > 0) {
    const s = spendToReachOop(ctx.costShare, visits, perVisit, fsaTarget);
    if (Number.isFinite(s) && fsaTarget <= ctx.costShare.oopMax) k.push(s);
  }
  return k;
}

/** Chart and break-even range: 10% past the last kink of any plan, at least past the Expected spend. */
export function chartMaxSpend(ctxs: PlanContext[], visits: number, perVisit: number, expectedSpend: number): number {
  const kinks = ctxs.flatMap((c) => netCostKinks(c, visits, perVisit));
  const raw = Math.max(1000, expectedSpend, ...kinks) * 1.1;
  return Math.ceil(raw / 500) * 500;
}

/** Net cost sampled for the chart: an even grid plus every kink, so lines bend in the right places. */
export function costCurve(ctx: PlanContext, visits: number, perVisit: number, maxSpend: number, gridSteps = 50) {
  const xs = new Set<number>();
  for (let i = 0; i <= gridSteps; i++) xs.add((maxSpend * i) / gridSteps);
  for (const k of netCostKinks(ctx, visits, perVisit)) if (k <= maxSpend) xs.add(k);
  return [...xs].sort((x, y) => x - y).map((spend) => ({ spend, netCost: netCostAt(ctx, spend, visits, perVisit).netCost }));
}

/** Smallest of 1, 2, 2.5, 5 × 10ⁿ that is ≥ raw. */
export function niceStep(raw: number): number {
  if (!(raw > 0)) return 1;
  const mag = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw - 1e-9) ?? 10 * mag;
}

/** Every spend where any plan's line bends or any two lines cross, within [0, maxSpend]. */
function criticalSpends(ctxs: PlanContext[], visits: number, perVisit: number, maxSpend: number): number[] {
  const xs = new Set<number>([0, maxSpend]);
  for (const c of ctxs) for (const k of netCostKinks(c, visits, perVisit)) if (k <= maxSpend) xs.add(k);
  for (let i = 0; i < ctxs.length; i++) {
    for (let j = i + 1; j < ctxs.length; j++) {
      for (const cr of breakEven(ctxs[i]!, ctxs[j]!, visits, perVisit, maxSpend).crossings) {
        if (cr.kind === 'point') xs.add(cr.spend);
        else {
          xs.add(cr.from);
          xs.add(cr.to);
        }
      }
    }
  }
  return [...xs].sort((a, b) => a - b);
}

/**
 * Chart data for all plans on one shared x-grid: an even grid plus every kink and
 * crossing, so the lines bend and cross at exactly the right spends.
 */
export function combinedCurve(ctxs: PlanContext[], visits: number, perVisit: number, maxSpend: number, extraSpends: number[] = []): CurvePoint[] {
  const xs = new Set(criticalSpends(ctxs, visits, perVisit, maxSpend));
  // A round-number grid (~50 points) so the chart crosshair lands on clean amounts.
  const step = niceStep(maxSpend / 50);
  for (let s = 0; s <= maxSpend + 1e-9; s += step) xs.add(Math.round(s * 100) / 100);
  for (const s of extraSpends) if (s >= 0 && s <= maxSpend) xs.add(s);
  return [...xs]
    .sort((a, b) => a - b)
    .map((spend) => ({
      spend,
      costs: Object.fromEntries(ctxs.map((c) => [c.plan.id, netCostAt(c, spend, visits, perVisit).netCost])),
    }));
}

/**
 * Which plan is cheapest across the spend range. Between consecutive critical
 * spends the order of the lines can't change, so testing each interval's
 * midpoint is exact. A tie goes to the plan listed first.
 */
export function cheapestBySpend(ctxs: PlanContext[], visits: number, perVisit: number, maxSpend: number): CheapestSegment[] {
  const xs = criticalSpends(ctxs, visits, perVisit, maxSpend);
  const out: CheapestSegment[] = [];
  for (let i = 0; i + 1 < xs.length; i++) {
    const from = xs[i]!;
    const to = xs[i + 1]!;
    if (to - from < 1e-9) continue;
    const mid = (from + to) / 2;
    let best = ctxs[0]!;
    let bestCost = netCostAt(best, mid, visits, perVisit).netCost;
    for (const c of ctxs.slice(1)) {
      const cost = netCostAt(c, mid, visits, perVisit).netCost;
      if (cost < bestCost - TIE_EPS) {
        best = c;
        bestCost = cost;
      }
    }
    const last = out[out.length - 1];
    if (last && last.planId === best.plan.id) last.to = to;
    else out.push({ from, to, planId: best.plan.id });
  }
  return out;
}

type Event = { from: number; to: number };

export function breakEven(a: PlanContext, b: PlanContext, visits: number, perVisit: number, searchedTo: number): BreakEven {
  const d = (s: number) => netCostAt(a, s, visits, perVisit).netCost - netCostAt(b, s, visits, perVisit).netCost;
  const sgn = (v: number) => (Math.abs(v) < TIE_EPS ? 0 : v > 0 ? 1 : -1);
  const who = (sign: number) => (sign < 0 ? a.plan.id : sign > 0 ? b.plan.id : 'tie');
  const name = (id: string) => (id === a.plan.id ? a.plan.name : id === b.plan.id ? b.plan.name : 'tie');

  const pts = [...new Set([0, searchedTo, ...netCostKinks(a, visits, perVisit), ...netCostKinks(b, visits, perVisit)])]
    .filter((s) => s >= 0 && s <= searchedTo)
    .sort((x, y) => x - y);
  const vals = pts.map(d);
  const math: MathStep[] = [
    {
      label: 'Fixed part of net cost (before any care)',
      formula: 'P − premium tax savings − account tax savings − employer HSA',
      shown: `${a.plan.name}: ${fmtMoney(a.fixedCost)}; ${b.plan.name}: ${fmtMoney(b.fixedCost)}; gap ${fmtMoney(a.fixedCost - b.fixedCost)}`,
      result: a.fixedCost - b.fixedCost,
      params: [],
    },
  ];

  // 1) Find every zero of d: exact zeros at kinks (merged into ranges) and roots inside segments.
  const events: Event[] = [];
  for (let i = 0; i < pts.length; i++) {
    const s0 = pts[i]!;
    const v0 = vals[i]!;
    if (sgn(v0) === 0) {
      const last = events[events.length - 1];
      if (last && i > 0 && last.to === pts[i - 1] && sgn(vals[i - 1]!) === 0) last.to = s0; // tie continues
      else events.push({ from: s0, to: s0 });
    }
    if (i + 1 < pts.length) {
      const s1 = pts[i + 1]!;
      const v1 = vals[i + 1]!;
      if (sgn(v0) * sgn(v1) < 0) {
        const root = s0 + (v0 * (s1 - s0)) / (v0 - v1);
        events.push({ from: root, to: root });
        math.push({
          label: `Break-even: ${a.plan.name} vs ${b.plan.name}`,
          formula: 'd(S) = Net_A(S) − Net_B(S) is a straight line between S₀ and S₁, so S = S₀ + d(S₀)·(S₁ − S₀) ÷ (d(S₀) − d(S₁))',
          shown: `S = ${fmtMoney(s0)} + ${fmtMoney(v0)} × (${fmtMoney(s1)} − ${fmtMoney(s0)}) ÷ (${fmtMoney(v0)} − ${fmtMoney(v1)}) = ${fmtMoney(root)}`,
          result: root,
          params: [],
        });
      }
    }
  }

  // 2) Which plan is cheaper on each side of each event (sampled between events, where d has one sign).
  const crossings: BreakEvenCrossing[] = [];
  events.forEach((e, k) => {
    const left = k === 0 ? 0 : events[k - 1]!.to;
    const right = k === events.length - 1 ? searchedTo : events[k + 1]!.from;
    const below = left < e.from ? who(sgn(d((left + e.from) / 2))) : 'tie';
    const above = e.to < right ? who(sgn(d((e.to + right) / 2))) : 'tie';
    if (e.from === e.to) {
      // A point only counts if the cheaper plan actually changes (not a touch, not at $0).
      if (below !== 'tie' && above !== 'tie' && below !== above) crossings.push({ kind: 'point', spend: e.from, cheaperBelow: below, cheaperAbove: above });
    } else {
      crossings.push({ kind: 'range', from: e.from, to: e.to, cheaperBelow: below, cheaperAbove: above });
    }
  });

  const cheaperAtZero = who(sgn(vals[0]!));
  const minGapIfNoCrossing = crossings.length === 0 ? Math.min(...vals.map(Math.abs)) : null;

  // 3) Plain-language summary.
  let summary: string;
  if (crossings.length === 0) {
    summary =
      cheaperAtZero === 'tie'
        ? `${a.plan.name} and ${b.plan.name} cost about the same at every spending level up to ${fmtMoney(searchedTo)}.`
        : `${name(cheaperAtZero)} is cheaper at every spending level from $0 to ${fmtMoney(searchedTo)}, by at least ${fmtMoney(minGapIfNoCrossing!)}.`;
  } else {
    // Walk the regions between crossings: "A is cheaper below $X of care; B from $X to $Y; A above $Y."
    const parts: string[] = [];
    let prevEnd = 0;
    crossings.forEach((c, i) => {
      const start = c.kind === 'point' ? c.spend : c.from;
      if (c.cheaperBelow !== 'tie') {
        parts.push(i === 0 ? `${name(c.cheaperBelow)} is cheaper below ${fmtMoney(start)} of care` : `${name(c.cheaperBelow)} from ${fmtMoney(prevEnd)} to ${fmtMoney(start)}`);
      }
      if (c.kind === 'range') parts.push(`they cost the same from ${fmtMoney(c.from)} to ${fmtMoney(c.to)}`);
      prevEnd = c.kind === 'point' ? c.spend : c.to;
    });
    const last = crossings[crossings.length - 1]!;
    if (last.cheaperAbove !== 'tie') parts.push(`${name(last.cheaperAbove)} above ${fmtMoney(prevEnd)}`);
    summary = `${parts.join('; ')}.`;
    summary = summary.charAt(0).toUpperCase() + summary.slice(1);
  }

  return { planA: a.plan.id, planB: b.plan.id, copayVisits: visits, searchedTo, crossings, cheaperAtZero, minGapIfNoCrossing, summary, math };
}
