# Health Plan Chooser

> **Estimates for education only; not tax or medical advice.**

A web app that compares employer-sponsored medical plans (PPO, HMO, HDHP with HSA) by **net after-tax annual cost**:

```
Net cost = premiums + out-of-pocket care + forfeited FSA money − tax savings − employer HSA money
```

You enter your wages, filing status, state, coverage tier, and expected medical spending. The app ranks your employer's plans for low, expected, and high use, draws each plan's cost as spending rises, finds the break-even points between plans, and explains in plain words why the cheapest plan wins. Every number has a **Show math** panel that lists the formula, the values filled in, and each tax parameter used, with its source.

All math runs in your browser. Nothing you type is sent anywhere or saved.

---

## Quick start

Requires **Node.js 22.12+ or 24+** (`node -v`). The test runner needs it; the app itself runs on Node 20.19+.

```bash
npm install
```

```bash
npm start
```

Open <http://localhost:5186>. Port 5186 is fixed (`strictPort`). If something else is using it, change `server.port` in [`vite.config.ts`](vite.config.ts).

The form starts with example values and three made-up plans labeled **SAMPLE DATA**. Replace them with your own numbers. **Load the spec's worked example** sets the exact inputs from [`docs/SPEC.md` §8](docs/SPEC.md), so you can check the app against the hand calculation.

## Scripts

| Command | What it does |
|---|---|
| `npm start` (same as `npm run dev`) | Development server with hot reload at port 5186 |
| `npm test` | All unit and app tests (Vitest), about 2 seconds |
| `npm run typecheck` | TypeScript strict check |
| `npm run build` | Typecheck, then production build to `dist/` |
| `npm run preview` | Serve the production build at port 5187 |

---

## Privacy: how "nothing leaves the browser" is enforced

1. **No backend, no analytics, no storage.** The code never calls `fetch`, XHR, WebSocket, `sendBeacon`, `localStorage`, `sessionStorage`, IndexedDB, or cookies. Reloading the page clears everything.
2. **A Content-Security-Policy blocks the network anyway.** The production build carries this policy in a `<meta>` tag (added by the `privacy-csp` plugin in [`vite.config.ts`](vite.config.ts)):

   ```
   default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:;
   font-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'
   ```

   `connect-src 'none'` means the browser refuses every outgoing connection the page tries to open, even one added by a future dependency. Fonts are bundled with the app, so there is no font CDN.
3. **The dev server is slightly looser.** It must allow its own hot-reload WebSocket and React's inline refresh script, so in `npm start` only those two directives are relaxed, and only to localhost. Check privacy against `npm run build` and `npm run preview`.

**Check it yourself.** Run `npm run build` and `npm run preview`, open <http://localhost:5187>, and paste this into the browser console:

```js
fetch('https://example.com').then(() => 'ALLOWED', () => 'BLOCKED')
```

It returns `BLOCKED`, and the console shows a `connect-src 'none'` violation. The Network tab lists only the app's own files.

The one way data could leave is if you click a source link in a math panel. That opens the IRS or state page in a new tab with `rel="noreferrer"` and no data in the URL.

---

## Tax data

All tax parameters live in one editable file per year:

```
src/config/tax-years/2026.json   complete
src/config/tax-years/2027.json   complete: the default year (Rev. Proc. 2026-35 and 2026-24)
```

Every parameter looks like this:

```json
"single": { "value": 16100, "source": "irs-rp-2025-32", "pinpoint": "Sec. 4.14(1)", "userVerified": false }
```

- `source` must be a key in the file's `sources` list, which holds the title, URL, retrieval date, and how the value was checked.
- `pinpoint` is the section, table, or quote inside the source.
- `userVerified` starts `false`. **Check each value against its source yourself, then set it to `true`.** The app counts unverified values in the header and marks each one "unverified" in the math panels.

**The loader refuses a year with any problem.** If any value is `null` (unpublished), has no listed source, has no pinpoint, has the wrong type, or has a bracket table whose computed "$N plus" base amounts don't match the IRS-printed ones (a transcription typo), the whole year shows as unavailable in the tax-year menu, with the reasons listed under **Tax values used**.

### Adding the next tax year

1. Copy the newest file to `<year>.json` and add it to [`src/config/index.ts`](src/config/index.ts).
2. Find that year's inflation-adjustment Revenue Procedure in the [IRS newsroom](https://www.irs.gov/newsroom). It usually appears in October or November; HSA limits come earlier, in their own Rev. Proc. Update:
   - the standard deduction for each filing status, and the age 65/blind add-on;
   - the four bracket tables, including `printedBaseAmounts` (the "$N plus" figures exactly as printed);
   - the health FSA limit and carryover, the HSA and HDHP limits, the Social Security wage base, and the state payroll rates.

   Point each one at a `sources` entry and set its `pinpoint` and `userVerified: false`.
