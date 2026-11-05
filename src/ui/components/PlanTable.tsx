/**
 * Step 2: the editable plan sheet. Plans are columns (like a benefits guide),
 * fields are rows. Editing a sample plan clears its SAMPLE DATA badge.
 */
import type { ReactNode } from 'react';
import type { CoverageTier, Issue, Plan } from '../../engine/types';
import { COVERAGE_TIERS } from '../../engine/types';
import { MAX_PLANS, SLOT_VARS, TIER_LABEL } from '../model';
import { Checkbox, NumberField, Select, Swatch } from './fields';
import { IssueList } from './Issues';
import { Plus, RotateCcw, Trash2 } from 'lucide-react';
import { Button, Callout, Pill, TableScroll, th } from './ui';

interface Props {
  plans: Plan[];
  issues: Issue[];
  slotOf: (id: string) => number;
  tier: CoverageTier;
  onChange: (plans: Plan[]) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onReset: () => void;
}

type Row =
  | { kind: 'group'; label: string }
  | { kind: 'cell'; label: string; highlight?: boolean; render: (p: Plan, update: (patch: Partial<Plan>) => void) => ReactNode };

export function PlanTable({ plans, issues, slotOf, tier, onChange, onAdd, onRemove, onReset }: Props) {
  const update = (id: string) => (patch: Partial<Plan>) =>
    onChange(plans.map((p) => (p.id === id ? { ...p, ...patch, isSample: false } : p)));
  const money = (label: string, get: (p: Plan) => number, set: (p: Plan, v: number) => Partial<Plan>, opts?: { disabled?: (p: Plan) => boolean }) =>
    (p: Plan, u: (patch: Partial<Plan>) => void) => (
      <NumberField
        compact
        hideLabel
        label={`${p.name}: ${label}`}
        prefix="$"
        value={get(p)}
        onChange={(v) => u(set(p, v ?? 0))}
        max={1_000_000}
        disabled={opts?.disabled?.(p)}
      />
    );

  const rows: Row[] = [
    { kind: 'group', label: 'Premium per paycheck (your share)' },
    ...COVERAGE_TIERS.map(
      (t): Row => ({
        kind: 'cell',
        label: TIER_LABEL[t],
        highlight: t === tier,
        render: money(`premium per paycheck, ${TIER_LABEL[t]}`, (p) => p.premiumPerPaycheck[t], (p, v) => ({ premiumPerPaycheck: { ...p.premiumPerPaycheck, [t]: v } })),
      }),
    ),
    { kind: 'group', label: 'Deductible' },
    { kind: 'cell', label: 'Individual', highlight: tier === 'self', render: money('individual deductible', (p) => p.deductible.individual, (p, v) => ({ deductible: { ...p.deductible, individual: v } })) },
    { kind: 'cell', label: 'Family', highlight: tier !== 'self', render: money('family deductible', (p) => p.deductible.family, (p, v) => ({ deductible: { ...p.deductible, family: v } })) },
    {
      kind: 'cell',
      label: 'Family deductible works as',
      render: (p, u) => (
        <Select
          compact
          hideLabel
          label={`${p.name}: family deductible type`}
          value={p.familyDeductible ?? 'embedded'}
          onChange={(v) => u({ familyDeductible: v })}
          options={[
            { value: 'embedded', label: 'Embedded' },
            { value: 'aggregate', label: 'Aggregate' },
          ]}
        />
      ),
    },
    { kind: 'group', label: 'Out-of-pocket max' },
    { kind: 'cell', label: 'Individual', highlight: tier === 'self', render: money('individual out-of-pocket max', (p) => p.oopMax.individual, (p, v) => ({ oopMax: { ...p.oopMax, individual: v } })) },
    { kind: 'cell', label: 'Family', highlight: tier !== 'self', render: money('family out-of-pocket max', (p) => p.oopMax.family, (p, v) => ({ oopMax: { ...p.oopMax, family: v } })) },
    { kind: 'group', label: 'Cost sharing' },
    {
      kind: 'cell',
      label: 'Coinsurance after deductible',
      render: (p, u) => (
        <NumberField compact hideLabel percent suffix="%" label={`${p.name}: coinsurance`} value={p.coinsurance} onChange={(v) => u({ coinsurance: v ?? 0 })} max={1} />
      ),
    },
    {
      kind: 'cell',
      label: 'Copay per visit (blank = none)',
      render: (p, u) => (
        <NumberField compact hideLabel blankIsNull prefix="$" label={`${p.name}: copay per visit, blank for none`} value={p.copayPerVisit} onChange={(v) => u({ copayPerVisit: v })} max={10_000} placeholder="none" />
      ),
    },
    { kind: 'group', label: 'Health savings account' },
    {
      kind: 'cell',
      label: 'HSA-eligible (HDHP)',
      render: (p, u) => <Checkbox label={<span className="sr-only">{p.name}: HSA-eligible</span>} checked={p.hsaEligible} onChange={(v) => u({ hsaEligible: v })} />,
    },
    {
      kind: 'cell',
      label: 'Employer HSA, employee only',
      highlight: tier === 'self',
      render: money('employer HSA per year, employee only', (p) => p.employerHsa.selfOnly, (p, v) => ({ employerHsa: { ...p.employerHsa, selfOnly: v } }), { disabled: (p) => !p.hsaEligible }),
    },
    {
      kind: 'cell',
      label: 'Employer HSA, family',
      highlight: tier !== 'self',
      render: money('employer HSA per year, family', (p) => p.employerHsa.family, (p, v) => ({ employerHsa: { ...p.employerHsa, family: v } }), { disabled: (p) => !p.hsaEligible }),
    },
  ];

  type Cell = Extract<Row, { kind: 'cell' }>;
  const groups: Array<{ label: string; cells: Cell[] }> = [];
  for (const r of rows) {
    if (r.kind === 'group') groups.push({ label: r.label, cells: [] });
    else groups[groups.length - 1]!.cells.push(r);
  }

  return (
    <div className="space-y-4">
      {plans.some((p) => p.isSample) && (
        <Callout tone="warning" title="Columns marked SAMPLE DATA are made-up plans.">
          Replace them with the numbers from your employer's benefits guide (employee share of each premium, in-network cost sharing).
        </Callout>
      )}
      <TableScroll label="Plan details (scrollable)">
        <table className="w-full min-w-[600px] border-separate border-spacing-0 text-sm">
          <caption className="sr-only">Editable plan details. Each column is one plan. Rows marked "your tier" are the ones used for your coverage tier.</caption>
          <thead>
            <tr>
              <th scope="col" className={`${th} sticky left-0 z-10 w-36 align-bottom sm:w-52`}>
                Plan
              </th>
              {plans.map((p) => (
                <th key={p.id} scope="col" className="min-w-40 bg-paper-sunken px-2 py-2.5 text-left align-bottom font-normal">
                  <div className="flex items-center gap-1.5">
                    <Swatch color={SLOT_VARS[slotOf(p.id)]!} />
                    {p.isSample && <Pill tone="accent">SAMPLE DATA</Pill>}
                  </div>
                  <input
                    aria-label={`Plan name (${p.name})`}
                    value={p.name}
                    onChange={(e) => update(p.id)({ name: e.target.value })}
                    className="mt-1.5 w-full rounded-md border border-transparent bg-transparent px-2 py-1 text-left font-display text-lg font-semibold text-ink outline-none hover:border-rule-strong focus:border-brand"
                  />
                  <div className="mt-1 flex items-center gap-1">
                    <Select
                      compact
                      hideLabel
                      label={`${p.name}: plan type`}
                      value={p.kind}
                      onChange={(v) => update(p.id)({ kind: v })}
                      options={(['PPO', 'HMO', 'EPO', 'POS', 'HDHP'] as const).map((k) => ({ value: k, label: k }))}
                      className="grow"
                    />
                    <button
                      type="button"
                      onClick={() => onRemove(p.id)}
                      disabled={plans.length <= 1}
                      aria-label={`Remove ${p.name}`}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink-muted hover:bg-surface hover:text-danger disabled:opacity-30"
                    >
                      <Trash2 aria-hidden="true" className="h-4 w-4" />
                    </button>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          {groups.map((g) => (
            // One <tbody> per group with a rowgroup header, so screen readers announce the section.
            <tbody key={g.label}>
              <tr>
                <th
                  scope="rowgroup"
                  colSpan={plans.length + 1}
                  className="sticky left-0 border-t hairline bg-surface px-3 pt-4 pb-1.5 text-left text-xs font-semibold tracking-wider text-ink-faint uppercase"
                >
                  {g.label}
                </th>
              </tr>
              {g.cells.map((r) => (
                <tr key={r.label} className={r.highlight ? 'bg-brand-tint/40' : ''}>
                  <th scope="row" className={`sticky left-0 z-10 px-3 py-1.5 text-left font-normal text-ink ${r.highlight ? 'bg-brand-tint' : 'bg-surface'}`}>
                    {r.label}
                    {r.highlight && <span className="ml-1.5 text-xs font-semibold text-brand">· your tier</span>}
                  </th>
                  {plans.map((p) => (
                    <td key={p.id} className="px-2 py-1.5">
                      {r.render(p, update(p.id))}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </TableScroll>
      <p className="text-xs leading-snug text-ink-muted">
        <span className="font-semibold text-ink">Embedded</span>: each person also has the individual deductible.{' '}
        <span className="font-semibold text-ink">Aggregate</span>: the whole family deductible must be met first. Your plan's Summary of Benefits and
        Coverage says which. It only changes results when you choose "Mostly one person".
      </p>
      <IssueList issues={issues.filter((i) => i.planId)} label="Checks on your plan numbers" />
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" icon={Plus} onClick={onAdd} disabled={plans.length >= MAX_PLANS}>
          Add a plan
        </Button>
        <Button icon={RotateCcw} onClick={onReset}>
          Reset to sample plans
        </Button>
        {plans.length >= MAX_PLANS && <p className="text-xs text-ink-muted">Up to {MAX_PLANS} plans, so every line keeps a distinct color.</p>}
      </div>
    </div>
  );
}
