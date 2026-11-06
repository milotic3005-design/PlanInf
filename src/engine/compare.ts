/**
 * Top-level entry point: every plan × every scenario, rankings, and pairwise
 * break-evens. Pure function: same inputs → same outputs, no I/O.
 */
import type {
  ComparisonResult,
  Household,
  Issue,
  Plan,
  RankRow,
  ResolvedTaxConfig,
  Scenario,
  ScenarioId,
} from './types';
import { buildPlanContext, evaluateScenario } from './netCost';
import { breakEven, chartMaxSpend, cheapestBySpend, combinedCurve } from './breakeven';
import { unverifiedParams } from './config';
import { blockingProblems, InputError, inputIssues } from './validate';

/** App defaults for the Low-use scenario (SPEC Q6). Sample assumptions, not tax parameters. */
export const LOW_USE_DEFAULT = { allowedSpend: 300, copayVisits: 2 } as const;

/** Low / Expected / High scenarios. High reuses the Expected visit count to locate where the max is hit. */
export function buildScenarios(
  expected: { allowedSpend: number; copayVisits: number },
  low: { allowedSpend: number; copayVisits: number } = LOW_USE_DEFAULT,
): Scenario[] {
  return [
    { id: 'low', label: 'Low use', allowedSpend: low.allowedSpend, copayVisits: low.copayVisits },
    { id: 'expected', label: 'Expected use', allowedSpend: expected.allowedSpend, copayVisits: expected.copayVisits },
    { id: 'high', label: 'High use (out-of-pocket max reached)', allowedSpend: 'reachOopMax', copayVisits: expected.copayVisits },
  ];
}

export interface CompareInput {
  household: Household;
  plans: Plan[];
  scenarios: Scenario[];
  config: ResolvedTaxConfig;
}

export function compare({ household: h, plans, scenarios, config: cfg }: CompareInput): ComparisonResult {
  const blocking = blockingProblems(h, plans, scenarios, cfg);
  if (blocking.length > 0) throw new InputError(blocking);

  const ctxs = plans.map((p) => buildPlanContext(p, h, cfg));
  const results = scenarios.flatMap((sc) => ctxs.map((c) => evaluateScenario(c, sc, h, cfg)));

  const rankings = {} as Record<ScenarioId, RankRow[]>;
  for (const sc of scenarios) {
    const rows = results
      .filter((r) => r.scenarioId === sc.id)
      .map((r) => ({ planId: r.planId, netCost: r.netCost }))
      .sort((x, y) => x.netCost - y.netCost || x.planId.localeCompare(y.planId));
    const best = rows[0]?.netCost ?? 0;
    rankings[sc.id] = rows.map((r) => ({ ...r, deltaVsBest: r.netCost - best }));
  }

  const expected = scenarios.find((s) => s.id === 'expected');
  const visits = expected?.copayVisits ?? 0;
  const expectedSpend = typeof expected?.allowedSpend === 'number' ? expected.allowedSpend : 0;
  const chartMax = chartMaxSpend(ctxs, visits, h.allowedPerVisit, expectedSpend);
  const breakEvens = [];
  for (let i = 0; i < ctxs.length; i++) {
    for (let j = i + 1; j < ctxs.length; j++) breakEvens.push(breakEven(ctxs[i]!, ctxs[j]!, visits, h.allowedPerVisit, chartMax));
  }

  // De-duplicate issues (the same plan check can be raised once per scenario context).
  const seen = new Set<string>();
  const issues: Issue[] = [];
  for (const i of [...ctxs.flatMap((c) => c.issues), ...inputIssues(h, plans, scenarios, cfg)]) {
    const key = `${i.code}|${i.planId ?? ''}`;
    if (!seen.has(key)) {
      seen.add(key);
      issues.push(i);
    }
  }

  return {
    taxYear: cfg.taxYear,
    results,
    rankings,
    breakEvens,
    chartMaxSpend: chartMax,
    chartVisits: visits,
    curve: combinedCurve(
      ctxs,
      visits,
      h.allowedPerVisit,
      chartMax,
      scenarios.flatMap((s) => (typeof s.allowedSpend === 'number' ? [s.allowedSpend] : [])),
    ),
    cheapestBySpend: cheapestBySpend(ctxs, visits, h.allowedPerVisit, chartMax),
    issues,
    unverifiedParams: unverifiedParams(cfg),
  };
}