3. Run `npm test`. The loader re-checks the transcription. Then set `userVerified: true` on each value you checked.
4. The app defaults to the newest complete year.

For 2027, the Social Security wage base still cites the draft Pub 15 ($192,300). Replace it with the final edition or SSA's page when you verify it.

### Adding a state

v1 ships Washington plus an **"Another state"** option where you enter a flat marginal rate and say whether the state taxes HSA contributions. A state with wage income tax brackets needs a new `incomeTax` type in the engine (`src/engine/config.ts` and `taxes.ts`); the loader rejects anything but `"none"` today. A no-income-tax state can be added to `states` with only its payroll taxes, each with `reducedBySection125` and a source.

---

## HSA simulator

The **HSA simulator** section has a per-paycheck slider that sets your HSA contribution for the whole page: rankings, chart, and break-even points all follow it. Beside the slider it shows, for the chosen scenario, what changes compared with contributing nothing: net cost, tax saved, take-home pay per paycheck, and the HSA balance left after this year's care. It also shows the contribution at which the plan becomes cheapest.

Your contribution is not a cost, because the money stays yours. Only the tax it saves lowers net cost. The maximum is the IRS limit, plus the catch-up at 55+, minus employer money.

## MultiCare template

**Load MultiCare 2027 plans** in Your plans fills in the three medical plans from the 2027 benefits guide (pages 10, 16, 18, 19) for full-time or part-time status, and sets 24 paychecks and tax year 2027. The app lists what its model simplifies after loading. The numbers are in [`src/data/multicare2027.ts`](src/data/multicare2027.ts).

## How the math works (short version)

Full spec with formulas F1–F14 and a hand-worked example: [`docs/SPEC.md`](docs/SPEC.md).

- **Tax savings are exact.** The engine computes your full tax with and without each pre-tax amount and takes the difference: federal income tax, Social Security up to the wage base, Medicare, Additional Medicare, and state. That stays right when a deduction crosses a bracket edge or the Social Security wage base. The marginal rate appears in the math panel only to help you follow along.
- **Washington:** no state income tax. WA Paid Leave and WA Cares premiums are charged on gross wages, so plan choice does not change them.
- **Out-of-pocket:** copay services (visits × allowed cost per visit) cost a flat copay on copay plans. Everything else goes through the deductible, then coinsurance, capped at the out-of-pocket max. On an HDHP everything goes through the deductible.
- **Break-even:** net cost is piecewise linear in spending, so the engine evaluates it at every kink and solves each line exactly. No guessing or search.

## Assumptions and limits

- One W-2 employee, a calendar-year plan, in-network care, the standard deduction, and no tax credits (EITC, Child Tax Credit, premium tax credit). See the full list in SPEC §2.
- Premiums, HSA, and FSA go through payroll under Section 125 (toggle under **More options** if your premiums are post-tax).
- **Family coverage:** by default, everyone's spending counts against the family deductible and out-of-pocket max, which errs on the high side. Choose **"Mostly one person"** to use per-person limits instead: the embedded or aggregate deductible (set per plan) and the individual out-of-pocket max.
- **HSA:** limits include employer money and the 55+ catch-up. At 65+ the app warns that Medicare enrollment ends HSA contributions. A plan marked HSA-eligible that fails the IRS HDHP test for your tier gets no HSA in the math.
- Pre-tax deductions slightly lower future Social Security benefits. That is not counted.

## Testing

`npm test` runs 90 tests:

| Area | What is covered |
|---|---|
| Tax config | Each 2026 value has a source; bracket transcription is checked against IRS-printed amounts; a year with null values is refused; bad sources and out-of-range rates are rejected |
| Taxes | Bracket edges, deductions that cross brackets, the Social Security wage base and straddling it, Additional Medicare (MFJ), income below the standard deduction, custom states, WA payroll taxes |
| Out-of-pocket | Copays, deductible, coinsurance, the cap, 0% coinsurance, family vs. individual, one-person family spending |
| Accounts | HSA limits with employer money, the catch-up exactly at 55, the IRS HDHP test per tier, the embedded-deductible rule, FSA limit and forfeit |
| HSA simulator | Hand-checked MultiCare numbers: limits by tier, age, and status; tax saved, take-home change, HSA balance after care; agreement with the main comparison; the contribution needed to become cheapest |
| Worked example | All 9 net costs match the hand calculation to the cent; the three break-evens ($2,984.44, $2,773.53, $13,943.65) |
| Break-even | No crossing, tie ranges, multiple crossings, the FSA-forfeit kink |
| Validation | Blocking errors (NaN, negative, out-of-range) and every warning code |
| Robustness | 300 seeded random households and plan sets: results are always finite, rankings sorted, crossings in range |
| App (jsdom) | No axe-core accessibility violations with every panel open; every input labeled; worked example on screen; bad input handling; warnings; no network calls or storage |

