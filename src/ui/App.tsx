/**
 * Health Plan Chooser: app shell in the CodeRx "ledger" layout, with its own theme.
 * All state lives in memory in this component. Nothing is stored or sent (SPEC A19);
 * a reload starts fresh.
 */
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { ShieldCheck, TriangleAlert } from 'lucide-react';
import type { Plan, ScenarioId } from '../engine/types';
import { compare } from '../engine/compare';
import { InputError } from '../engine/validate';
import { fmtMoney0 } from '../engine/money';
import { latestUsableYear, loadTaxYears } from '../config';
import { blankPlan, DEFAULT_FORM, MAX_PLANS, samplePlans, toHousehold, toScenarios, WORKED_EXAMPLE_FORM, type FormState } from './model';
import { Select } from './components/fields';
import { SiteFooter, SiteHeader } from './components/chrome';
import { Card, Callout, PageSection, Pill } from './components/ui';
import { HouseholdForm } from './components/HouseholdForm';
import { PlanTable } from './components/PlanTable';
import { Summary } from './components/Summary';
import { BreakEvenView } from './components/BreakEvenView';
import { Breakdown } from './components/Breakdown';
import { TaxDataPanel } from './components/TaxDataPanel';

// The chart library is the largest dependency; load it as its own chunk.
const CostChart = lazy(() => import('./components/CostChart').then((m) => ({ default: m.CostChart })));

const DISCLAIMER = 'Estimates for education only; not tax or medical advice.';
const SAMPLE_SLOTS: Record<string, number> = { 'sample-ppo': 0, 'sample-hmo': 1, 'sample-hdhp': 2 };

