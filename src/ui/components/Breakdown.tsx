/**
 * Ranked breakdown for the chosen scenario. Each row's "Show math" opens a
 * full-width formula table below (outside the table's horizontal scroll, so
 * long formulas are never clipped).
 */
import { Calculator, X } from 'lucide-react';
import type { ComparisonResult, Plan, ScenarioId } from '../../engine/types';
import { fmtMoney0 } from '../../engine/money';
import { SLOT_VARS } from '../model';
import { Swatch } from './fields';
import { MathPanel } from './MathPanel';
import { Button, TableScroll, td, th } from './ui';

interface Props {
  result: ComparisonResult;
  plans: Plan[];
  scenarioId: ScenarioId;
  slotOf: (id: string) => number;
  openMath: Set<string>;
  toggleMath: (planId: string) => void;
}

export function Breakdown({ result, plans, scenarioId, slotOf, openMath, toggleMath }: Props) {
  const rank = result.rankings[scenarioId];
  const rows = rank.map((r) => ({ rank: r, res: result.results.find((x) => x.planId === r.planId && x.scenarioId === scenarioId)! }));
  const anyForfeit = rows.some((r) => r.res.fsaElection > 0);
  const name = (id: string) => plans.find((p) => p.id === id)?.name ?? id;
  const num = `${td} code-chip text-right whitespace-nowrap`;

  return (
    <div className="space-y-6">
      <TableScroll label="Cost breakdown (scrollable)">
        <table className="w-full min-w-[680px] border-collapse [&_td]:px-2.5 [&_th]:px-2.5">
          <caption className="sr-only">Cost breakdown for each plan, cheapest first. Each row has a Show math button.</caption>
          <thead>
            <tr>
              <th scope="col" className={th}>#</th>
              <th scope="col" className={th}>Plan</th>
              <th scope="col" className={`${th} text-right`}>Premiums</th>
              <th scope="col" className={`${th} text-right`}>Out-of-pocket</th>
              {anyForfeit && <th scope="col" className={`${th} text-right`}>FSA forfeit</th>}
              <th scope="col" className={`${th} text-right`}>Tax savings</th>
              <th scope="col" className={`${th} text-right`}>Employer HSA</th>
              <th scope="col" className={`${th} text-right text-ink`}>Net cost</th>
              <th scope="col" className={`${th} text-right`}>vs. lowest</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ rank: r, res }, i) => {
              const tax = res.premiumTaxSavings.total + res.accountTaxSavings.total;
              const open = openMath.has(res.planId);
              return (
                <tr key={res.planId}>
                  <td className={`${td} code-chip text-ink-faint`}>{String(i + 1).padStart(2, '0')}</td>
                  <th scope="row" className={`${td} text-left font-semibold text-ink`}>
                    <span className="inline-flex items-center gap-2 whitespace-nowrap">
                      <Swatch color={SLOT_VARS[slotOf(res.planId)]!} />
                      {name(res.planId)}
                    </span>
                    <button
                      type="button"
                      aria-expanded={open}
                      aria-controls={open ? `math-${res.planId}` : undefined}
                      onClick={() => toggleMath(res.planId)}
                      className="mt-1 block text-xs font-semibold text-brand hover:underline"
                    >
                      {open ? 'Hide math' : 'Show math'}
                    </button>
                  </th>
                  <td className={num}>{fmtMoney0(res.annualPremium)}</td>
                  <td className={num}>{fmtMoney0(res.outOfPocket)}</td>
                  {anyForfeit && <td className={num}>{fmtMoney0(res.fsaForfeit)}</td>}
                  <td className={num}>−{fmtMoney0(tax)}</td>
                  <td className={num}>−{fmtMoney0(res.employerHsa)}</td>
                  <td className={`${num} font-bold text-ink`}>{fmtMoney0(res.netCost)}</td>
                  <td className={`${num} text-ink-muted`}>
                    {r.deltaVsBest < 0.5 ? <span className="rounded-full bg-ok-tint px-2 py-0.5 font-sans text-xs font-semibold text-ok">✓ lowest</span> : `+${fmtMoney0(r.deltaVsBest)}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableScroll>
      {rows.length > 0 && openMath.size === 0 && (
        <p className="flex items-center gap-2 text-sm text-ink-muted">
          <Calculator aria-hidden="true" className="h-4 w-4" /> Open "Show math" on a plan for every formula, number, and source.
        </p>
      )}
      {rows
        .filter(({ res }) => openMath.has(res.planId))
        .map(({ res }) => (
          <div key={res.planId} id={`math-${res.planId}`} className="scroll-mt-24">
            <MathPanel steps={res.math} title={`Formula: how ${name(res.planId)}'s ${fmtMoney0(res.netCost)} is calculated`} />
            <Button variant="ghost" size="sm" icon={X} className="mt-2" onClick={() => toggleMath(res.planId)}>
              Hide math for {name(res.planId)}
            </Button>
          </div>
        ))}
    </div>
  );
}