**Color contrast** can't be measured in jsdom, so it was checked with axe-core in a real browser, in light and dark mode, with every panel open: 0 violations. To repeat that check, run `npm start`, open the page, and paste into the console:

```js
await new Promise(r => { const s = document.createElement('script'); s.src = '/node_modules/axe-core/axe.min.js'; s.onload = r; document.head.appendChild(s); });
document.querySelectorAll('button[aria-expanded="false"]').forEach(b => b.click());
(await axe.run()).violations
```

## Accessibility

- Every input has a visible label; errors are announced (`role="alert"`, `aria-invalid`).
- A skip link, landmarks, one `h1` and a heading per section, and table headers with scope.
- A short screen-reader announcement of the cheapest plan after you stop typing, not on every keystroke.
- Charts:
  - colors come from a colorblind-safe palette validated for light and dark mode;
  - identity never relies on color alone (legend, labels, and "✓ lowest" text);
  - the line chart supports arrow-key navigation, and every chart has a table view.
- Warnings carry an icon and a word ("Problem", "Check", "Note") as well as a color.
- Respects `prefers-reduced-motion` and `prefers-color-scheme`.

---

## Deploying

The app is a static site. `npm run build` writes everything to `dist/`; any static host can serve it. No server code or environment variables are needed.

**Also send the CSP as an HTTP header.** The `<meta>` tag is already in the build, but a header is stronger and can add `frame-ancestors`, which a meta tag can't. Use this value:

```
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'
```

### Netlify

Build command `npm run build`, publish directory `dist`. To send the header, create `public/_headers` (Vite copies it into `dist/`):

```
/*
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'
  Referrer-Policy: no-referrer
  X-Content-Type-Options: nosniff
```

### Vercel

Import the repository; Vercel detects Vite (build `npm run build`, output `dist`). For the header, add `vercel.json` at the project root:

```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Content-Security-Policy", "value": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'" },
        { "key": "Referrer-Policy", "value": "no-referrer" },
        { "key": "X-Content-Type-Options", "value": "nosniff" }
      ]
    }
  ]
}
```

Vercel Web Analytics and Speed Insights must stay off. They would be blocked by `connect-src 'none'` anyway.

### GitHub Pages (or any sub-path)

If the site is served under `https://<user>.github.io/<repo>/`, build with that base path:

```bash
npx vite build --base=/<repo>/
```

Then publish `dist/` (for example with the `actions/deploy-pages` workflow). GitHub Pages can't set custom headers, so the `<meta>` CSP is what applies there.

---

## Project layout

```
docs/SPEC.md                    Stage 1 spec: inputs, outputs, formulas, worked example, decisions
src/config/tax-years/*.json     Tax parameters, one file per year, every value sourced
src/config/index.ts             Tax-year registry (add new years here)
src/engine/                     Pure calculation library: no DOM, network, or storage
  config.ts                       Loads and validates a tax-year file
  taxes.ts, federal.ts            Federal income tax, FICA, state tax; exact before/after savings
  oop.ts                          Out-of-pocket model (copays, deductible, coinsurance, cap, family)
  accounts.ts                     HSA/FSA limits, IRS HDHP test, FSA forfeit
  netCost.ts                      Net cost per plan and scenario, plus the show-math trace
  breakeven.ts                    Exact break-even solver, cheapest-plan strip, chart curve
  explain.ts                      "Why this plan wins" text (deterministic, no AI)
  validate.ts                     Blocking input errors and edge-case warnings
  compare.ts                      Entry point: all plans × scenarios
  __tests__/                      Engine tests
src/data/samplePlans.ts         The three SAMPLE plans
src/ui/                         React components (form, plan sheet, results, chart, break-even, math panel)
src/ui/__tests__/               UI helper and whole-app tests (jsdom + axe-core)
vite.config.ts                  Build config and the privacy CSP plugin
```

> **Estimates for education only; not tax or medical advice.** Verify every tax value against its source before relying on the results, and confirm plan details with your plan's Summary of Benefits and Coverage.