export function App() {
  const years = useMemo(() => loadTaxYears(), []);
  const [year, setYear] = useState(() => latestUsableYear(years)?.year ?? years[0]!.year);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [plans, setPlans] = useState<Plan[]>(samplePlans);
  // Color follows the plan, not its position: each plan keeps its slot when others are removed.
  const [slots, setSlots] = useState<Record<string, number>>(SAMPLE_SLOTS);
  const [scenarioId, setScenarioId] = useState<ScenarioId>('expected');
  const [openMath, setOpenMath] = useState<Set<string>>(new Set());

  const status = years.find((y) => y.year === year);
  const config = status?.config;
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));
  const slotOf = (id: string) => slots[id] ?? 0;
  const scenarios = useMemo(() => toScenarios(form), [form]);

  const computed = useMemo(() => {
    if (!config) return { problems: [`Tax year ${year} is not available.`] } as const;
    try {
      return { result: compare({ household: toHousehold(form, config.taxYear), plans, scenarios, config }) } as const;
    } catch (e) {
      if (e instanceof InputError) return { problems: e.problems } as const;
      return { problems: [e instanceof Error ? e.message : String(e)] } as const;
    }
  }, [config, form, plans, scenarios, year]);
  const result = 'result' in computed ? computed.result : null;
  const problems: readonly string[] = 'problems' in computed ? (computed.problems ?? []) : [];

  // One short, polite screen-reader announcement once typing settles (not on every keystroke).
  const [announcement, setAnnouncement] = useState('');
  useEffect(() => {
    const t = setTimeout(() => {
      if (!result) return setAnnouncement('Results unavailable: fix the highlighted inputs.');
      const best = result.rankings[scenarioId][0];
      const name = plans.find((p) => p.id === best?.planId)?.name;
      const label = scenarioId === 'low' ? 'low use' : scenarioId === 'expected' ? 'expected use' : 'high use';
      if (best && name) setAnnouncement(`Lowest net cost at ${label}: ${name}, ${fmtMoney0(best.netCost)} a year.`);
    }, 800);
    return () => clearTimeout(t);
  }, [result, scenarioId, plans]);

  function addPlan() {
    if (plans.length >= MAX_PLANS) return;
    const p = blankPlan();
    const used = new Set(plans.map((x) => slotOf(x.id)));
    const free = [0, 1, 2, 3, 4, 5].find((s) => !used.has(s)) ?? 0;
    setSlots((s) => ({ ...s, [p.id]: free }));
    setPlans((ps) => [...ps, p]);
  }
  function resetPlans() {
    setPlans(samplePlans());
    setSlots(SAMPLE_SLOTS);
  }
  function showMath(planId: string) {
    setOpenMath((s) => new Set(s).add(planId));
    requestAnimationFrame(() => document.getElementById(`math-${planId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }
  function toggleMath(planId: string) {
    setOpenMath((s) => {
      const n = new Set(s);
      if (n.has(planId)) n.delete(planId);
      else n.add(planId);
      return n;
    });
  }

  const unverified = config ? Object.values(config.refs).filter((r) => !r.userVerified).length : 0;
  const footerSources = config
    ? Object.values(config.sources)
        .filter((s) => s.retrieved && /irs\.gov|wa\.gov/.test(s.url))
        .map((s) => ({ title: s.title.replace(/\s*\(.*\)$/, ''), url: s.url }))
    : [];
  const yearPicker = (
    <Select
      compact
      hideLabel
      label="Tax year"
      value={year}
      onChange={setYear}
      options={years.map((y) => ({ value: y.year, label: y.usable ? `Tax year ${y.year}` : `${y.year} (awaiting IRS)`, disabled: !y.usable }))}
      className="w-40"
    />
  );

  return (
    <div id="top" className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only z-50 rounded-lg bg-brand px-4 py-3 font-semibold text-on-brand focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to main content
      </a>
      <SiteHeader right={yearPicker} />

      <main id="main" tabIndex={-1} className="w-full flex-1 focus:outline-none">
        {/* Full-bleed ledger band; content below sits in the 7xl column. */}
        <header className="ledger mb-8 border-b hairline px-4 pt-9 pb-8 sm:px-6 lg:px-8">
          <div className="rise mx-auto max-w-7xl">
            <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-ink-muted">
              <Pill tone="brand">Open enrollment worksheet</Pill>
              <Pill tone="ok" icon={ShieldCheck}>
                Runs only in this browser
              </Pill>
              {config && unverified > 0 && (
                <a href="#tax-data" className="rounded-full">
                  <Pill tone="accent" icon={TriangleAlert}>
                    {unverified} tax values not yet verified by you
                  </Pill>
                </a>
              )}
            </div>
            <h1 className="max-w-4xl font-display text-[2.2rem] leading-[1.08] font-semibold tracking-tight text-ink sm:text-5xl">
              Which health plan costs you <span className="text-brand italic">least</span>, after taxes?
            </h1>
            <p className="mt-3 max-w-3xl text-base text-ink-muted sm:text-lg">
              Premiums, deductibles, coinsurance, and copays, minus what pre-tax payroll deductions save you in federal income tax, Social Security,
              Medicare, and state tax. Every number shows its math.
            </p>
            <p role="note" className="mt-4 inline-block rounded-lg border hairline bg-surface px-3 py-1.5 text-sm font-semibold text-ink">
              {DISCLAIMER}
            </p>
          </div>
        </header>

        <p className="sr-only" aria-live="polite" aria-atomic="true">
          {announcement}
        </p>

        <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[400px_minmax(0,1fr)] lg:items-start lg:px-8">
          <aside id="situation" aria-labelledby="situation-title" className="scroll-mt-24 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto lg:pr-1">
            <div className="mb-4 flex items-baseline gap-3">
              <span aria-hidden="true" className="code-chip text-sm text-ink-faint">
                01
              </span>
              <h2 id="situation-title" className="font-display text-2xl font-semibold tracking-tight text-ink">
                Your situation
              </h2>
            </div>
            {config && (
              <Card>
                <HouseholdForm
                  form={form}
                  set={set}
                  config={config}
                  onLoadExample={() => {
                    setForm(WORKED_EXAMPLE_FORM);
                    resetPlans();
                    setScenarioId('expected');
                  }}
                  onReset={() => {
                    setForm(DEFAULT_FORM);
                    resetPlans();
                    setOpenMath(new Set());
                  }}
                />
              </Card>
            )}
          </aside>

          <div className="min-w-0">
            {result ? (
              <PageSection id="answer" number="02" title="Your lowest-cost plan">
                <Summary
                  result={result}
                  plans={plans}
                  scenarios={scenarios}
                  scenarioId={scenarioId}
                  setScenarioId={setScenarioId}
                  slotOf={slotOf}
                  onShowMath={showMath}
                  expectedSpend={form.expectedSpend}
                />
              </PageSection>
            ) : (
              <PageSection id="answer" number="02" title="Can't compute yet">
                <Callout tone="danger" title="Fix these and the results will appear:">
                  <ul className="mt-1 list-disc space-y-1 pl-5">
                    {problems.map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                </Callout>
              </PageSection>
            )}

            <PageSection
              id="plans"
              number="03"
              title="Your plans"
              description="Copy the employee share of each premium and the in-network cost-sharing numbers from your benefits guide."
            >
              <PlanTable
                plans={plans}
                issues={result?.issues ?? []}
                slotOf={slotOf}
                tier={form.coverageTier}
                onChange={setPlans}
                onAdd={addPlan}
                onRemove={(id) => setPlans((ps) => ps.filter((p) => p.id !== id))}
                onReset={resetPlans}
              />
            </PageSection>

            {result && (
              <>
                <PageSection
                  id="chart"
                  number="04"
                  title="Cost by amount of care"
                  description="Net after-tax cost of each plan as your year's medical spending rises. Hover, tap, or focus the chart and use the arrow keys."
                >
                  <Suspense fallback={<div className="h-[460px] rounded-xl border hairline bg-surface" aria-hidden />}>
                    <CostChart result={result} plans={plans} slotOf={slotOf} expectedSpend={form.expectedSpend} />
                  </Suspense>
                </PageSection>

                <PageSection id="break-even" number="05" title="Break-even points" description="The spending levels where one plan becomes cheaper than another.">
                  <BreakEvenView result={result} plans={plans} slotOf={slotOf} expectedSpend={form.expectedSpend} />
                </PageSection>

                <PageSection id="breakdown" number="06" title="Line-by-line breakdown" description="Every number, with its formula and sources, for the scenario selected above.">
                  <Breakdown result={result} plans={plans} scenarioId={scenarioId} slotOf={slotOf} openMath={openMath} toggleMath={toggleMath} />
                </PageSection>
              </>
            )}

            {config && (
              <PageSection id="tax-data" number="07" title="Tax values used" description="Every parameter, with its value, primary source, and where in the source it appears.">
                <TaxDataPanel config={config} years={years} />
              </PageSection>
            )}
          </div>
        </div>
      </main>

      <SiteFooter disclaimer={DISCLAIMER} sources={footerSources} />
    </div>
  );
}
