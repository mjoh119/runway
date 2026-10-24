import { describe, expect, it } from 'vitest';
import { niceStepCents, niceTicksCents } from '../src/lib/chart-ticks';

describe('niceTicksCents', () => {
  it('starts at $0 and uses clean steps for positive data', () => {
    expect(niceTicksCents(13_000, 200_000)).toEqual([0, 50_000, 100_000, 150_000, 200_000]);
    expect(niceTicksCents(13_000, 253_000)).toEqual([0, 100_000, 200_000, 300_000]);
  });

  it('includes negative values when present', () => {
    const ticks = niceTicksCents(-12_000, 40_000);
    expect(ticks[0]).toBeLessThan(0);
    expect(ticks).toContain(0);
    expect(ticks[0]).toBeLessThanOrEqual(-12_000);
    expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(40_000);
  });

  it('never goes below one dollar steps for tiny ranges', () => {
    expect(niceStepCents(0)).toBe(100);
    expect(niceTicksCents(0, 0)).toEqual([0]);
  });

  it('every tick is a whole-dollar integer', () => {
    for (const t of niceTicksCents(-33_333, 987_654)) {
      expect(Number.isInteger(t)).toBe(true);
      expect(Math.abs(t % 100)).toBe(0);
    }
  });
});
