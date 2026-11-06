/**
 * HSA simulator: a per-paycheck slider that sets your HSA contribution for the
 * whole page. Every section recalculates from it; this card shows the effect on
 * one HSA plan, side by side with contributing nothing.
 */
import { useId, useMemo, useState } from 'react';
import type { Household, Plan, ResolvedTaxConfig, Scenario, ScenarioId } from '../../engine/types';
import { hsaAllowed } from '../../engine/accounts';
import { simulateHsa } from '../../engine/hsaSim';
import { fmtMoney, fmtMoney0 } from '../../engine/money';
import { SLOT_VARS } from '../model';
import { Select, Swatch } from './fields';
import { Button, Callout, TableScroll, td, th } from './ui';

interface Props {
  household: Household;
  plans: Plan[];
  scenarios: Scenario[];
  scenarioId: ScenarioId;
  config: ResolvedTaxConfig;
  slotOf: (id: string) => number;
  /** Set the annual contribution (also updates the HSA field in Your situation). */
  onChange: (annual: number) => void;
}

const money = (x: number) => (x < 0 ? `−${fmtMoney0(-x)}` : fmtMoney0(x));

export function HsaSimulator({ household: h, plans, scenarios, scenarioId, config, slotOf, onChange }: Props) {
  const sliderId = useId();
  const hsaPlans = plans.filter((p) => hsaAllowed(p, config, h.coverageTier));
  const [pickedId, setPickedId] = useState<string | null>(null);
  const plan = hsaPlans.find((p) => p.id === pickedId) ?? hsaPlans[0];
  const scenario = scenarios.find((s) => s.id === scenarioId)!;
  const sim = useMemo(() => (plan ? simulateHsa({ household: h, plan, plans, scenario, config }) : null), [h, plan, plans, scenario, config]);

  if (!plan || !sim) {
    return <Callout title="No HSA-eligible plan for your coverage.">Mark a plan HSA-eligible in Your plans to use the simulator.</Callout>;
  }

  const name = (id: string) => plans.find((p) => p.id === id)?.name ?? id;
  const periods = sim.payPeriods;
  const { atZero, current, atMax } = sim;
  const limit = sim.irsLimit + sim.catchUp;
  // The slider moves in whole dollars; its last stop lands exactly on the annual maximum.
  const sliderMax = Math.ceil(sim.maxPerPaycheck);
  const atLimit = current.employeeHsa >= sim.maxEmployee && sim.maxEmployee > 0;
  const sliderValue = atLimit ? sliderMax : Math.round(sim.perPaycheck);
  const setPerPaycheck = (v: number) => onChange(Math.min(v * periods, sim.maxEmployee));
  const coverCare = Math.min(Math.max(0, sim.outOfPocket - sim.employerHsa), sim.maxEmployee);

  const best = sim.rivals[0];
  const beatsAll = !best || current.netCost <= best.netCost;
  const needed = sim.contributionToBeCheapest;
  const where = scenario.allowedSpend === 'reachOopMax' ? 'if you reach the out-of-pocket max' : `at ${fmtMoney0(scenario.allowedSpend)} of care`;
  let verdict: string;
  if (!best) verdict = `${plan.name} is the only plan entered.`;
  else if (needed === 0) verdict = `${plan.name} is the cheapest plan ${where}, even with no contribution of your own.`;
  else if (needed === null) {
    verdict = `${name(best.planId)} stays cheapest ${where}. Even at the maximum, ${plan.name} costs ${fmtMoney0(atMax.netCost - best.netCost)} more.`;
  } else if (beatsAll) {
    verdict = `${plan.name} is now the cheapest plan ${where}. It takes at least ${fmtMoney(needed / periods)} a paycheck.`;
  } else {
    verdict = `${plan.name} becomes the cheapest plan ${where} at ${fmtMoney(needed / periods)} a paycheck (${fmtMoney0(needed)} a year). ${name(best.planId)} is cheapest until then.`;
  }

  const rows: Array<{ label: string; zero: number; now: number; strong?: boolean }> = [
    { label: 'Premiums', zero: sim.annualPremium, now: sim.annualPremium },
    { label: 'Out-of-pocket care', zero: sim.outOfPocket, now: sim.outOfPocket },
    { label: 'Tax savings on premiums', zero: -sim.premiumTaxSavings, now: -sim.premiumTaxSavings },
    { label: 'Tax savings on your HSA money', zero: -atZero.taxSavings, now: -current.taxSavings },
    { label: 'Employer HSA money', zero: -sim.employerHsa, now: -sim.employerHsa },
    { label: 'Net cost', zero: atZero.netCost, now: current.netCost, strong: true },
  ];

  const statLabel = 'text-xs font-semibold tracking-wide text-ink-faint uppercase';
  const statValue = 'mt-1 font-display text-[1.75rem] leading-none font-semibold tracking-tight text-ink';

  return (
    <div className="space-y-5 rounded-xl border hairline bg-surface p-5 shadow-card sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="inline-flex items-center gap-2 text-sm font-semibold text-ink">
          <Swatch color={SLOT_VARS[slotOf(plan.id)]!} />
          {plan.name}
        </p>
        {hsaPlans.length > 1 && (
          <Select compact label="HSA plan to simulate" hideLabel value={plan.id} onChange={setPickedId} options={hsaPlans.map((p) => ({ value: p.id, label: p.name }))} className="w-56" />
        )}
      </div>

      <div>
        <label htmlFor={sliderId} className="block text-sm font-semibold text-ink">
          Your HSA contribution per paycheck
        </label>
        <p className="mt-1 flex flex-wrap items-baseline gap-x-3">
          <span data-testid="hsa-per-paycheck" className="font-display text-[2.6rem] leading-none font-semibold tracking-tight text-ink">
            {fmtMoney(sim.perPaycheck)}
          </span>
          <span className="text-sm text-ink-muted">
            × {periods} paychecks = <span className="code-chip font-bold text-ink">{fmtMoney0(current.employeeHsa)}</span> a year
          </span>
        </p>
        <input
          id={sliderId}
          type="range"
          min={0}
          max={sliderMax}
          step={1}
          value={sliderValue}
          disabled={sim.maxEmployee <= 0}
          onChange={(e) => setPerPaycheck(Number(e.target.value))}
          aria-valuetext={`${fmtMoney(sim.perPaycheck)} per paycheck, ${fmtMoney0(current.employeeHsa)} a year`}
          className="mt-3 h-2 w-full cursor-pointer accent-[var(--brand)] disabled:cursor-not-allowed"
        />
        <div className="code-chip mt-1 flex justify-between text-xs text-ink-muted" aria-hidden>
          <span>$0</span>
          <span>{fmtMoney(sim.maxPerPaycheck)} max</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" onClick={() => onChange(0)}>
            None
          </Button>
          {coverCare > 0 && coverCare < sim.maxEmployee && (
            <Button size="sm" onClick={() => onChange(coverCare)}>
              Cover this year's care
            </Button>
          )}
          <Button size="sm" onClick={() => onChange(sim.maxEmployee)}>
            Maximum
          </Button>
        </div>
        <p className="mt-3 text-sm text-ink-muted">
          {config.taxYear} IRS limit {fmtMoney0(sim.irsLimit)}
          {sim.catchUp > 0 ? ` + ${fmtMoney0(sim.catchUp)} age 55+ catch-up` : ''} − {fmtMoney0(sim.employerHsa)} from your employer ={' '}
          <span className="font-semibold text-ink">{fmtMoney0(sim.maxEmployee)}</span> you can put in. Employer money counts toward the limit.
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-5 border-t hairline pt-5 xl:grid-cols-4">
        <div className="min-w-0">
          <dt className={statLabel}>Net cost</dt>
          <dd data-testid="hsa-net" className={statValue}>
            {money(current.netCost)}
          </dd>
          <dd className="mt-1 text-xs text-ink-muted">{money(atZero.netCost)} with no contribution</dd>
        </div>
        <div className="min-w-0">
          <dt className={statLabel}>Tax saved a year</dt>
          <dd className={statValue}>{fmtMoney0(current.taxSavings)}</dd>
          <dd className="mt-1 text-xs text-ink-muted">on your HSA money</dd>
        </div>
        <div className="min-w-0">
          <dt className={statLabel}>Take-home per paycheck</dt>
          <dd className={statValue}>{sim.takeHomeChangePerPaycheck < -0.004 ? `−${fmtMoney(-sim.takeHomeChangePerPaycheck)}` : '$0.00'}</dd>
          <dd className="mt-1 text-xs text-ink-muted">smaller than the contribution, thanks to the tax saved</dd>
        </div>
        <div className="min-w-0">
          <dt className={statLabel}>HSA after this year's care</dt>
          <dd className={statValue}>{money(current.hsaAfterCare)}</dd>
          <dd className="mt-1 text-xs text-ink-muted">{current.hsaAfterCare < 0 ? 'short: paid from your own pocket' : 'stays yours and rolls over'}</dd>
        </div>
      </dl>

      <TableScroll label="HSA comparison (scrollable)">
        <table className="w-full min-w-[440px] border-collapse">
          <caption className="sr-only">{plan.name} cost with no contribution compared with your contribution</caption>
          <thead>
            <tr>
              <th scope="col" className={th}>
                A year
              </th>
              <th scope="col" className={`${th} text-right`}>
                With $0
              </th>
              <th scope="col" className={`${th} text-right text-ink`}>
                With {fmtMoney0(current.employeeHsa)}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <th scope="row" className={`${td} text-left ${r.strong ? 'font-semibold text-ink' : 'font-normal text-ink-muted'}`}>
                  {r.label}
                </th>
                <td className={`${td} code-chip text-right text-ink-muted`}>{money(r.zero)}</td>
                <td className={`${td} code-chip text-right text-ink ${r.strong ? 'font-bold' : ''}`}>{money(r.now)}</td>
              </tr>
            ))}
            <tr>
              <th scope="row" className={`${td} text-left font-normal text-ink-muted`}>
                Money into the HSA, yours + employer's
              </th>
              <td className={`${td} code-chip text-right text-ink-muted`}>{money(atZero.totalIntoHsa)}</td>
              <td className={`${td} code-chip text-right text-ink`}>
                {money(current.totalIntoHsa)} <span className="font-sans text-xs text-ink-muted">of {fmtMoney0(limit)}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </TableScroll>

      <Callout title={verdict}>
        Your HSA contribution isn't a cost: the money stays yours. Only the tax it saves lowers net cost, so each $1 here lowers it by about{' '}
        {Math.round((current.employeeHsa > 0 ? current.taxSavings / current.employeeHsa : atMax.employeeHsa > 0 ? atMax.taxSavings / atMax.employeeHsa : 0) * 100)}¢.
        {h.fsaContribution === 0 && plans.some((p) => !hsaAllowed(p, config, h.coverageTier)) && ' The other plans are shown without an FSA. Enter a Health FSA election to give them the same tax break on care.'}
      </Callout>
    </div>
  );
}
