import { describe, expect, it } from 'vitest';
import { costAt } from '../curve';
import { niceTicks } from '../components/useWidth';
import { toHousehold, WORKED_EXAMPLE_FORM } from '../model';
import { buildPlanContext, netCostAt } from '../../engine/netCost';
import { compare, buildScenarios } from '../../engine/compare';
import { SAMPLE_PLANS } from '../../data/samplePlans';
import { cfg2026, WORKED } from '../../engine/__tests__/fixtures';

const result = compare({ household: WORKED, plans: SAMPLE_PLANS, scenarios: buildScenarios({ allowedSpend: 3000, copayVisits: 4 }), config: cfg2026 });

describe('UI helpers', () => {
  it('chart interpolation is exact at any spend (the curve holds every kink)', () => {
    for (const p of SAMPLE_PLANS) {
      const ctx = buildPlanContext(p, WORKED, cfg2026);
      for (const s of [0, 137, 599.5, 1234.56, 2984.44, 7777, 13100, 20999]) {
        expect(costAt(result.curve, s, p.id), `${p.id} @ ${s}`).toBeCloseTo(netCostAt(ctx, s, 4, 150).netCost, 6);
      }
    }
  });

  it('axis ticks are clean 1/2/2.5/5 steps covering the range', () => {
    expect(niceTicks(0, 21000, 7)).toEqual([0, 5000, 10000, 15000, 20000, 25000]);
    expect(niceTicks(-42.7, 5964.3, 6)).toEqual([-2000, 0, 2000, 4000, 6000]);
    expect(niceTicks(0, 900, 4)).toEqual([0, 500, 1000]);
  });

  it('the "Load worked example" form maps to the spec §8 household exactly', () => {
    expect(toHousehold(WORKED_EXAMPLE_FORM, 2026)).toEqual({ ...WORKED, customState: undefined, familySpend: 'pooled' });
  });
});
