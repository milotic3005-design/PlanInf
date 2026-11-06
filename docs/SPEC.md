# Health Plan Chooser: Stage 1 Spec

> **Estimates for education only; not tax or medical advice.**

| | |
|---|---|
| Stage | 1 of 4 (Spec). No engine or UI code yet. |
| Date | 2026-11-04 |
| Tax data | [`src/config/tax-years/2026.json`](../src/config/tax-years/2026.json) (complete), [`2027.json`](../src/config/tax-years/2027.json) (complete since 2026-11-05, see §14) |
| Sample plans | Every plan in this document is **sample data**, not a real employer's plan. |

---

## 1. What the app does

The user enters wages, filing status, state, coverage tier, and expected medical spending. The app compares the employer's medical plans by **net after-tax annual cost** under three usage levels (Low, Expected, High). It also finds the spending level where each pair of plans swaps places (break-even). Every number has a "show math" panel that lists the formula, the inputs, and the tax parameters used, with sources.

All math runs in the browser. Nothing is sent or stored.

---

## 2. Assumptions

| # | Assumption | Why it matters |
|---|---|---|
| A1 | One U.S. W-2 employee, one employer, a calendar plan year that equals the tax year. | Mid-year plan years split across two tax years. Not modeled. |
| A2 | Employee premiums are deducted pre-tax under Section 125 (default on; toggle to post-tax). Pre-tax premiums are excluded from federal income tax wages and from FICA wages. Source: IRS Pub 15 (2026) Sec. 15, "Cafeteria plan benefits under section 125". | Drives the premium tax shield. |
| A3 | HSA contributions go through payroll under Section 125, so they skip income tax **and** FICA. Source: Pub 15 (2026) Sec. 5: "HSA contributions made under a salary reduction arrangement in a section 125 cafeteria plan aren't wages." | Contributions made outside payroll save income tax only. v1 assumes payroll. |
| A4 | HSA contributions are allowed only with a plan marked HSA-eligible. The app checks that flag against the IRS HDHP minimum deductible and maximum out-of-pocket for the year. Employer HSA money counts toward the annual limit (26 U.S.C. 223(b)(4)(B), verify). | Stops an invalid HSA from making a plan look cheaper. |
| A5 | A health FSA is optional and applies only to non-HSA plans. A general-purpose FSA makes you ineligible for an HSA. Limited-purpose FSAs are not modeled in v1. | Keeps the two accounts mutually exclusive. |
| A6 | Federal income tax uses the standard deduction, no itemizing, and no credits (Child Tax Credit, EITC, premium tax credit). It uses the IRS rate-schedule formula, not the tax table. At 65+ the employee's additional standard deduction is added (the spouse's age isn't asked). The separate senior deduction added by the 2025 tax law is not modeled. | The tax table can differ by a few dollars under $100,000 of taxable income. That difference cancels out between plans. |
| A7 | Tax savings are computed **exactly**: tax without the deduction minus tax with it. The app does not use marginal rate × amount. The marginal rate is still shown in the math panel. | Handles deductions that cross a bracket edge or the Social Security wage base. |
| A8 | **Washington:** no state income tax on wages in 2026 or 2027. WA Paid Leave and WA Cares premiums are charged on **gross** wages; the ESD toolkit lists only tips as excluded. Pre-tax deductions therefore do not lower them. In WA the tax shield is federal income tax + FICA only. | This is the main WA-specific result. ESD does not mention Section 125 by name, so it is flagged for you to confirm. |
| A9 | Other states in v1: a "Custom state" option where you enter your state marginal rate and say whether your state taxes HSA contributions (California and New Jersey do; verify). Full bracket tables are added one state at a time, with sources. | Avoids shipping 50 unverified bracket tables. See Q2. |
| A10 | "Medical spend" means **total allowed charges**: the network-negotiated price of all care for everyone on the plan for the year, not the billed amount. Preventive care is left out because ACA plans cover it at $0. | The engine applies the deductible and coinsurance to allowed charges. |
| A11 | Copay plans charge a flat copay for "copay services" (office visits, generic prescriptions), and those copays do not count toward the deductible. Everything else goes through the deductible, then coinsurance. Total employee cost is capped at the out-of-pocket (OOP) max. On an HDHP every service goes through deductible, then coinsurance. | This is the copay model. See Q3. |
| A12 | Family tiers pool everyone's spending against the **family** deductible and family OOP max. Embedded per-person limits are not modeled in v1. | Pooling overstates cost when one person has most of the spending, so it is conservative. See Q5. |
| A13 | Default allowed cost per copay visit: **$150**. This is a sample assumption you can edit. | Splits spending into the copay part and the deductible part. |
| A14 | HSA and FSA amounts are fixed at enrollment and do not change by scenario. Unspent HSA money stays yours, so the contribution itself is not a cost; only its tax savings count. FSA money above your expenses, minus any carryover the plan allows, is forfeited and counts as a cost. | Matches real enrollment rules. |
| A15 | In-network care only. No HRA, wellness credits, spousal surcharges, or imputed income for domestic-partner coverage. | Scope control. |
| A16 | Pre-tax deductions lower Social Security wages slightly, which lowers future Social Security benefits slightly. Not modeled. | Stated so the result isn't overstated. |
| A17 | Annual premium = premium per paycheck × pay periods per year (default 26). | |
| A18 | All math is unrounded. The math panel rounds half-up to cents; summaries round to whole dollars. | Keeps the hand check within $1. |
| A19 | Privacy: no backend, no analytics, no storage. A Content-Security-Policy of `connect-src 'none'` stops the page from sending data even if a dependency tried to. | Makes "nothing leaves the browser" enforceable, not just a promise. |

