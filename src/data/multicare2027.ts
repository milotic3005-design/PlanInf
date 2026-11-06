/**
 * Template: MultiCare 2027 Benefits Guide (file "MultiCare-2027-Benefits-Guide-10.07.26.pdf").
 *
 *   p. 10  Medical plan comparison (First Choice Health): deductibles,
 *          out-of-pocket maximums, copays, coinsurance.
 *   p. 16  Your cost for coverage: MONTHLY payroll deductions, "split evenly
 *          over the first two paychecks of each month" (so 24 deductions a year).
 *   p. 18  MultiCare's 2027 HSA contribution (full-time / part-time).
 *   p. 19  Health Care FSA: up to $3,400, rollover up to $680.
 *
 * Every number below is copied from those pages. In-network = the MultiCare
 * Preferred Network column. See TEMPLATE_NOTES for what the app's model simplifies.
 */
import type { CoverageTier, Plan } from '../engine/types';

export type EmploymentStatus = 'fullTime' | 'partTime';

export const MULTICARE_2027 = {
  id: 'multicare-2027',
  title: 'MultiCare 2027 benefits guide',
  sourceNote: 'MultiCare 2027 guide',
  /** These are 2027 plans, so they use 2027 tax values and HSA limits. */
  taxYear: 2027,
  /** p. 16: deducted over the first two paychecks of each month. */
  payPeriodsPerYear: 24 as const,
  /** p. 19: the Health Care FSA allows a rollover (up to $680). */
  fsaCarryoverAllowed: true,
  statuses: {
    fullTime: 'Full-time (.75+ FTE)',
    partTime: 'Part-time (.5 to .74 FTE)',
  } satisfies Record<EmploymentStatus, string>,
};

/** p. 16 monthly premiums: employee only, + spouse/DP, + child(ren), family. */
const MONTHLY: Record<EmploymentStatus, Record<'myConnected' | 'standardPpo' | 'hdhp', Record<CoverageTier, number>>> = {
  fullTime: {
    myConnected: { self: 99, selfSpouse: 280, selfChildren: 230, family: 320 },
    standardPpo: { self: 258, selfSpouse: 508, selfChildren: 406, family: 626 },
    hdhp: { self: 148, selfSpouse: 302, selfChildren: 248, family: 358 },
  },
  partTime: {
    myConnected: { self: 192, selfSpouse: 458, selfChildren: 421, family: 716 },
    standardPpo: { self: 305, selfSpouse: 584, selfChildren: 469, family: 716 },
    hdhp: { self: 212, selfSpouse: 377, selfChildren: 312, family: 445 },
  },
};

/** p. 18: MultiCare's 2027 HSA contribution (executives receive none). */
const EMPLOYER_HSA: Record<EmploymentStatus, { selfOnly: number; family: number }> = {
  fullTime: { selfOnly: 800, family: 1600 },
  partTime: { selfOnly: 400, family: 800 },
};

/** Monthly rate → per-paycheck amount at 24 deductions a year. */
const perPaycheck = (m: Record<CoverageTier, number>): Record<CoverageTier, number> => ({
  self: m.self / 2,
  selfSpouse: m.selfSpouse / 2,
  selfChildren: m.selfChildren / 2,
  family: m.family / 2,
});

export function multicare2027Plans(status: EmploymentStatus): Plan[] {
  const m = MONTHLY[status];
  const common = { isSample: false, sourceNote: MULTICARE_2027.sourceNote };
  return [
    {
      ...common,
      id: 'mc-myconnected',
      name: 'MyConnected Care',
      kind: 'PPO', // label only: a tiered-network plan (Preferred + Extended networks)
      hsaEligible: false,
      premiumPerPaycheck: perPaycheck(m.myConnected),
      // p. 10, Preferred Network: the deductible ($500/person, $1,000 family) applies to ER only,
      // so ordinary care has no deductible: copays, then 10% for hospital care.
      deductible: { individual: 0, family: 0 },
      familyDeductible: 'embedded',
      oopMax: { individual: 3000, family: 6000 },
      coinsurance: 0.1,
      copayPerVisit: 20, // primary care (specialty $35, mental health $25, urgent care $25)
      employerHsa: { selfOnly: 0, family: 0 },
    },
    {
      ...common,
      id: 'mc-standard-ppo',
      name: 'Standard PPO',
      kind: 'PPO',
      hsaEligible: false,
      premiumPerPaycheck: perPaycheck(m.standardPpo),
      deductible: { individual: 750, family: 1500 }, // "$1,500 if covering dependents"
      familyDeductible: 'embedded', // not stated in the guide; check the plan's SBC
      oopMax: { individual: 4000, family: 8000 },
      coinsurance: 0.2, // outpatient & inpatient hospital, after deductible
      copayPerVisit: 35, // primary care (specialty $50, mental health $50, urgent care $40)
      employerHsa: { selfOnly: 0, family: 0 },
    },
    {
      ...common,
      id: 'mc-hdhp',
      name: 'High Deductible PPO',
      kind: 'HDHP',
      hsaEligible: true,
      premiumPerPaycheck: perPaycheck(m.hdhp),
      deductible: { individual: 1750, family: 3500 }, // pp. 10, 12: both networks
      // Not stated in the guide. An embedded $1,750 would be below the IRS family HDHP
      // minimum, so the HSA-eligible plan's family deductible must work as aggregate.
      familyDeductible: 'aggregate',
      oopMax: { individual: 3500, family: 7000 },
      coinsurance: 0.1, // Preferred Network, after deductible (Extended Network 30%)
      copayPerVisit: null, // "no fixed copays" (p. 12)
      employerHsa: EMPLOYER_HSA[status],
    },
  ];
}

/** What the app's model simplifies for these plans. Shown under the plan table after loading. */
export const MULTICARE_2027_NOTES = [
  'In-network numbers use the MultiCare Preferred Network column. Extended Network care costs more (50% for MyConnected Care, 30% for the High Deductible PPO).',
  'Monthly premiums from page 16 are split over 24 paychecks, the way MultiCare deducts them, so each paycheck shows half the monthly rate.',
  "MyConnected Care's deductible applies to ER visits only, so it is entered as $0 for ordinary care. ER copays ($250 to $500) and the ER deductible aren't modeled.",
  'Copay per visit uses the primary care copay. Specialty, mental health, and urgent care copays are higher on some plans. Raise the copay if most of your visits are specialty.',
  'The guide caps the Health Care FSA at $3,400 with a $680 rollover. It was printed before the IRS set the 2027 limits ($3,500 and $700), so the app allows the IRS amounts. Stay within the guide unless MultiCare updates it.',
  "Prescription drug costs, the executive surcharge (+$50/+$100 a month, and no MultiCare HSA money), and the Premium Assistance Program ($5/$15 a month for qualifying MyConnected Care members) aren't included. Edit the premiums if they apply to you.",
  "Domestic partner coverage is after-tax unless your partner is your tax dependent. If so, turn off pre-tax premiums under More options.",
  'Whether family deductibles are embedded or aggregate isn’t stated in the guide. The Standard PPO is set to embedded; the High Deductible PPO must be aggregate to stay HSA-eligible. Check each plan’s Summary of Benefits and Coverage.',
] as const;
