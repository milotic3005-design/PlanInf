/**
 * The answer: scenario switch, stat tiles (lowest net cost, runner-up gap,
 * nearest break-even, tax savings), "why this plan wins", notes, and the
 * plans × scenarios matrix.
 */
import { Calculator } from 'lucide-react';
import type { ComparisonResult, Plan, Scenario, ScenarioId } from '../../engine/types';
import { explainScenario } from '../../engine/explain';
import { fmtMoney0 } from '../../engine/money';
import { SLOT_VARS } from '../model';
import { RadioCards, Swatch } from './fields';
import { IssueList } from './Issues';
import { Button, Callout, TableScroll, td, th } from './ui';

interface Props {
  result: ComparisonResult;
  plans: Plan[];
  scenarios: Scenario[];
  scenarioId: ScenarioId;
  setScenarioId: (s: ScenarioId) => void;
  slotOf: (id: string) => number;
  onShowMath: (planId: string) => void;
  expectedSpend: number;
}

export const scenarioShort = (s: Scenario) => (s.allowedSpend === 'reachOopMax' ? 'Out-of-pocket max' : `${fmtMoney0(s.allowedSpend)} of care`);
const scenarioName = (id: ScenarioId) => (id === 'low' ? 'Low use' : id === 'expected' ? 'Expected use' : 'High use');

