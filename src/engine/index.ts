/** Public API of the calculation engine. Pure functions only: no DOM, no network, no storage. */
export * from './types';
export { resolveTaxConfig, TaxConfigError, unverifiedParams, refsFor } from './config';
export { bracketTax, derivedBaseAmounts, marginalRate } from './federal';
export { computeTaxes, taxSaved, standardDeductionFor, NO_PRE_TAX, type PreTaxAmounts, type TaxDetail } from './taxes';
export { costShareFor, outOfPocket, outOfPocketAtMax, spendToReachOop, oopKinks, type CostShare } from './oop';
export { hdhpIssues, hsaAllowed, hsaMaxEmployee, effectiveHsa, effectiveFsa, employerHsaFor, fsaForfeit } from './accounts';
export { buildPlanContext, evaluateScenario, netCostAt, scenarioCost, type PlanContext } from './netCost';
export { breakEven, chartMaxSpend, costCurve, netCostKinks } from './breakeven';
export { compare, buildScenarios, LOW_USE_DEFAULT, type CompareInput } from './compare';
export { roundCents, fmtMoney, fmtPct } from './money';
export { combinedCurve, cheapestBySpend } from './breakeven';
export { explainScenario, type Explanation } from './explain';
export { fmtMoney0 } from './money';
export { blockingProblems, inputIssues, InputError } from './validate';
export { simulateHsa, type HsaSimulation, type HsaSnapshot } from './hsaSim';
