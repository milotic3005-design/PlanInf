/**
 * "Why this plan wins": deterministic plain-language explanation (SPEC §7.2).
 * No AI-generated text. Every sentence comes from the numbers in a ComparisonResult.
 */
import type { ComparisonResult, Plan, PlanScenarioResult, Scenario } from './types';
import { fmtMoney0 } from './money';

export interface Explanation {
  winnerId: string | null;
  headline: string;
  sentences: string[];
}

/** Differences under $1 are left out of the explanation. */
const MIN_DIFF = 1;

interface Term {
  /** Contribution to (winner net − runner-up net). Negative = helps the winner. */
  contrib: number;
  advantage: string;
  disadvantage: string;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const join = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

function terms(w: PlanScenarioResult, r: PlanScenarioResult): Term[] {
  const rawPremium = Math.abs(w.annualPremium - r.annualPremium);
  const afterTax = (w.annualPremium - w.premiumTaxSavings.total) - (r.annualPremium - r.premiumTaxSavings.total);
  const paren = Math.abs(rawPremium - Math.abs(afterTax)) >= MIN_DIFF ? ` (${fmtMoney0(Math.abs(afterTax))} after tax savings)` : '';
  const acctW = w.account ?? r.account ?? 'HSA';
  const acctR = r.account ?? w.account ?? 'HSA';
  const acctDiff = Math.abs(w.accountTaxSavings.total - r.accountTaxSavings.total);
  const erDiff = Math.abs(w.employerHsa - r.employerHsa);
  const oopDiff = Math.abs(w.outOfPocket - r.outOfPocket);
  const forfeitDiff = Math.abs(w.fsaForfeit - r.fsaForfeit);
  return [
    { contrib: afterTax, advantage: `its premiums are ${fmtMoney0(rawPremium)} lower${paren}`, disadvantage: `${fmtMoney0(rawPremium)} more in premiums${paren}` },
    { contrib: w.outOfPocket - r.outOfPocket, advantage: `you'd pay ${fmtMoney0(oopDiff)} less out of pocket`, disadvantage: `${fmtMoney0(oopDiff)} more in out-of-pocket costs` },
    {
      contrib: -(w.accountTaxSavings.total - r.accountTaxSavings.total),
      advantage: `its ${acctW} saves ${fmtMoney0(acctDiff)} more in taxes`,
      disadvantage: `${fmtMoney0(acctDiff)} less in ${acctR} tax savings`,
    },
    {
      contrib: -(w.employerHsa - r.employerHsa),
      advantage: `the employer puts ${fmtMoney0(erDiff)} more into your HSA`,
      disadvantage: `${fmtMoney0(erDiff)} less employer HSA money`,
    },
    { contrib: w.fsaForfeit - r.fsaForfeit, advantage: `you'd forfeit ${fmtMoney0(forfeitDiff)} less FSA money`, disadvantage: `${fmtMoney0(forfeitDiff)} of forfeited FSA money` },
  ];
}

export function explainScenario(result: ComparisonResult, plans: Plan[], sc: Scenario): Explanation {
  const name = (id: string) => plans.find((p) => p.id === id)?.name ?? id;
  const ranking = result.rankings[sc.id] ?? [];
  const get = (id: string) => result.results.find((x) => x.planId === id && x.scenarioId === sc.id)!;
  const where = sc.allowedSpend === 'reachOopMax' ? 'if you reach the out-of-pocket max' : `at ${fmtMoney0(sc.allowedSpend)} of care`;

  if (ranking.length === 0) return { winnerId: null, headline: 'Add a plan to compare.', sentences: [] };
  const best = ranking[0]!;
  if (ranking.length === 1) {
    return { winnerId: best.planId, headline: `${name(best.planId)} is the only plan entered: ${fmtMoney0(best.netCost)} a year ${where}.`, sentences: [] };
  }
  const second = ranking[1]!;
  const w = get(best.planId);
  const r = get(second.planId);
  const gap = second.netCost - best.netCost;

  const headline =
    gap < MIN_DIFF
      ? `${name(w.planId)} and ${name(r.planId)} cost about the same ${where} (less than $1 apart).`
      : `${name(w.planId)} costs ${fmtMoney0(gap)} less than ${name(r.planId)} ${where}.`;

  const sentences: string[] = [];
  const t = terms(w, r)
    .filter((x) => Math.abs(x.contrib) >= MIN_DIFF)
    .sort((a, b) => Math.abs(b.contrib) - Math.abs(a.contrib));
  const adv = t.filter((x) => x.contrib < 0).slice(0, 2).map((x) => x.advantage);
  const dis = t.filter((x) => x.contrib > 0).slice(0, 2).map((x) => x.disadvantage);
  if (gap >= MIN_DIFF && adv.length > 0) {
    sentences.push(
      dis.length > 0
        ? `${cap(join(adv))}, which ${adv.length > 1 ? 'together outweigh' : 'outweighs'} ${join(dis)}.`
        : `${cap(join(adv))}.`,
    );
  }

  if (sc.allowedSpend === 'reachOopMax') {
    sentences.push('At this level every plan has hit its out-of-pocket max, so premiums, tax savings, and employer HSA money decide the order.');
    return { winnerId: w.planId, headline, sentences };
  }

  // Where the cheapest plan changes on either side of this spend (from the cheapest-plan strip).
  // The strip uses the Expected visit count, so only use it when it agrees with this scenario's winner.
  const S = sc.allowedSpend;
  const segs = result.cheapestBySpend;
  const i = segs.findIndex((s) => S >= s.from && S < s.to);
  const idx = i >= 0 ? i : segs.length - 1;
  const seg = segs[idx];
  if (seg && seg.planId === w.planId) {
    const prev = segs[idx - 1];
    const next = segs[idx + 1];
    const nearest = [prev && { plan: prev.planId, dist: S - seg.from }, next && { plan: next.planId, dist: seg.to - S }]
      .filter((x): x is { plan: string; dist: number } => Boolean(x))
      .sort((a, b) => a.dist - b.dist)[0];
    if (nearest) {
      // The headline already states the runner-up's gap; only name a different nearby rival.
      const behind = ranking.find((x) => x.planId === nearest.plan)?.deltaVsBest;
      if (behind !== undefined && nearest.plan !== r.planId) sentences.push(`${name(nearest.plan)} is ${fmtMoney0(behind)} behind here.`);
      if (prev && next) {
        sentences.push(`Below ${fmtMoney0(seg.from)} of care, ${name(prev.planId)} is cheapest; above ${fmtMoney0(seg.to)}, ${name(next.planId)} is.`);
      } else if (prev) {
        sentences.push(`Below ${fmtMoney0(seg.from)} of care, ${name(prev.planId)} is cheapest.`);
      } else if (next) {
        sentences.push(`Above ${fmtMoney0(seg.to)} of care, ${name(next.planId)} is cheapest.`);
      }
    } else {
      sentences.push(`${name(w.planId)} is cheapest at every spending level up to ${fmtMoney0(result.chartMaxSpend)}.`);
    }
  }
  return { winnerId: w.planId, headline, sentences };
}
