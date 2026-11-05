/**
 * "Show math" as a CodeRx-style formula table: each step's label, the formula
 * with the numbers filled in, the result, and the tax parameters it used
 * (value, source, pinpoint).
 */
import { ExternalLink, TriangleAlert } from 'lucide-react';
import type { MathStep, ParamRef } from '../../engine/types';
import { fmtMoney } from '../../engine/money';
import { TableScroll, td } from './ui';

export function MathPanel({ steps, title }: { steps: MathStep[]; title: string }) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-ink">{title}</h3>
      <TableScroll label={`${title} (scrollable)`}>
        <table className="w-full min-w-[640px] border-collapse">
          <caption className="sr-only">{title}: each step, its formula with numbers, and the result</caption>
          <tbody>
            {steps.map((s, i) => (
              <tr key={i} className="first:[&>td]:border-t-0">
                <td className={`${td} w-[34%] text-ink-muted`}>
                  <span aria-hidden className="code-chip mr-2 text-xs text-ink-faint">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="text-ink">{s.label}</span>
                  {s.params.length > 0 && (
                    <ul className="mt-1.5 flex flex-wrap gap-1.5" aria-label="Tax parameters used">
                      {s.params.map((p) => (
                        <ParamChip key={p.path} p={p} />
                      ))}
                    </ul>
                  )}
                </td>
                <td className={`${td} code-chip text-[0.8rem] leading-relaxed`}>
                  <span className="block text-ink-faint">{s.formula}</span>
                  <span className="block break-words text-ink-muted">{s.shown}</span>
                </td>
                <td className={`${td} code-chip text-right font-bold whitespace-nowrap text-ink`}>{fmtMoney(s.result)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>
    </div>
  );
}

export function ParamChip({ p }: { p: ParamRef }) {
  return (
    <li className="inline-flex max-w-full flex-wrap items-center gap-x-1.5 rounded-md border hairline bg-paper-sunken/60 px-2 py-1 text-[0.7rem] leading-tight text-ink-muted">
      <span className="code-chip font-semibold text-ink">{p.display}</span>
      <span aria-hidden>·</span>
      <a href={p.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 underline hover:text-brand">
        {p.sourceTitle}
        <ExternalLink aria-hidden="true" className="h-3 w-3" />
      </a>
      <span>{p.pinpoint}</span>
      {!p.userVerified && <UnverifiedBadge />}
    </li>
  );
}

export function UnverifiedBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-accent-tint px-1.5 text-[0.65rem] font-semibold tracking-wide text-accent uppercase" title="Not yet checked by you against the source">
      <TriangleAlert aria-hidden="true" className="h-3 w-3" /> unverified
    </span>
  );
}
