/**
 * Step 4: break-even. A tall segmented bar shows which plan is cheapest across
 * the spending range (one whole range split into parts), with the swap points
 * marked. Below it, every pairwise break-even with its own "Show math".
 */
import { useMemo } from 'react';
import type { ComparisonResult, Plan } from '../../engine/types';
import { fmtMoney0 } from '../../engine/money';
import { SLOT_VARS } from '../model';
import { Disclosure, Swatch } from './fields';
import { MathPanel } from './MathPanel';
import { useWidth } from './useWidth';

interface Props {
  result: ComparisonResult;
  plans: Plan[];
  slotOf: (id: string) => number;
  expectedSpend: number;
}

/** Measure label text so a block only prints a name that fits with padding (never clipped). */
function useTextWidth() {
  return useMemo(() => {
    const ctx = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
    return (text: string) => {
      if (!ctx) return text.length * 7.5;
      ctx.font = '600 12px "Instrument Sans", system-ui, sans-serif';
      return ctx.measureText(text).width;
    };
  }, []);
}

/**
 * Axis labels under the strip that never overlap: break-even (interior) labels
 * are placed first, then $0 and the range end only if they still fit. Every
 * value is also in the list below the strip, so a dropped label loses nothing.
 */
function placeAxisLabels(values: number[], max: number, width: number, textWidth: (t: string) => number) {
  const GAP = 8;
  const items = values.map((value, i) => ({
    value,
    interior: i > 0 && i < values.length - 1,
    align: (i === 0 ? 'start' : i === values.length - 1 ? 'end' : 'center') as 'start' | 'end' | 'center',
  }));
  if (width <= 0) return items;
  const span = (it: (typeof items)[number]) => {
    const x = (it.value / max) * width;
    const w = textWidth(fmtMoney0(it.value));
    const lo = it.align === 'start' ? x : it.align === 'end' ? x - w : x - w / 2;
    return [lo, lo + w] as const;
  };
  const placed: typeof items = [];
  for (const it of [...items.filter((i) => i.interior), ...items.filter((i) => !i.interior)]) {
    const [a, b] = span(it);
    if (placed.every((p) => {
      const [c, d] = span(p);
      return b + GAP <= c || d + GAP <= a;
    })) placed.push(it);
  }
  return placed.sort((x, y) => x.value - y.value);
}

export function BreakEvenView({ result, plans, slotOf, expectedSpend }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const textWidth = useTextWidth();
  const max = result.chartMaxSpend;
  const name = (id: string) => plans.find((p) => p.id === id)?.name ?? id;
  const segs = result.cheapestBySpend;
  const pct = (x: number) => `${(x / max) * 100}%`;
  const boundaries = [0, ...segs.map((s) => s.to)];
  const legendIds = [...new Set(segs.map((s) => s.planId))];

  return (
    <div className="space-y-6">
      <div className="rounded-xl border hairline bg-surface p-5 shadow-card sm:p-6">
      <h3 className="text-sm font-semibold text-ink">Cheapest plan at each level of care</h3>
      <div className="relative mt-9" ref={ref}>
        {expectedSpend <= max && (
          <div className="absolute -top-7 flex -translate-x-1/2 flex-col items-center" style={{ left: pct(expectedSpend) }}>
            <span className="code-chip whitespace-nowrap text-xs font-bold text-ink">You: {fmtMoney0(expectedSpend)}</span>
            <span aria-hidden className="mt-0.5 h-0 w-0 border-x-[5px] border-t-[6px] border-x-transparent border-t-ink" />
          </div>
        )}
        <div className="relative h-7" role="img" aria-label={segs.map((s) => `${fmtMoney0(s.from)} to ${fmtMoney0(s.to)}: ${name(s.planId)}`).join('; ')}>
          {segs.map((s) => {
            const slot = slotOf(s.planId);
            const blockPx = ((s.to - s.from) / max) * width - 2;
            const label = name(s.planId);
            const fits = width > 0 && textWidth(label) + 32 <= blockPx; // text + chip padding + block padding
            return (
              <div
                key={`${s.from}-${s.planId}`}
                className="absolute inset-y-0 flex items-center overflow-visible rounded px-2"
                style={{ left: `calc(${pct(s.from)} + 1px)`, width: `calc(${pct(s.to - s.from)} - 2px)`, background: SLOT_VARS[slot] }}
                title={`${label}: cheapest from ${fmtMoney0(s.from)} to ${fmtMoney0(s.to)}`}
              >
                {fits && (
                  // Text on its own chip: white on a series color can't reach 4.5:1 for every hue.
                  <span className="rounded bg-surface-raised px-1.5 py-0.5 text-xs font-semibold whitespace-nowrap text-ink">{label}</span>
                )}
              </div>
            );
          })}
        </div>
        <div className="relative mt-1 h-5" aria-hidden>
          {placeAxisLabels(boundaries, max, width, textWidth).map(({ value, align, interior }) => (
            <span
              key={value}
              className={`code-chip absolute top-0 whitespace-nowrap text-xs ${interior ? 'font-semibold text-ink' : 'text-ink-muted'} ${
                align === 'start' ? 'translate-x-0' : align === 'end' ? '-translate-x-full' : '-translate-x-1/2'
              }`}
              style={{ left: pct(value) }}
            >
              {fmtMoney0(value)}
            </span>
          ))}
        </div>
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1" aria-label="Legend">
        {legendIds.map((id) => (
          <li key={id} className="inline-flex items-center gap-1.5 text-sm text-ink">
            <Swatch color={SLOT_VARS[slotOf(id)]!} />
            {name(id)}
          </li>
        ))}
      </ul>
      <dl className="mt-4 grid gap-x-6 gap-y-1.5 border-t hairline pt-4 text-sm sm:grid-cols-[auto_1fr]">
        {segs.map((s) => (
          <div key={`${s.from}-${s.planId}`} className="contents">
            <dt className="code-chip text-ink-muted">
              {fmtMoney0(s.from)} – {s.to >= max ? `${fmtMoney0(max)}+` : fmtMoney0(s.to)}
            </dt>
            <dd className="text-ink">{name(s.planId)} is cheapest</dd>
          </div>
        ))}
      </dl>
      </div>

      <div>
      <h3 className="text-xs font-semibold tracking-wider text-ink-faint uppercase">Every pair of plans</h3>
      <ul className="mt-3 grid gap-3 lg:grid-cols-1">
        {result.breakEvens.map((be) => (
          <li key={`${be.planA}-${be.planB}`} className="rounded-xl border hairline bg-surface p-4 shadow-card">
            <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
              <Swatch color={SLOT_VARS[slotOf(be.planA)]!} /> {name(be.planA)}
              <span className="text-ink-muted">vs</span>
              <Swatch color={SLOT_VARS[slotOf(be.planB)]!} /> {name(be.planB)}
            </p>
            <p className="mt-1 text-sm text-ink">{be.summary}</p>
            <Disclosure label="Show math" openLabel="Hide math" className="mt-1.5">
              <MathPanel steps={be.math} title={`Break-even: ${name(be.planA)} vs ${name(be.planB)}`} />
            </Disclosure>
          </li>
        ))}
      </ul>
      </div>
    </div>
  );
}
