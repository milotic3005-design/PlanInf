/** Every tax parameter in use, with its value, source, and pinpoint, plus why other years are unavailable. */
import type { ResolvedTaxConfig } from '../../engine/types';
import type { TaxYearStatus } from '../../config';
import { Disclosure } from './fields';
import { ParamChip } from './MathPanel';

const GROUPS: Array<[string, string]> = [
  ['federal.', 'Federal income tax'],
  ['fica.', 'Social Security and Medicare (FICA)'],
  ['hsa.', 'Health savings account and HDHP limits'],
  ['healthFsa.', 'Health FSA'],
  ['states.', 'State'],
];

const pretty = (path: string) =>
  path
    .replace(/^states\.(\w+)\.payrollTaxes\[0\]\./, '$1 Paid Leave: ')
    .replace(/^states\.(\w+)\.payrollTaxes\[1\]\./, '$1 Cares: ')
    .replace(/^states\.(\w+)\.incomeTax\.type/, '$1 income tax')
    .replace(/^(federal|fica|hsa|healthFsa)\./, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\./g, ' · ')
    .replace(/\b(mfj|mfs|hoh)\b/g, (m) => m.toUpperCase())
    .toLowerCase()
    .replace(/^./, (c) => c.toUpperCase())
    .replace(/\b(mfj|mfs|hoh|hdhp|wa|fsa|hsa)\b/gi, (m) => m.toUpperCase());

export function TaxDataPanel({ config, years }: { config: ResolvedTaxConfig; years: TaxYearStatus[] }) {
  const refs = Object.values(config.refs);
  const unverified = refs.filter((r) => !r.userVerified).length;
  const unusable = years.filter((y) => !y.usable);
  return (
    <div>
      <p className="text-sm text-ink">
        {config.taxYear}: {refs.length} values, <span className="font-semibold">{unverified} not yet verified by you</span>. To mark one verified, open{' '}
        <code className="rounded bg-paper-sunken px-1 font-mono text-xs">src/config/tax-years/{config.taxYear}.json</code>, check the value against its source, and set{' '}
        <code className="rounded bg-paper-sunken px-1 font-mono text-xs">userVerified</code> to <code className="font-mono text-xs">true</code>.
      </p>
      {unusable.map((y) => (
        <p key={y.year} className="mt-2 text-sm text-ink-muted">
          <span className="font-semibold text-ink">{y.year} is not available yet:</span> {y.problems.length} values are missing
          {y.problems.every((m) => m.includes('awaiting-irs-publication')) ? ' because the IRS has not published them' : ''}.
        </p>
      ))}
      <Disclosure label={`Show all ${refs.length} tax values and sources`} openLabel="Hide tax values" className="mt-3">
        <div className="space-y-4">
          {GROUPS.map(([prefix, title]) => {
            const g = refs.filter((r) => r.path.startsWith(prefix));
            if (g.length === 0) return null;
            return (
              <div key={prefix}>
                <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-muted">{title}</h3>
                <ul className="mt-1.5 space-y-1.5">
                  {g.map((r) => (
                    <li key={r.path} className="text-sm">
                      <span className="text-ink">{pretty(r.path)}</span>
                      <ul className="mt-0.5">
                        <ParamChip p={r} />
                      </ul>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </Disclosure>
    </div>
  );
}
