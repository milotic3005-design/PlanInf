/**
 * HSA and health-FSA rules (SPEC A3–A5, A14, F10, F12).
 */
import type { CoverageTier, Household, Issue, LimitTier, Plan, ResolvedTaxConfig } from './types';
import { limitTierFor } from './types';
import { fmtMoney } from './money';

/**
 * Checks a plan marked HSA-eligible against the year's IRS HDHP limits for the
 * coverage the employee is buying (HSA eligibility depends on your own
 * coverage): the self-only column for employee-only, the family column for any
 * other tier. A family plan with an embedded individual deductible below the
 * family minimum also fails (IRS Pub. 969). Any 'error' turns HSA contributions
 * and employer HSA money off for that plan, so an invalid HSA can't make a plan
 * look cheaper (SPEC A4).
 */
export function hdhpIssues(plan: Plan, cfg: ResolvedTaxConfig, tier: CoverageTier): Issue[] {
  if (!plan.hsaEligible) {
    const er = plan.employerHsa.selfOnly + plan.employerHsa.family;
    return er > 0
      ? [{ severity: 'warning', code: 'EMPLOYER_HSA_ON_NON_HSA_PLAN', planId: plan.id, message: `${plan.name} isn't marked HSA-eligible, so its employer HSA amount is ignored.` }]
      : [];
  }
  const issues: Issue[] = [];
  const cols: Array<[LimitTier, 'individual' | 'family', string]> =
    tier === 'self' ? [['selfOnly', 'individual', 'self-only']] : [['family', 'family', 'family']];
  if (tier !== 'self' && plan.familyDeductible !== 'aggregate' && plan.deductible.individual < cfg.hsa.hdhpMinDeductible.family) {
    issues.push({
      severity: 'error',
      code: 'HDHP_EMBEDDED_DEDUCTIBLE_TOO_LOW',
      planId: plan.id,
      message: `${plan.name}: with family coverage, an embedded individual deductible of ${fmtMoney(plan.deductible.individual)} is below the ${cfg.taxYear} family HDHP minimum of ${fmtMoney(cfg.hsa.hdhpMinDeductible.family)}, so the plan can't be paired with an HSA. If the family deductible is aggregate (the whole family amount must be met first), set it to aggregate in the plan table.`,
    });
  }
  for (const [lt, col, label] of cols) {
    const minDed = cfg.hsa.hdhpMinDeductible[lt];
    const maxOop = cfg.hsa.hdhpMaxOutOfPocket[lt];
    if (plan.deductible[col] < minDed) {
      issues.push({
        severity: 'error',
        code: 'HDHP_DEDUCTIBLE_TOO_LOW',
        planId: plan.id,
        message: `${plan.name}: the ${label} deductible ${fmtMoney(plan.deductible[col])} is below the ${cfg.taxYear} HDHP minimum of ${fmtMoney(minDed)}, so it can't be paired with an HSA. HSA amounts are ignored for this plan.`,
      });
    }
    if (plan.oopMax[col] > maxOop) {
      issues.push({
        severity: 'error',
        code: 'HDHP_OOP_TOO_HIGH',
        planId: plan.id,
        message: `${plan.name}: the ${label} out-of-pocket max ${fmtMoney(plan.oopMax[col])} is above the ${cfg.taxYear} HDHP maximum of ${fmtMoney(maxOop)}, so it can't be paired with an HSA. HSA amounts are ignored for this plan.`,
      });
    }
  }
  if (plan.copayPerVisit !== null) {
    issues.push({
      severity: 'warning',
      code: 'HDHP_PRE_DEDUCTIBLE_COPAY',
      planId: plan.id,
      message: `${plan.name} is marked HSA-eligible but has a copay before the deductible. HDHPs generally can't cover non-preventive care before the deductible. Check the plan documents.`,
    });
  }
  return issues;
}

/** True if the plan may be paired with an HSA (claimed eligible and passes the IRS tests). */
export function hsaAllowed(plan: Plan, cfg: ResolvedTaxConfig, tier: CoverageTier): boolean {
  return plan.hsaEligible && !hdhpIssues(plan, cfg, tier).some((i) => i.severity === 'error');
}

/** Employer HSA contribution for the employee's tier (0 when HSA isn't allowed). */
export function employerHsaFor(plan: Plan, tier: CoverageTier, cfg: ResolvedTaxConfig): number {
  return hsaAllowed(plan, cfg, tier) ? plan.employerHsa[limitTierFor(tier)] : 0;
}

/**
 * F12: the most the employee may contribute.
 * Annual limit + catch-up (55+) − employer contribution, never below 0.
 * Employer money counts toward the limit (26 U.S.C. 223(b)(4)(B)).
 */
export function hsaMaxEmployee(cfg: ResolvedTaxConfig, limitTier: LimitTier, age: number, employerContribution: number): number {
  const limit = cfg.hsa.contributionLimit[limitTier] + (age >= 55 ? cfg.hsa.catchUpAge55 : 0);
  return Math.max(0, limit - employerContribution);
}

/** Employee HSA amount actually used for a plan, capped at that plan's maximum. Adds a warning if capped. */
export function effectiveHsa(plan: Plan, h: Household, cfg: ResolvedTaxConfig, issues: Issue[]): number {
  if (!hsaAllowed(plan, cfg, h.coverageTier) || h.hsaContribution <= 0) return 0;
  const employer = employerHsaFor(plan, h.coverageTier, cfg);
  const max = hsaMaxEmployee(cfg, limitTierFor(h.coverageTier), h.age, employer);
  if (h.hsaContribution > max) {
    issues.push({
      severity: 'warning',
      code: 'HSA_OVER_LIMIT',
      planId: plan.id,
      message: `Your HSA amount ${fmtMoney(h.hsaContribution)} is over the ${cfg.taxYear} limit for ${plan.name} (${fmtMoney(max)} after the employer's ${fmtMoney(employer)}). We used ${fmtMoney(max)}.`,
    });
    return max;
  }
  return h.hsaContribution;
}

/** Health FSA election actually used (non-HSA plans only), capped at the IRS limit. */
export function effectiveFsa(plan: Plan, h: Household, cfg: ResolvedTaxConfig, issues: Issue[]): number {
  if (hsaAllowed(plan, cfg, h.coverageTier) || h.fsaContribution <= 0) return 0;
  const limit = cfg.healthFsa.salaryReductionLimit;
  if (h.fsaContribution > limit) {
    issues.push({
      severity: 'warning',
      code: 'FSA_OVER_LIMIT',
      planId: plan.id,
      message: `Your FSA amount ${fmtMoney(h.fsaContribution)} is over the ${cfg.taxYear} limit of ${fmtMoney(limit)}. We used ${fmtMoney(limit)}.`,
    });
    return limit;
  }
  return h.fsaContribution;
}

/** F10: FSA money not used for this year's care and not carried over is lost. */
export function fsaForfeit(election: number, oop: number, carryover: number): number {
  return Math.max(0, election - oop - carryover);
}
