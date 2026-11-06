import { describe, expect, it } from 'vitest';
import { buildScenarios, compare } from '../compare';
import { explainScenario } from '../explain';
import { fmtMoney0 } from '../money';
import { SAMPLE_PLANS } from '../../data/samplePlans';
import { cfg2026, WORKED } from './fixtures';

const scenarios = buildScenarios({ allowedSpend: 3000, copayVisits: 4 });
const result = compare({ household: WORKED, plans: SAMPLE_PLANS, scenarios, config: cfg2026 });
const sc = (id: 'low' | 'expected' | 'high') => scenarios.find((s) => s.id === id)!;

describe('cheapest plan by spend (break-even strip)', () => {
  it('matches the worked example: HDHP → HMO at $2,773.53 → PPO at $13,943.65', () => {
    const segs = result.cheapestBySpend;
    expect(segs.map((s) => s.planId)).toEqual(['sample-hdhp', 'sample-hmo', 'sample-ppo']);
    expect(segs[0]!.from).toBe(0);
    expect(segs[0]!.to).toBeCloseTo(2773.525, 6);
    expect(segs[1]!.to).toBeCloseTo(13943.65, 6);
    expect(segs[2]!.to).toBe(result.chartMaxSpend);
  });

  it('chart curve includes every crossing, and its values equal the scenario results', () => {
    const xs = result.curve.map((p) => p.spend);
    for (const x of [2773.525, 2984.4375, 13943.65]) expect(xs.some((v) => Math.abs(v - x) < 1e-6)).toBe(true);
    const at3000 = result.curve.find((p) => p.spend === 3000)!;
    expect(at3000.costs['sample-hmo']).toBeCloseTo(2183.095, 6);
  });
});

describe('why this plan wins', () => {
  it('Expected: reproduces the spec sentence for the worked example', () => {
    const e = explainScenario(result, SAMPLE_PLANS, sc('expected'));
    expect(e.winnerId).toBe('sample-hmo');
    expect(e.headline).toBe('Sample HMO costs $169 less than Sample PPO at $3,000 of care.');
    expect(e.sentences).toEqual([
      'Its premiums are $780 lower ($549 after tax savings), which outweighs $380 more in out-of-pocket costs.',
      'Sample HDHP is $181 behind here.',
      'Below $2,774 of care, Sample HDHP is cheapest; above $13,944, Sample PPO is.',
    ]);
  });

  it('Low: HDHP wins; the two biggest reasons are HSA tax savings and employer money', () => {
    const e = explainScenario(result, SAMPLE_PLANS, sc('low'));
    expect(e.winnerId).toBe('sample-hdhp');
    expect(e.headline).toBe('Sample HDHP costs $1,199 less than Sample HMO at $300 of care.');
    expect(e.sentences[0]).toBe('Its HSA saves $593 more in taxes and the employer puts $500 more into your HSA, which together outweigh $260 more in out-of-pocket costs.');
  });

  it('High: explains that every plan is at its max', () => {
    const e = explainScenario(result, SAMPLE_PLANS, sc('high'));
    expect(e.winnerId).toBe('sample-ppo');
    expect(e.headline).toBe('Sample PPO costs $951 less than Sample HMO if you reach the out-of-pocket max.');
    expect(e.sentences.at(-1)).toMatch(/every plan has hit its out-of-pocket max/);
  });

  it('one plan only, and a near-tie', () => {
    const one = compare({ household: WORKED, plans: SAMPLE_PLANS.slice(0, 1), scenarios, config: cfg2026 });
    expect(explainScenario(one, SAMPLE_PLANS, sc('expected')).headline).toBe('Sample PPO is the only plan entered: $2,352 a year at $3,000 of care.');
    const twin = { ...SAMPLE_PLANS[0]!, id: 'twin', name: 'Twin PPO' };
    const tie = compare({ household: WORKED, plans: [SAMPLE_PLANS[0]!, twin], scenarios, config: cfg2026 });
    expect(explainScenario(tie, [SAMPLE_PLANS[0]!, twin], sc('expected')).headline).toMatch(/cost about the same/);
  });

  it('whole-dollar format rounds half away from zero', () => {
    expect(fmtMoney0(548.5)).toBe('$549');
    expect(fmtMoney0(-335.725)).toBe('−$336');
  });
});