---

## 3. Inputs

### 3.1 Household inputs

| Field | Type | Default | Allowed values | Used for |
|---|---|---|---|---|
| `taxYear` | select | latest **complete** year in config (2026 today) | years present in config | which TaxConfig to load |
| `grossWages` | $ | (required) | 0 – 10,000,000 | income tax, FICA |
| `otherHouseholdIncome` | $ | 0 | ≥ 0 | income tax brackets only (for example, spouse wages when filing jointly). Treated as spouse wages for the MFJ Additional Medicare threshold. |
| `preTaxRetirement` | $ | 0 | ≥ 0 | traditional 401(k)/403(b) deferrals. Lowers income-tax wages only, not FICA wages. Places you in the right bracket. |
| `filingStatus` | select | Single | Single, MFJ, MFS, HoH | brackets, standard deduction, Additional Medicare threshold |
| `state` | select | WA | WA, Custom | state tax rules |
| `customState.marginalRate` | % | (none) | 0 – 15% | Custom only |
| `customState.taxesHsa` | bool | false | | Custom only |
| `coverageTier` | select | Employee only | Employee only, Employee + spouse, Employee + child(ren), Family | premium; individual vs. family deductible, OOP, and HSA limit |
| `age` | integer | (required) | 18 – 100 | HSA catch-up at 55+; warning at 65+ (Medicare enrollment ends HSA eligibility) |
| `payPeriodsPerYear` | select | 26 | 52, 26, 24, 12 | annual premium |
| `premiumsPreTax` | bool | true | | A2 |
| `expectedSpend` | $ | 3,000 | 0 – 1,000,000 | Expected scenario |
| `expectedVisits` | integer | 4 | 0 – 200 | copay services in Expected scenario |
| `allowedPerVisit` | $ | 150 | 1 – 2,000 | A13 |
| `hsaContribution` | $ | see Q4 | 0 – HSA max (F12) | HSA plans only |
| `fsaContribution` | $ | 0 | 0 – FSA limit | non-HSA plans only |
| `fsaCarryoverAllowed` | bool | false | | F10 |

### 3.2 Plan table (editable, one row per plan)

| Field | Type | Notes |
|---|---|---|
| `name` | text | |
| `kind` | PPO / HMO / EPO / POS / HDHP | label only; behavior comes from the fields below |
| `isSample` | bool | sample rows show a "SAMPLE DATA" badge |
| `hsaEligible` | bool | checked against the year's HDHP limits (A4) |
| `premiumPerPaycheck` | $ × 4 tiers | employee share only |
| `deductible.individual`, `deductible.family` | $ | |
| `oopMax.individual`, `oopMax.family` | $ | |
| `coinsurance` | % | employee share after the deductible |
| `copayPerVisit` | $ or blank | blank means visits go through the deductible and coinsurance |
| `employerHsa.selfOnly`, `employerHsa.family` | $ per year | must be 0 unless `hsaEligible` |

### 3.3 Scenarios

| Scenario | Allowed spend `S` | Copay visits `n` | Editable |
|---|---|---|---|
| Low | $300 (default, Q6) | 2 | yes |
| Expected | `expectedSpend` | `expectedVisits` | yes (main input) |
| High | enough that every plan reaches its OOP max | (not applicable) | no |

---

## 4. Outputs

