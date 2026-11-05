/**
 * SAMPLE DATA: three made-up plans for the demo and the worked example
 * (docs/SPEC.md §8). They are not any real employer's plans. Replace them
 * with the numbers from your own benefits guide.
 */
import type { Plan } from '../engine/types';

export const SAMPLE_PLANS: Plan[] = [
  {
    id: 'sample-ppo',
    name: 'Sample PPO',
    kind: 'PPO',
    isSample: true,
    hsaEligible: false,
    premiumPerPaycheck: { self: 75, selfSpouse: 165, selfChildren: 140, family: 230 },
    deductible: { individual: 500, family: 1000 },
    familyDeductible: 'embedded',
    oopMax: { individual: 3000, family: 6000 },
    coinsurance: 0.2,
    copayPerVisit: 25,
    employerHsa: { selfOnly: 0, family: 0 },
  },
  {
    id: 'sample-hmo',
    name: 'Sample HMO',
    kind: 'HMO',
    isSample: true,
    hsaEligible: false,
    premiumPerPaycheck: { self: 45, selfSpouse: 100, selfChildren: 85, family: 140 },
    deductible: { individual: 1000, family: 2000 },
    familyDeductible: 'embedded',
    oopMax: { individual: 4500, family: 9000 },
    coinsurance: 0.2,
    copayPerVisit: 20,
    employerHsa: { selfOnly: 0, family: 0 },
  },
  {
    id: 'sample-hdhp',
    name: 'Sample HDHP',
    kind: 'HDHP',
    isSample: true,
    hsaEligible: true,
    premiumPerPaycheck: { self: 25, selfSpouse: 60, selfChildren: 50, family: 90 },
    deductible: { individual: 3000, family: 6000 },
    familyDeductible: 'aggregate', // an embedded $3,000 would be below the family HDHP minimum
    oopMax: { individual: 6000, family: 12000 },
    coinsurance: 0.2,
    copayPerVisit: null,
    employerHsa: { selfOnly: 500, family: 1000 },
  },
];