export function Summary({ result, plans, scenarios, scenarioId, setScenarioId, slotOf, onShowMath, expectedSpend }: Props) {
  const sc = scenarios.find((s) => s.id === scenarioId)!;
  const ex = explainScenario(result, plans, sc);
  const name = (id: string) => plans.find((p) => p.id === id)?.name ?? id;
  const rank = result.rankings[scenarioId];
  const winner = rank[0];
  const runnerUp = rank[1];
  const netOf = (planId: string, s: ScenarioId) => result.results.find((r) => r.planId === planId && r.scenarioId === s)!.netCost;
  const win = winner ? result.results.find((r) => r.planId === winner.planId && r.scenarioId === scenarioId) : undefined;

  // Nearest point (to your expected spending) where the cheapest plan changes.
  const swaps = result.cheapestBySpend.slice(0, -1).map((s, i) => ({ at: s.to, below: s.planId, above: result.cheapestBySpend[i + 1]!.planId }));
  const nearest = [...swaps].sort((a, b) => Math.abs(a.at - expectedSpend) - Math.abs(b.at - expectedSpend))[0];

  const tileLabel = 'text-xs font-semibold tracking-wide text-ink-faint uppercase';
  const tileValue = 'mt-1 font-display text-[2rem] leading-none font-semibold tracking-tight text-ink sm:text-[2.6rem]';

  return (
    <div className="space-y-5">
      <RadioCards
        legend="Usage scenario"
        hideLegend
        name="scenario"
        value={scenarioId}
        onChange={setScenarioId}
        columns={3}
        compact
        options={scenarios.map((s) => ({ value: s.id, label: scenarioName(s.id), detail: scenarioShort(s) }))}
      />

      {winner && win && (
        <div className="rounded-xl border hairline bg-surface p-5 shadow-card sm:p-6">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-6 2xl:grid-cols-4">
            <div className="min-w-0">
              <dt className={tileLabel}>Lowest net cost</dt>
              <dd data-testid="hero-net" className={tileValue}>
                {fmtMoney0(winner.netCost)}
              </dd>
              <dd className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-ink">
                <Swatch color={SLOT_VARS[slotOf(winner.planId)]!} />
                {name(winner.planId)}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className={tileLabel}>Next best</dt>
              <dd className={tileValue}>{runnerUp ? `+${fmtMoney0(runnerUp.deltaVsBest)}` : '–'}</dd>
              <dd className="mt-2 text-sm text-ink-muted">{runnerUp ? name(runnerUp.planId) : 'Only one plan entered'}</dd>
            </div>
            <div className="min-w-0">
              <dt className={tileLabel}>Nearest break-even</dt>
              <dd className={tileValue}>{nearest ? fmtMoney0(nearest.at) : '–'}</dd>
              <dd className="mt-2 text-sm text-ink-muted">{nearest ? `${name(nearest.below)} below, ${name(nearest.above)} above` : 'One plan is cheapest at every level'}</dd>
            </div>
            <div className="min-w-0">
              <dt className={tileLabel}>Tax savings</dt>
              <dd className={tileValue}>{fmtMoney0(win.premiumTaxSavings.total + win.accountTaxSavings.total)}</dd>
              <dd className="mt-2 text-sm text-ink-muted">with {name(winner.planId)}</dd>
            </div>
          </dl>
          <p className="mt-5 border-t hairline pt-3 text-sm text-ink-muted">
            A year, after taxes, {sc.allowedSpend === 'reachOopMax' ? 'if you reach the out-of-pocket max' : `at ${fmtMoney0(sc.allowedSpend)} of care`}.
            {winner.netCost < 0 && ' A negative net cost means tax savings and employer HSA money exceed premiums plus care: you come out ahead.'}
          </p>
        </div>
      )}

      {winner && (
        <Callout title="Why this plan wins">
          <p className="text-[0.95rem] leading-relaxed text-ink">
            {ex.headline} {ex.sentences.join(' ')}
          </p>
          <Button variant="secondary" size="sm" icon={Calculator} className="mt-3" onClick={() => onShowMath(winner.planId)}>
            Show the math for {name(winner.planId)}
          </Button>
        </Callout>
      )}

      <IssueList issues={result.issues.filter((i) => !i.planId)} label="Notes about your inputs" />
      {result.issues.some((i) => i.planId && i.severity !== 'info') && (
        <Callout tone="warning" title="Some plan numbers need a look.">
          <a href="#plans">See Your plans</a> for the details.
        </Callout>
      )}

      <div>
        <h3 id="matrix-h" className="mb-2 text-xs font-semibold tracking-wider text-ink-faint uppercase">
          Net after-tax cost per year, every scenario
        </h3>
        <TableScroll label="Net cost by scenario (scrollable)">
          <table aria-labelledby="matrix-h" className="w-full min-w-[460px] border-collapse">
            <thead>
              <tr>
                <th scope="col" className={th}>
                  Plan
                </th>
                {scenarios.map((s) => (
                  <th key={s.id} scope="col" className={`${th} text-right ${s.id === scenarioId ? 'text-ink' : ''}`}>
                    {s.id === 'low' ? 'Low' : s.id === 'expected' ? 'Expected' : 'High'}
                    <span className="block text-[0.7rem] font-normal tracking-normal normal-case">{scenarioShort(s)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {plans.map((p) => (
                <tr key={p.id}>
                  <th scope="row" className={`${td} text-left font-semibold text-ink`}>
                    <span className="inline-flex items-center gap-2 whitespace-nowrap">
                      <Swatch color={SLOT_VARS[slotOf(p.id)]!} />
                      {p.name}
                    </span>
                  </th>
                  {scenarios.map((s) => {
                    const best = result.rankings[s.id][0]?.planId === p.id;
                    return (
                      <td key={s.id} className={`${td} code-chip text-right whitespace-nowrap ${s.id === scenarioId ? 'bg-brand-tint/40' : ''}`}>
                        <span className={best ? 'font-bold text-ink' : 'text-ink'}>{fmtMoney0(netOf(p.id, s.id))}</span>
                        {best && <span className="ml-2 rounded-full bg-ok-tint px-2 py-0.5 font-sans text-xs font-semibold text-ok">✓ lowest</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
        <p className="mt-2 text-xs text-ink-muted">Net cost = premiums + out-of-pocket care + forfeited FSA money − tax savings − employer HSA money.</p>
      </div>
    </div>
  );
}
