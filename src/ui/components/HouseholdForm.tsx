/** Your situation: the household inputs, as numbered steps in one card. */
import { BookOpenCheck, RotateCcw } from 'lucide-react';
import type { ResolvedTaxConfig } from '../../engine/types';
import { limitTierFor } from '../../engine/types';
import { fmtMoney0 } from '../../engine/money';
import type { FormState } from '../model';
import { FILING_LABEL, TIER_LABEL } from '../model';
import { Checkbox, Disclosure, NumberField, RadioCards, Select } from './fields';
import { Button, StepHeading } from './ui';

interface Props {
  form: FormState;
  set: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
  config: ResolvedTaxConfig;
  onLoadExample: () => void;
  onReset: () => void;
}

export function HouseholdForm({ form, set, config, onLoadExample, onReset }: Props) {
  const hsaLimit = config.hsa.contributionLimit[limitTierFor(form.coverageTier)] + (form.age >= 55 ? config.hsa.catchUpAge55 : 0);
  const stateOptions = [
    ...Object.values(config.states).map((s) => ({ value: s.key, label: s.name })),
    { value: 'CUSTOM', label: 'Another state (enter its rate)' },
  ];
  const num = (k: keyof FormState) => (v: number | null) => set(k, (v ?? 0) as never);
  const step = 'space-y-5 border-t hairline pt-6 first:border-t-0 first:pt-0';

  return (
    <form className="space-y-6" onSubmit={(e) => e.preventDefault()} noValidate aria-label="Your situation">
      <div className={step}>
        <StepHeading n={1}>Income and filing</StepHeading>
        <NumberField label="Your gross annual wages (W-2)" hint="Before any deductions." prefix="$" value={form.grossWages} onChange={num('grossWages')} max={10_000_000} />
        <RadioCards
          legend="Filing status"
          name="filing"
          value={form.filingStatus}
          onChange={(v) => set('filingStatus', v)}
          options={(Object.keys(FILING_LABEL) as FormState['filingStatus'][]).map((k) => ({ value: k, label: FILING_LABEL[k] }))}
        />
        <Select
          label="State"
          value={form.state}
          onChange={(v) => set('state', v)}
          options={stateOptions}
          hint={form.state === 'WA' ? 'No state income tax on wages. Paid Leave and WA Cares are charged on gross wages, so plan choice does not change them.' : undefined}
        />
        {form.state === 'CUSTOM' && (
          <div className="space-y-4 rounded-lg border hairline bg-paper-sunken/60 p-4">
            <NumberField
              label="Your state income tax rate"
              hint="Your top (marginal) state rate. This is your input, not a sourced parameter."
              suffix="%"
              value={form.customRatePct}
              onChange={num('customRatePct')}
              max={15}
            />
            <Checkbox label="My state taxes HSA contributions" checked={form.customTaxesHsa} onChange={(v) => set('customTaxesHsa', v)} hint="California and New Jersey do (verify for your state)." />
          </div>
        )}
      </div>

      <div className={step}>
        <StepHeading n={2}>Coverage</StepHeading>
        <RadioCards
          legend="Coverage tier"
          name="tier"
          value={form.coverageTier}
          onChange={(v) => set('coverageTier', v)}
          options={(Object.keys(TIER_LABEL) as FormState['coverageTier'][]).map((k) => ({ value: k, label: TIER_LABEL[k] }))}
        />
        {form.coverageTier !== 'self' && (
          <RadioCards
            legend="How is your family's care spread?"
            name="spread"
            value={form.familySpend}
            onChange={(v) => set('familySpend', v)}
            hint="Pooled uses the family deductible and out-of-pocket max, a safe high estimate. If one person has most of the care, their own limits usually apply sooner."
            options={[
              { value: 'pooled', label: 'Across the family', detail: 'Family limits' },
              { value: 'onePerson', label: 'Mostly one person', detail: 'Per-person limits' },
            ]}
          />
        )}
        <NumberField label="Your age" hint="Used for the HSA catch-up at 55+." value={form.age} onChange={num('age')} min={18} max={100} integer />
      </div>

      <div className={step}>
        <StepHeading n={3}>Expected care next year</StepHeading>
        <NumberField
          label="Expected medical spending"
          hint="Total allowed (network) cost of all care for everyone covered, not counting preventive care."
          prefix="$"
          suffix="per year"
          value={form.expectedSpend}
          onChange={num('expectedSpend')}
          max={1_000_000}
        />
        <NumberField
          label="Office visits and prescriptions"
          hint="Copay services. On copay plans each costs a flat copay."
          suffix="visits"
          value={form.expectedVisits}
          onChange={num('expectedVisits')}
          max={200}
          integer
        />
      </div>

      <div className={step}>
        <StepHeading n={4}>Pre-tax accounts (optional)</StepHeading>
        <NumberField
          label="HSA contribution (optional)"
          hint={`Payroll contribution, used with HSA-eligible plans only. ${config.taxYear} limit for your tier: ${fmtMoney0(hsaLimit)}, minus any employer money.`}
          prefix="$"
          suffix="per year"
          value={form.hsaContribution}
          onChange={num('hsaContribution')}
          max={100_000}
          placeholder="0"
        />
        <NumberField
          label="Health FSA election (optional)"
          hint={`Used with non-HSA plans only. ${config.taxYear} limit: ${fmtMoney0(config.healthFsa.salaryReductionLimit)}. Money you don't spend is forfeited.`}
          prefix="$"
          suffix="per year"
          value={form.fsaContribution}
          onChange={num('fsaContribution')}
          max={100_000}
          placeholder="0"
        />
        {form.fsaContribution > 0 && (
          <Checkbox
            label={`My employer's FSA allows carryover (up to ${fmtMoney0(config.healthFsa.maxCarryover)})`}
            checked={form.fsaCarryoverAllowed}
            onChange={(v) => set('fsaCarryoverAllowed', v)}
          />
        )}
      </div>

      <div className={step}>
        <Disclosure label="More options" openLabel="Fewer options">
          <div className="space-y-5">
            <Select
              label="Paychecks per year"
              value={form.payPeriodsPerYear}
              onChange={(v) => set('payPeriodsPerYear', v)}
              options={[
                { value: 52, label: '52 (weekly)' },
                { value: 26, label: '26 (every two weeks)' },
                { value: 24, label: '24 (twice a month)' },
                { value: 12, label: '12 (monthly)' },
              ]}
            />
            <Checkbox
              label="Premiums are taken out pre-tax (Section 125)"
              checked={form.premiumsPreTax}
              onChange={(v) => set('premiumsPreTax', v)}
              hint="True at nearly every employer. Turn off only if your pay stub shows premiums after taxes."
            />
            <NumberField
              label="Allowed cost per office visit or prescription"
              hint="Assumption ($150 by default). Splits your spending into copay services and everything else."
              prefix="$"
              value={form.allowedPerVisit}
              onChange={num('allowedPerVisit')}
              min={1}
              max={2000}
            />
            <NumberField
              label="Other household taxable income"
              hint="Spouse's wages and other income on the same return. Affects your tax bracket only."
              prefix="$"
              value={form.otherHouseholdIncome}
              onChange={num('otherHouseholdIncome')}
              max={10_000_000}
            />
            <NumberField
              label="Traditional 401(k)/403(b) contributions"
              hint="Lowers income-tax wages (not Social Security/Medicare wages), so your bracket is right."
              prefix="$"
              value={form.preTaxRetirement}
              onChange={num('preTaxRetirement')}
              max={1_000_000}
            />
            <div className="grid grid-cols-2 gap-3">
              <NumberField label="Low-use spending" prefix="$" value={form.lowSpend} onChange={num('lowSpend')} max={1_000_000} />
              <NumberField label="Low-use visits" value={form.lowVisits} onChange={num('lowVisits')} max={200} integer />
            </div>
          </div>
        </Disclosure>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t hairline pt-5">
        <Button variant="primary" icon={BookOpenCheck} onClick={onLoadExample}>
          Load the spec's worked example
        </Button>
        <Button icon={RotateCcw} onClick={onReset}>
          Reset
        </Button>
        <p className="w-full text-xs text-ink-muted">Results update as you type. The worked example is $85,000, single, WA, HSA $2,000, sample plans.</p>
      </div>
    </form>
  );
}
