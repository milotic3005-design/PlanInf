/**
 * Step 3: net cost by amount of care. One y-axis (net cost), one line per plan
 * in its fixed slot color, a crosshair tooltip listing every plan, the
 * Expected spend marked, and the points where the cheapest plan changes.
 * A table view carries every value without hovering (dataviz relief rule).
 */
import { CartesianGrid, Line, LineChart, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { ComparisonResult, Plan } from '../../engine/types';
import { fmtMoney0 } from '../../engine/money';
import { SLOT_VARS } from '../model';
import { costAt } from '../curve';
import { Disclosure, Swatch } from './fields';
import { TableScroll, td, th } from './ui';
import { niceTicks, useWidth } from './useWidth';

interface Props {
  result: ComparisonResult;
  plans: Plan[];
  slotOf: (id: string) => number;
  expectedSpend: number;
}

const compact = (v: number) => {
  const a = Math.abs(v);
  const s = a >= 1000 ? `$${Math.round(a / 100) / 10}K`.replace('.0K', 'K') : `$${a}`;
  return v < 0 ? `−${s}` : s;
};

export function CostChart({ result, plans, slotOf, expectedSpend }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const max = result.chartMaxSpend;
  const data = result.curve.map((p) => ({ spend: p.spend, ...p.costs }));
  const all = result.curve.flatMap((p) => Object.values(p.costs));
  const yLo = Math.min(0, ...all);
  const yHi = Math.max(...all);
  const allTicks = niceTicks(yLo, yHi, 6);
  // A slightly negative minimum (e.g. −$43) shouldn't reserve a whole tick band below $0:
  // pad by a quarter step instead, and label only the ticks inside the domain.
  const tickStep = (allTicks[1] ?? 1) - (allTicks[0] ?? 0);
  const yMin = yLo < 0 && -yLo <= tickStep / 2 ? Math.floor(yLo / (tickStep / 4)) * (tickStep / 4) : (allTicks[0] ?? 0);
  const yTicks = allTicks.filter((t) => t >= yMin);
  const yDomain: [number, number] = [yMin, allTicks[allTicks.length - 1]!];
  const xTicks = niceTicks(0, max, width && width < 520 ? 4 : 7).filter((t) => t <= max);
  const yFmt = (v: number) => (Math.max(Math.abs(yTicks[0]!), Math.abs(yTicks[yTicks.length - 1]!)) >= 10000 ? compact(v) : fmtMoney0(v));
  const xFmt = (v: number) => (width && width < 520 ? compact(v) : fmtMoney0(v));
  const name = (id: string) => plans.find((p) => p.id === id)?.name ?? id;

  // Where the cheapest plan changes: label these (selective direct labels).
  const swaps = result.cheapestBySpend.slice(0, -1).map((s) => ({ x: s.to, y: costAt(result.curve, s.to, s.planId) }));

  // Table view rows: round amounts + your Expected spend + every swap point.
  const tableSpends = [...new Set([...niceTicks(0, max, 9).filter((t) => t <= max), expectedSpend, ...swaps.map((s) => s.x)])]
    .filter((s) => s >= 0 && s <= max)
    .sort((a, b) => a - b);

  const summary =
    result.cheapestBySpend.length === 1
      ? `${name(result.cheapestBySpend[0]!.planId)} is cheapest at every amount of care from $0 to ${fmtMoney0(max)}.`
      : result.cheapestBySpend.map((s) => `${fmtMoney0(s.from)} to ${fmtMoney0(s.to)}: ${name(s.planId)} is cheapest`).join('; ') + '.';

  return (
    <figure className="rounded-xl border hairline bg-surface p-5 shadow-card sm:p-6">
      <ul className="mb-3 flex flex-wrap gap-x-5 gap-y-1.5" aria-label="Legend">
        {plans.map((p) => (
          <li key={p.id} className="inline-flex items-center gap-2 text-sm text-ink">
            <Swatch line color={SLOT_VARS[slotOf(p.id)]!} />
            {p.name}
          </li>
        ))}
        <li className="inline-flex items-center gap-2 text-sm text-ink-muted">
          <span aria-hidden className="inline-block size-2.5 rounded-full border-2 border-surface bg-ink outline outline-1 outline-ink" />
          cheapest plan changes
        </li>
        {expectedSpend <= max && (
          <li className="inline-flex items-center gap-2 text-sm text-ink-muted">
            <span aria-hidden className="inline-block h-3.5 w-px bg-ink-muted" />
            your expected spending ({fmtMoney0(expectedSpend)})
          </li>
        )}
      </ul>
      <div ref={ref} className="h-[340px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 24, right: 16, bottom: 4, left: 4 }}
            title="Line chart: net annual cost of each plan by amount of care"
            desc={`${summary} Focus the chart and use the left and right arrow keys to step through spending levels; the table view lists the same values.`}
          >
            <CartesianGrid vertical={false} stroke="var(--rule)" strokeWidth={1} />
            <XAxis
              type="number"
              dataKey="spend"
              domain={[0, max]}
              ticks={xTicks}
              tickFormatter={xFmt}
              stroke="var(--rule-strong)"
              tickLine={false}
              tick={{ fill: 'var(--ink-muted)', fontSize: 12, fontFamily: 'var(--font-mono)' }}
              height={36}
              label={{ value: 'Allowed medical spending per year', position: 'insideBottom', offset: -2, fill: 'var(--ink-muted)', fontSize: 12 }}
            />
            <YAxis
              type="number"
              domain={yDomain}
              ticks={yTicks}
              tickFormatter={yFmt}
              stroke="var(--rule-strong)"
              tickLine={false}
              axisLine={false}
              tick={{ fill: 'var(--ink-muted)', fontSize: 12, fontFamily: 'var(--font-mono)' }}
              width={68}
            />
            {yLo < 0 && <ReferenceLine y={0} stroke="var(--rule-strong)" strokeWidth={1} />}
            {expectedSpend >= 0 && expectedSpend <= max && (
              // Unlabeled on the plot (the label collided with the top tick on phones); the legend names it.
              <ReferenceLine x={expectedSpend} stroke="var(--ink-muted)" strokeWidth={1} />
            )}
            <Tooltip
              cursor={{ stroke: 'var(--rule-strong)', strokeWidth: 1 }}
              isAnimationActive={false}
              content={({ active, label }) =>
                active && typeof label === 'number' ? <ChartTip spend={label} result={result} plans={plans} slotOf={slotOf} /> : null
              }
            />
            {plans.map((p) => (
              <Line
                key={p.id}
                type="linear"
                dataKey={p.id}
                name={p.name}
                stroke={SLOT_VARS[slotOf(p.id)]}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                dot={false}
                activeDot={{ r: 4, stroke: 'var(--surface)', strokeWidth: 2 }}
                isAnimationActive={false}
              />
            ))}
            {swaps.map((s) => (
              <ReferenceDot
                key={s.x}
                x={s.x}
                y={s.y}
                r={5}
                fill="var(--ink)"
                stroke="var(--surface)"
                strokeWidth={2}
                label={{ value: fmtMoney0(s.x), position: 'top', offset: 10, fill: 'var(--ink)', fontSize: 12, fontWeight: 600 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="mt-2 text-xs text-ink-muted">
        Lines are exact, not estimated: the engine includes every point where a plan's cost changes slope. Visits held at your Expected count ({result.chartVisits}).
      </figcaption>
      <Disclosure label="Show as table" openLabel="Hide table" className="mt-3">
        <TableScroll label="Chart values (scrollable)">
          <table className="w-full min-w-[460px] border-collapse">
            <caption className="sr-only">Net annual cost of each plan at selected amounts of care</caption>
            <thead>
              <tr>
                <th scope="col" className={th}>Allowed spending</th>
                {plans.map((p) => (
                  <th key={p.id} scope="col" className={`${th} text-right`}>
                    {p.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableSpends.map((s) => {
                const costs = plans.map((p) => costAt(result.curve, s, p.id));
                const low = Math.min(...costs);
                return (
                  <tr key={s}>
                    <th scope="row" className={`${td} code-chip text-left font-normal text-ink`}>
                      {fmtMoney0(s)}
                      {s === expectedSpend && <span className="ml-1.5 text-xs text-ink-muted">(your expected)</span>}
                      {swaps.some((w) => w.x === s) && <span className="ml-1.5 text-xs text-ink-muted">(break-even)</span>}
                    </th>
                    {costs.map((c, i) => (
                      <td key={plans[i]!.id} className={`${td} code-chip text-right ${c - low < 0.5 ? 'font-bold text-ink' : 'text-ink'}`}>
                        {fmtMoney0(c)}
                        {c - low < 0.5 && <span className="sr-only"> (lowest)</span>}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableScroll>
      </Disclosure>
    </figure>
  );
}

function ChartTip({ spend, result, plans, slotOf }: { spend: number; result: ComparisonResult; plans: Plan[]; slotOf: (id: string) => number }) {
  const rows = plans.map((p) => ({ p, cost: costAt(result.curve, spend, p.id) }));
  const low = Math.min(...rows.map((r) => r.cost));
  return (
    <div className="min-w-52 rounded-lg border hairline bg-surface-raised px-3.5 py-2.5 shadow-card">
      <p className="mb-1.5 text-xs text-ink-muted">At {fmtMoney0(spend)} of care</p>
      <ul className="space-y-1">
        {rows.map(({ p, cost }) => (
          <li key={p.id} className="flex items-center gap-2 text-sm">
            <Swatch line color={SLOT_VARS[slotOf(p.id)]!} />
            <span className="code-chip font-bold text-ink">{fmtMoney0(cost)}</span>
            <span className="text-ink-muted">{p.name}</span>
            {cost - low < 0.5 && <span className="ml-auto text-xs font-semibold text-ok">✓ lowest</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
