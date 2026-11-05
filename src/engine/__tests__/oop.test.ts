import { describe, expect, it } from 'vitest';
import { costShareFor, outOfPocket, outOfPocketAtMax, spendToReachOop, type CostShare } from '../oop';
import { plan } from './fixtures';

const A = 150; // allowed cost per copay visit
const cs = (id: Parameters<typeof plan>[0], tier: 'self' | 'family' = 'self') => costShareFor(plan(id), tier);

describe('out-of-pocket model', () => {
  it('T7: copay plan with spend below n × a scales copays down in proportion (Low use)', () => {
    expect(outOfPocket(cs('sample-ppo'), 300, 2, A).oop).toBeCloseTo(50, 9);
    expect(outOfPocket(cs('sample-hmo'), 300, 2, A).oop).toBeCloseTo(40, 9);
    expect(outOfPocket(cs('sample-ppo'), 150, 2, A).oop).toBeCloseTo(25, 9); // one visit's worth
  });

  it('T9: HDHP has no copays; everything goes deductible first (Expected use)', () => {
    const d = outOfPocket(cs('sample-hdhp'), 3000, 4, A);
    expect(d.copays).toBe(0);
    expect(d.deductiblePaid).toBe(3000);
    expect(d.oop).toBe(3000);
  });

  it('copay plans: copays, then deductible, then coinsurance (Expected use)', () => {
    const ppo = outOfPocket(cs('sample-ppo'), 3000, 4, A);
    expect([ppo.copayPortion, ppo.copays, ppo.deductiblePaid, ppo.coinsurancePaid, ppo.oop]).toEqual([600, 100, 500, 380, 980]);
    expect(outOfPocket(cs('sample-hmo'), 3000, 4, A).oop).toBeCloseTo(1360, 9);
  });

  it('T8: OOP is capped at the out-of-pocket max', () => {
    const d = outOfPocket(cs('sample-ppo'), 20000, 4, A);
    expect(d.oop).toBe(3000);
    expect(d.capped).toBe(true);
    expect(outOfPocketAtMax(cs('sample-hdhp'), 4, A).oop).toBe(6000);
  });

  it('finds the spend where each plan hits its OOP max', () => {
    expect(spendToReachOop(cs('sample-ppo'), 4, A)).toBeCloseTo(13100, 9);
    expect(spendToReachOop(cs('sample-hmo'), 4, A)).toBeCloseTo(18700, 9);
    expect(spendToReachOop(cs('sample-hdhp'), 4, A)).toBeCloseTo(18000, 9);
  });

  it('a copay above the allowed cost per visit costs only the allowed cost', () => {
    const c: CostShare = { deductible: 500, oopMax: 3000, coinsurance: 0.2, copayPerVisit: 200 };
    expect(outOfPocket(c, 300, 2, A).copays).toBeCloseTo(300, 9);
  });

  it('0% coinsurance below the max never reaches it; High use still assumes the max', () => {
    const c: CostShare = { deductible: 1000, oopMax: 2000, coinsurance: 0, copayPerVisit: null };
    expect(spendToReachOop(c, 0, A)).toBe(Infinity);
    expect(outOfPocket(c, 1e6, 0, A).oop).toBe(1000);
    const hi = outOfPocketAtMax(c, 0, A);
    expect(hi.oop).toBe(2000);
    expect(hi.allowedSpend).toBeNull();
  });

  it('T10 (part): family tiers use the family deductible and OOP max', () => {
    expect(cs('sample-ppo', 'family')).toMatchObject({ deductible: 1000, oopMax: 6000 });
    expect(costShareFor(plan('sample-ppo'), 'selfSpouse')).toMatchObject({ deductible: 1000, oopMax: 6000 });
  });

  it('OOP never decreases as spend rises (the break-even solver relies on this)', () => {
    for (const id of ['sample-ppo', 'sample-hmo', 'sample-hdhp'] as const) {
      let prev = -1;
      for (let s = 0; s <= 25000; s += 37) {
        const o = outOfPocket(cs(id), s, 4, A).oop;
        expect(o).toBeGreaterThanOrEqual(prev);
        prev = o;
      }
    }
  });
});