| Output | Content |
|---|---|
| Ranked results (one table per scenario) | plan, annual premium, out-of-pocket, tax savings (premium + account), employer HSA, FSA forfeit, **net cost**, difference vs. the cheapest plan |
| Cost-by-usage chart data | net cost vs. allowed spend from $0 to `Smax` for each plan (`Smax` = the largest spend needed to reach any plan's OOP max, × 1.1) |
| Break-even list | for each pair of plans: every spend where they swap, and which plan is cheaper on each side, or "A is cheaper at every spending level" |
| "Why this plan wins" | 2–3 plain sentences built from the largest cost differences between the winner and the runner-up, plus the nearest break-even |
| Show math | for every number: ordered steps (label, formula, values, result) and each tax parameter used (value, source, pinpoint, verified badge) |
| Warnings | for example: HSA amount over the limit; plan marked HSA-eligible fails the IRS HDHP test; income below the standard deduction; tax year incomplete |

---

## 5. Data model (TypeScript)

```ts
// ---------- Shared ----------
type FilingStatus = 'single' | 'mfj' | 'mfs' | 'hoh';
type CoverageTier = 'self' | 'selfSpouse' | 'selfChildren' | 'family';
type LimitTier = 'selfOnly' | 'family'; // derived: tier === 'self' ? 'selfOnly' : 'family'

// ---------- Plan ----------
interface Plan {
  id: string;
  name: string;
  kind: 'PPO' | 'HMO' | 'EPO' | 'POS' | 'HDHP';
  isSample: boolean;
  hsaEligible: boolean;
  premiumPerPaycheck: Record<CoverageTier, number>; // employee share
  deductible: { individual: number; family: number };
  oopMax: { individual: number; family: number };
  coinsurance: number;          // 0–1, employee share after deductible
  copayPerVisit: number | null; // null: visits go through deductible/coinsurance
  employerHsa: Record<LimitTier, number>; // annual $, 0 unless hsaEligible
}

// ---------- Scenario ----------
interface Scenario {
  id: 'low' | 'expected' | 'high';
  label: string;
  allowedSpend: number | 'reachOopMax';
  copayVisits: number;
}

// ---------- Household (user inputs) ----------
interface Household {
  taxYear: number;
  grossWages: number;
  otherHouseholdIncome: number;
  preTaxRetirement: number;
  filingStatus: FilingStatus;
  state: 'WA' | 'CUSTOM';
  customState?: { marginalRate: number; taxesHsa: boolean };
  coverageTier: CoverageTier;
  age: number;
  payPeriodsPerYear: 52 | 26 | 24 | 12;
  premiumsPreTax: boolean;
  allowedPerVisit: number;
  hsaContribution: number;
  fsaContribution: number;
  fsaCarryoverAllowed: boolean;
}

// ---------- TaxConfig (shape of src/config/tax-years/<year>.json) ----------
interface Param<T> {
  value: T | null;           // null = not yet published; loader refuses the year
  source: string;            // key into TaxConfig.sources
  pinpoint: string;          // section / table / quote
  userVerified: boolean;     // you flip to true after checking
  status?: 'awaiting-irs-publication' | 'assumed-unchanged-verify';
  statutory?: string;        // statute behind a fixed rate
}
interface BracketRow { over: number; rate: number }
interface Source {
  title: string; publisher: string; url: string;
  retrieved: string | null;  // ISO date, null = not fetched
  readBy: string;            // how the value was checked
}
interface StatePayrollTax {
  id: string; name: string;
  totalRate: Param<number>;
  employeeShare: Param<number>;
  wageCap: Param<'socialSecurityWageBase' | number | null>;
  reducedBySection125: Param<boolean>;
}
interface StateConfig {
  name: string;
  incomeTax: { type: Param<'none' | 'flat' | 'brackets'> /* + rates when not 'none' */ };
  payrollTaxes: StatePayrollTax[];
}
interface TaxConfig {
  taxYear: number;
  status: 'complete' | 'partial';
  federal: {
    standardDeduction: Record<FilingStatus, Param<number>>;
    additionalStandardDeductionAge65OrBlind: { married: Param<number>; unmarried: Param<number> };
    brackets: Record<FilingStatus, Param<BracketRow[]> & { printedBaseAmounts: number[] | null }>;
  };
  fica: {
    socialSecurityRate: Param<number>;
    socialSecurityWageBase: Param<number>;
    medicareRate: Param<number>;
    additionalMedicareRate: Param<number>;
    additionalMedicareThreshold: Record<FilingStatus, Param<number>>;
    section125ExcludedFromFicaWages: Param<boolean>;
  };
  hsa: {
    contributionLimit: Record<LimitTier, Param<number>>;
    catchUpAge55: Param<number>;
    hdhpMinDeductible: Record<LimitTier, Param<number>>;
    hdhpMaxOutOfPocket: Record<LimitTier, Param<number>>;
  };
  healthFsa: { salaryReductionLimit: Param<number>; maxCarryover: Param<number> };
  states: Record<string, StateConfig>;
  sources: Record<string, Source>;
}

// ---------- Results ----------
interface ParamRef { path: string; value: number | string | boolean; source: string; pinpoint: string; userVerified: boolean }
interface MathStep { label: string; formula: string; values: Record<string, number>; result: number; params: ParamRef[] }
interface TaxBreakdown {
  federalIncome: number; socialSecurity: number; medicare: number;
  additionalMedicare: number; stateIncome: number; statePayroll: number; total: number;
}
interface PlanScenarioResult {
  planId: string; scenarioId: Scenario['id'];
  annualPremium: number; outOfPocket: number;
  premiumTaxSavings: TaxBreakdown; accountTaxSavings: TaxBreakdown;
  employerHsa: number; fsaForfeit: number; netCost: number;
  math: MathStep[];
}
type BreakEvenCrossing =
  | { kind: 'point'; spend: number; cheaperBelow: string; cheaperAbove: string }
  | { kind: 'range'; from: number; to: number; cheaperBelow: string | 'tie'; cheaperAbove: string | 'tie' }; // tie over an interval
interface BreakEven {
  planA: string; planB: string;
  copayVisits: number;              // held fixed while spend varies
  searchedTo: number;               // = chart max spend
  crossings: BreakEvenCrossing[];   // only points where the cheaper plan changes, plus tie ranges
  cheaperAtZero: string | 'tie';
  minGapIfNoCrossing: number | null;
  summary: string;
  math: MathStep[];
}
```

The authoritative types are in [`src/engine/types.ts`](../src/engine/types.ts). Stage 2 also added `oopDetail`, `account`, `employeeHsa`, `fsaElection` to `PlanScenarioResult` and an `issues` list to the comparison result. Stage 3 added `curve` (chart data on a shared spend grid that includes every kink and crossing), `cheapestBySpend` (the break-even strip), `hsaHints` (Q4 callout), and `explainScenario()` in `src/engine/explain.ts` (the §7.2 "why this plan wins" text).

---

## 6. Tax parameters

Every value below is in the JSON config with a source, a pinpoint, and `userVerified: false`. **You must check each one** before relying on the app. I transcribed each value from the source text on 2026-11-04, except the three statute citations marked †, which I did not fetch.

| Parameter | 2026 | 2027 | Source (pinpoint) |
|---|---|---|---|
| Standard deduction: Single / MFJ / MFS / HoH | 16,100 / 32,200 / 16,100 / 24,150 | **pending IRS** | Rev. Proc. 2025-32 §4.14(1) |
| Additional std. deduction, 65+/blind (married / unmarried) | 1,650 / 2,050 | pending | Rev. Proc. 2025-32 §4.14(3) |
| Bracket rates | 10, 12, 22, 24, 32, 35, 37% | pending | Rev. Proc. 2025-32 §4.01 |
| Single: bracket starts ("over") | 0; 12,400; 50,400; 105,700; 201,775; 256,225; 640,600 | pending | §4.01 Table 3 |
| MFJ: bracket starts | 0; 24,800; 100,800; 211,400; 403,550; 512,450; 768,700 | pending | §4.01 Table 1 |
| MFS: bracket starts | 0; 12,400; 50,400; 105,700; 201,775; 256,225; 384,350 | pending | §4.01 Table 4 |
| HoH: bracket starts | 0; 17,700; 67,450; 105,700; 201,750; 256,200; 640,600 | pending | §4.01 Table 2 |
| Social Security rate (employee) | 6.2% | 6.2% | Pub 15 (2026 / 2027 draft) "What's New" |
| Social Security wage base | 184,500 | 192,300 | Pub 15 (2026); Pub 15 (2027) **draft** dated Oct 14, 2026. Also check SSA. |
| Medicare rate (employee) | 1.45% | 1.45% | Pub 15 "What's New" |
| Additional Medicare tax | 0.9% over 200k (Single/HoH), 250k (MFJ), 125k (MFS) | same (fixed in statute) | 26 U.S.C. 3101(b)(2) † |
| HSA limit: self-only / family | 4,400 / 8,750 | 4,500 / 9,000 | Rev. Proc. 2025-19 §2.01(1); Rev. Proc. 2026-24 §3.01(1) |
| HSA catch-up, age 55+ | 1,000 | 1,000 | 26 U.S.C. 223(b)(3)(B) † (fixed in statute) |
| HDHP min deductible: self / family | 1,700 / 3,400 | 1,750 / 3,500 | Rev. Proc. 2025-19 §2.01(2); 2026-24 §3.01(3) |
| HDHP max OOP: self / family | 8,500 / 17,000 | 8,700 / 17,400 | same |
| Health FSA limit / max carryover | 3,400 / 680 | **pending IRS** | Rev. Proc. 2025-32 §4.15 |
| WA income tax on wages | none | none | WA DOR income tax page. SB 6346's 9.9% tax on AGI over $1M starts in 2028. |
| WA Paid Leave (employee share) | 1.13% × 71.43%, capped at SS wage base | 1.2% × 70.7% | ESD toolkit v25.1 (2026); ESD release Oct 16, 2026; RCW 50A.10.030 |
| WA Cares | 0.58%, no cap | 0.58% (assumed, verify) | RCW 50B.04.080; ESD toolkit |
| WA Paid Leave / WA Cares reduced by Section 125? | **No** (gross wages) | No | ESD toolkit p. 17, "Gross wages" (verify) |

**Transcription check.** For all four 2026 filing statuses, the base amounts I computed from these brackets match the IRS-printed "$N plus" amounts (for example, Single 1,240 / 5,800 / 17,966 / 41,024 / 58,448 / 192,979.25). Stage 2 makes this a unit test.

**2027 status.** The table above is the state at Stage 1 (2026-11-04), before the IRS published. The 12 pending values were filled on 2026-11-05 from Rev. Proc. 2026-35 (see §14). The JSON files are the source of truth.

Source links:
- Rev. Proc. 2025-32: <https://www.irs.gov/pub/irs-drop/rp-25-32.pdf>
- Rev. Proc. 2025-19: <https://www.irs.gov/pub/irs-drop/rp-25-19.pdf>
- Rev. Proc. 2026-24: <https://www.irs.gov/pub/irs-drop/rp-26-24.pdf>
- Pub 15 (2026): <https://www.irs.gov/pub/irs-pdf/p15.pdf> and Pub 15 (2027) draft: <https://www.irs.gov/pub/irs-dft/p15--dft.pdf>
- SSA contribution and benefit base: <https://www.ssa.gov/oact/cola/cbb.html> (automated fetch was refused; open it in a browser)
- 26 U.S.C. 3101: <https://www.law.cornell.edu/uscode/text/26/3101>; 26 U.S.C. 223: <https://www.law.cornell.edu/uscode/text/26/223>
- WA DOR: <https://dor.wa.gov/taxes-rates/income-tax>
- ESD 2027 rate: <https://esd.wa.gov/about-us/news-release/2026/paid-family-medical-leave-premium-rate-increases-12-2027>
- ESD toolkit: <https://paidleave.wa.gov/app/uploads/2021/12/Employer-Wage-Reporting-and-Premiums-Toolkit-v25.1-2026.06.26.pdf>

---

## 7. Formulas

**Notation:** `G` gross wages · `O` other household income · `K` pre-tax retirement · `P` annual premium · `H` employee HSA contribution · `E` employer HSA contribution · `F` FSA election · `S` allowed spend · `n` copay visits · `a` allowed cost per visit · `fs` filing status · `ded`, `oopMax` = individual values when tier is `self`, otherwise family values.

| # | Quantity | Formula |
|---|---|---|
| F1 | Annual premium | `P = premiumPerPaycheck[tier] × payPeriodsPerYear` |
| F2 | Section 125 amount | `X = (premiumsPreTax ? P : 0) + H + F` |
| F3 | Federal taxable income | `TI(X) = max(0, G − X − K + O − StdDed[fs])` |
| F4 | Federal income tax | `FIT(TI) = Σᵢ rateᵢ × max(0, min(TI, overᵢ₊₁) − overᵢ)` |
| F5 | FICA (employee) | `W = G − X`; `SS = ssRate × min(W, wageBase)`; `Med = medRate × W`; `AddlMed = 0.9% × max(0, W + (fs = MFJ ? O : 0) − threshold[fs])` |
| F6 | State | **WA:** income tax 0. Paid Leave and WA Cares are computed on `G`, which does not depend on `X`, so they never change between plans. **Custom:** `StateTax(X) = r × (G − Xₛ)` where `Xₛ = P + F + (taxesHsa ? 0 : H)` |
| F7 | Total employee tax | `T(X) = FIT(TI(X)) + SS + Med + AddlMed + StateTax` |
| F8 | Tax savings, attributed in sequence | Premium: `TSₚ = T(0) − T(P)`. Account: `TSₐ = T(P) − T(P + H + F)`. They add up exactly to `T(0) − T(X)`. |
| F9 | Out-of-pocket | Copay plan: `V = min(n·a, S)`, `C = V × min(copay, a) / a`, `R = S − V`. HDHP or no copay: `V = 0`, `C = 0`, `R = S`. Then `D = min(R, ded)`, `CI = coinsurance × max(0, R − ded)`, `OOP = min(C + D + CI, oopMax)`. If `S < n·a`, `C` scales down proportionally. |
| F10 | FSA forfeit | `Ffor = max(0, F − OOP − (fsaCarryoverAllowed ? maxCarryover : 0))` |
| F11 | **Net after-tax cost** | `Net = P + OOP + Ffor − TSₚ − TSₐ − E` |
| F12 | HSA maximum | `Hmax = limit[limitTier] + (age ≥ 55 ? catchUp : 0) − E` |
| F13 | Spend to hit OOP max (for the chart range and High scenario) | `S* = V_full + ded + (oopMax − C_full − ded) / coinsurance`. If coinsurance is 0, the plan maxes out at `V_full + ded`. |
| F14 | Marginal combined rate (display only) | `m = T(X) − T(X + 1)` |

### 7.1 Break-even algorithm

1. For plans A and B, let `d(S) = Net_A(S) − Net_B(S)`, with `n` fixed at the Expected-scenario visit count.
2. `d` is piecewise linear in `S`: tax savings don't depend on `S`, and OOP and FSA forfeit are piecewise linear. The breakpoints for each plan are `n·a`, the point where the deductible is met, the point where OOP max is hit, and the point where OOP = `F − carryover`.
3. Sort the breakpoints in `[0, Smax]` and evaluate `d` at each one. In any segment where the sign changes, solve the line for `d = 0`. If `d = 0` across a whole segment, report a tie range.
4. Report every crossing (there can be more than one) and which plan is cheaper on each side. With no crossing, report "A is cheaper at every spend from $0 to $Smax, by at least $x."

### 7.2 "Why this plan wins"

For the winner W and runner-up R in a scenario, compute the term differences: after-tax premium (`P − TSₚ`), `OOP`, account tax savings, employer HSA, and FSA forfeit. Rank them by size. Fill a fixed template from the top two. Add the nearest break-even ("If your care costs more than $Y, R becomes cheaper"). No AI-generated text; the explanation is deterministic and testable.

---

## 8. Worked example (hand-calculated)

**Household:** tax year 2026 · Washington · Single · Employee only · `G` = $85,000 · `O` = `K` = 0 · age 40 · 26 pay periods · premiums pre-tax · HSA $2,000 (HDHP only) · FSA $0 · `a` = $150.

**SAMPLE plans (not real plans):**

| | Sample PPO | Sample HMO | Sample HDHP |
|---|---|---|---|
| Premium / paycheck (employee only) | $75 | $45 | $25 |
| Annual premium (× 26) | $1,950 | $1,170 | $650 |
| Deductible (individual) | $500 | $1,000 | $3,000 (≥ $1,700 HDHP minimum ✓) |
| Coinsurance | 20% | 20% | 20% |
| OOP max (individual) | $3,000 | $4,500 | $6,000 (≤ $8,500 HDHP maximum ✓) |
| Copay per visit | $25 | $20 | none (deductible first) |
| Employer HSA | none | none | $500 |

### Step 1: Baseline tax with no pre-tax deductions

- `TI = 85,000 − 16,100 = 68,900`. That is in the 22% bracket (over $50,400).
- `FIT = 5,800 + 22% × (68,900 − 50,400) = 5,800 + 4,070 = $9,870.00`
- `SS = 6.2% × 85,000 = $5,270.00` (under the $184,500 wage base)
- `Medicare = 1.45% × 85,000 = $1,232.50` (no Additional Medicare tax under $200,000)
- WA Paid Leave and WA Cares are charged on gross wages and are the same for every plan, so they are excluded from the comparison.

### Step 2: Tax savings

Every deduction below keeps taxable income above $50,400, so each dollar saves 22% + 6.2% + 1.45% = **29.65%**.

| | Amount | Federal income tax (22%) | Social Security (6.2%) | Medicare (1.45%) | Total savings |
|---|---|---|---|---|---|
| PPO premium | 1,950 | 429.00 | 120.90 | 28.275 | **578.175** |
| HMO premium | 1,170 | 257.40 | 72.54 | 16.965 | **346.905** |
| HDHP premium | 650 | 143.00 | 40.30 | 9.425 | **192.725** |
| HSA contribution | 2,000 | 440.00 | 124.00 | 29.00 | **593.00** |

For the HDHP, taxable income goes 68,900 → 68,250 after the premium, then → 66,250 after the HSA. Both stay in the 22% bracket.

### Step 3: Out-of-pocket (F9)

| Scenario | PPO | HMO | HDHP |
|---|---|---|---|
| **Low** (`S` = 300, `n` = 2) | `V`=300, `C` = 300×25/150 = 50, `R` = 0 → **50** | `C` = 300×20/150 = 40 → **40** | 300 toward deductible → **300** |
| **Expected** (`S` = 3,000, `n` = 4) | `V`=600, `C` = 100; `R` = 2,400 → 500 + 20%×1,900 = 880 → **980** | `C` = 80; `R` = 2,400 → 1,000 + 20%×1,400 = 1,280 → **1,360** | 3,000 all to deductible → **3,000** |
| **High** (OOP max) | **3,000** | **4,500** | **6,000** |

### Step 4: Net cost (F11)

`Net = P + OOP + Ffor − TSₚ − TSₐ − E`

| Scenario | Sample PPO | Sample HMO | Sample HDHP | Cheapest |
|---|---|---|---|---|
| Low | 1,950 + 50 − 578.175 = **$1,421.83** | 1,170 + 40 − 346.905 = **$863.10** | 650 + 300 − 192.725 − 593 − 500 = **−$335.73** | HDHP |
| Expected | 1,950 + 980 − 578.175 = **$2,351.83** | 1,170 + 1,360 − 346.905 = **$2,183.10** | 650 + 3,000 − 192.725 − 593 − 500 = **$2,364.28** | HMO |
| High | 1,950 + 3,000 − 578.175 = **$4,371.83** | 1,170 + 4,500 − 346.905 = **$5,323.10** | 650 + 6,000 − 192.725 − 593 − 500 = **$5,364.28** | PPO |

A negative net cost means the plan leaves you ahead: tax savings plus employer HSA money exceed premiums plus care. The UI will label it "net gain."

### Step 5: Break-even, HDHP vs. PPO

- Fixed part (before any care): PPO `1,950 − 578.175 = 1,371.825`; HDHP `650 − 192.725 − 593 − 500 = −635.725`. The HDHP starts **$2,007.55** ahead.
- For spending from $1,100 to $3,000: `OOP_HDHP = S`; `OOP_PPO = 100 + 500 + 20% × (S − 1,100) = 380 + 0.2S`.
- `d(S) = (−635.725 + S) − (1,371.825 + 380 + 0.2S) = 0.8S − 2,387.55 = 0` → **S = $2,984.44**
- Above $3,000 both plans pay 20% coinsurance, so the PPO stays $12.45 cheaper until it hits its OOP max at $13,100. After that the PPO's advantage grows, to $992.45 at $18,000 and above.

**All pairs:**

| Pair | Break-even spend | Below it | Above it |
|---|---|---|---|
| HDHP vs. PPO | **$2,984.44** | HDHP | PPO |
| HMO vs. HDHP | **$2,773.53** | HDHP | HMO |
| HMO vs. PPO | **$13,943.65** | HMO | PPO |

**Result:** under $2,774 of care the HDHP is cheapest; from $2,774 to $13,944 the HMO is; above $13,944 the PPO is.

**"Why this plan wins" (Expected):** *"The Sample HMO costs $169 less than the Sample PPO at $3,000 of care. Its premiums are $780 lower ($549 after tax savings), which outweighs $380 more in out-of-pocket costs. The Sample HDHP is $181 behind; if your care costs less than $2,774, the HDHP wins."*

**Cross-check:** an independent Python reference script reproduced every number in Steps 1–5 within $0.01. It found the break-evens by a $1-step scan plus bisection, not the segment method above. Stage 2's unit tests will hold the engine to these values within $1.

---

## 9. Planned unit tests (Stage 2)

| # | Case | Expected |
|---|---|---|
| T1 | Bracket transcription, 2026, all 4 statuses | derived base amounts = IRS-printed amounts |
| T2 | FIT at a bracket edge (Single TI = 50,400) | $5,800.00 |
| T3 | Income below the standard deduction (G = 15,000, Single 2026) | FIT = 0, premium FIT savings = 0, FICA savings still apply |
| T4 | Premium that crosses a bracket edge (Single TI = 51,000, P = 2,000) | FIT savings = 600×22% + 1,400×12% = $300 |
| T5 | Wages above the SS wage base (G = 220,000, P = 2,000, Single 2026) | SS savings 0; Medicare $29; Additional Medicare $18 |
| T6 | Wages straddling the SS wage base (G = 185,500, P = 2,000) | SS savings = 6.2% × 1,000 = $62 |
| T7 | Copay plan, `S` < `n·a` (proportional copays) | Low-scenario PPO OOP = $50 |
| T8 | OOP capped at OOP max | High scenario = OOP max |
| T9 | HDHP: no copays, deductible then coinsurance | Expected HDHP OOP = $3,000 |
| T10 | Family tier uses family deductible, OOP, and HSA limit | `Hmax` (family 2026) = 8,750 − E |
| T11 | HSA max with catch-up and employer money (age 56, self 2026, E = 500) | 4,400 + 1,000 − 500 = $4,900; $5,000 is rejected |
| T12 | FSA forfeit, with and without carryover | F = 1,500, OOP = 600 → 900 forfeited, or 220 with $680 carryover |
| T13 | Worked example: all 9 net costs | match §8 within $1 |
| T14 | **HDHP vs. PPO break-even** | $2,984.44 ± $1 |
| T15 | One plan cheaper everywhere | no crossing; "always cheaper" reported |
| T16 | Tie over an interval | reported as a range |
| T17 | Loader: year with a `null` value, or a param without a source | rejected with a clear error |
| T18 | WA payroll taxes | savings = $0 for every plan |

---

## 10. Planned stack (for Stages 2–3)

Vite + React + TypeScript + Tailwind CSS, Vitest for tests, Recharts for charts. No backend. One install and one start command: `npm install` then `npm run dev`.

---

## 11. Stage 1 self-check

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | ≥ 10 unit tests including HDHP-vs-PPO break-even | **Not applicable yet** (no code). 18 cases specified (§9), T14 is the break-even. | §9 |
| 2 | Hand calc matches engine within $1 | **Not applicable yet** (no engine). The hand calc matches an independent reference script within $0.01 and becomes the Stage 2 test oracle. | §8 |
| 3 | Every tax parameter has a year and a source | **Pass.** Each config file is keyed by `taxYear`. A script checked all 37 parameters in each file for `source`, `pinpoint`, and `userVerified`, and confirmed each source ID exists. Caveats: 12 values in 2027 are `null` awaiting the IRS; 3 statute citations (†) were not fetched. | config files |
| 4 | No income data leaves the browser | **Not applicable yet.** Designed for: no backend, no analytics, no storage, CSP `connect-src 'none'` (A19). | A19 |
| 5 | Runs with a single install and start command | **Not applicable yet.** Planned: `npm install`, `npm run dev`. | §10 |

---

## 12. Decisions

**2026-11-04: you replied "continue", so every recommended option below is accepted.** Stage 2 builds on them.

| # | Question | Options | Recommended |
|---|---|---|---|
| Q1 | Tax year. Open enrollment now is for 2027, but the IRS hasn't published 2027 brackets yet. | (a) Build on 2026 now; 2027 becomes selectable as soon as you fill its 12 nulls. (b) Allow a "2027 provisional" mode that uses 2026 brackets as a labeled stand-in. | **(a)**. Mixing years would break the "every value has a year and source" rule. |
| Q2 | Which states? | (a) WA + Custom flat rate. (b) Also full bracket tables for specific states (name them). | **(a)** for v1 |
| Q3 | Copay model | visit count × allowed cost per visit (A11, A13) | **Accept** |
| Q4 | HSA contribution left blank | (a) $0, plus a callout showing what the max would save. (b) Fund the HDHP's expected out-of-pocket cost. (c) Fund the maximum. | **(a)**. It doesn't flatter the HDHP; you choose. |
| Q5 | Family spending | (a) Pooled against family limits (conservative). (b) Add a Stage 4 toggle, "most spending by one person," that applies embedded individual limits. | **(a) now, (b) in Stage 4** |
| Q6 | Low-use default | $300 with 2 visits, or $0 | **$300 / 2 visits** |
| Q7 | MFJ: treat "other household income" as spouse wages for the $250k Additional Medicare threshold? | yes / no (add a separate spouse-wages field) | **Yes**. It only matters above $200k. |

---

## 13. Stage 4 changes (hardening)

| Area | Change |
|---|---|
| Validation | `src/engine/validate.ts`. **Blocking** problems (NaN, negative dollars, coinsurance over 100%, age outside 0–120, unknown state or pay frequency, no plans) make `compare()` throw `InputError` with plain-language messages instead of returning wrong numbers. **Advisory** issues (Problem / Check / Note) show next to the results and under the plan table. |
| Income below the standard deduction | Note: no federal income tax either way; Social Security and Medicare savings remain; credits such as the EITC are not modeled. $0 wages: warning, no tax savings. Pre-tax money above wages: error on that plan. |
| HSA catch-up at 55+ | Note at 55+ (the $1,000 is in the maximum; a spouse needs their own HSA for theirs). At 65+: warning that Medicare enrollment ends HSA contributions (IRS Pub. 969). |
| Family vs. individual limits | The IRS HDHP test now uses the column for the employee's own coverage tier. Family coverage with an **embedded** individual deductible below the family HDHP minimum fails (Pub. 969). New plan field `familyDeductible: 'embedded' \| 'aggregate'`. New household option `familySpend: 'pooled' \| 'onePerson'` (Q5b): one-person spending uses the per-person deductible (embedded) or the family deductible (aggregate), and the individual OOP max. The FSA limit stays per employee. Married filers with family HDHP coverage get a note that the family HSA limit is shared (MFS: split). |
| Plan sanity | Deductible above the OOP max (error); family amounts below individual; copay above the visit cost; coinsurance over 50%; duplicate or missing names; empty plan. |
| A12 (updated) | Pooled family spending stays the default. "Mostly one person" is the alternative. Assumption: the plan's individual OOP max is the per-person cap inside family coverage. |
| Accessibility | axe-core: 0 violations in a real browser (light and dark, every panel open, color contrast included) and in the jsdom app test. The chart's SVG carries its own title/description and supports arrow keys. A debounced polite live region announces the cheapest plan. Warnings use an icon and a word, not only color. |
| Tests | 90 (was 66), including a 300-case seeded random-input test and whole-app tests. |
| Build | The chart library is lazy-loaded as its own chunk (main 323 kB, chart 377 kB). |

---

## 14. After v1: 2027 values and the HSA simulator

| Area | Change |
|---|---|
| 2027 tax values | Filled from Rev. Proc. 2026-35 (brackets §3.01, standard deduction §3.15, FSA §3.16): single standard deduction $16,600, FSA limit $3,500, carryover $700. 2027 is now the default year. The copy read still shows "[Release Date, 2026]" placeholders in its Section 1, so recheck it against the Internal Revenue Bulletin version. |
| Why it mattered | The MultiCare template holds 2027 plans. Under 2026 values the HSA room was $4,400 − $800 = $3,600. Under 2027 values it is $4,500 − $800 = $3,700, matching the guide's page 18. The template now selects tax year 2027. |
| HSA simulator | `src/engine/hsaSim.ts`. For one HSA plan and scenario: limits, net cost at $0 / current / max, tax saved, take-home change, `hsaAfterCare = H + E − OOP`, and the smallest contribution that makes the plan cheapest (bisection on net cost). It runs through `buildPlanContext`, so it can't drift from the main results. |
| HSA math trace | The Show math step now prints the cap: `min(your amount, IRS limit + catch-up − employer HSA)`. |
| Removed | `hsaHints` (the "no HSA contribution" callout). The simulator replaces it. |
| Contrast fix | Plan names on the break-even bar now sit on a light chip. White text on the series colors was below 4.5:1 (axe). |
