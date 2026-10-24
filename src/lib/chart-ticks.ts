// Pure "nice number" y-axis ticks in integer cents. No I/O.

const NICE_MULTIPLIERS = [1, 2, 2.5, 5, 10];

/** Smallest nice step (in cents, a multiple of 100) so the range fits in about `targetTicks` intervals. */
export function niceStepCents(rangeCents: number, targetTicks = 5): number {
  const rawDollars = Math.max(rangeCents, 1) / 100 / targetTicks;
  const magnitude = 10 ** Math.floor(Math.log10(rawDollars));
  for (const m of NICE_MULTIPLIERS) {
    const step = m * magnitude;
    if (step >= rawDollars) return Math.max(100, Math.round(step * 100));
  }
  return Math.max(100, Math.round(10 * magnitude * 100));
}

/**
 * Evenly spaced round ticks covering [min, max]. Always includes 0 when the data is
 * all positive (axis starts at $0) and extends below 0 when values are negative.
 */
export function niceTicksCents(minCents: number, maxCents: number, targetTicks = 5): number[] {
  const lo = Math.min(minCents, 0);
  const hi = Math.max(maxCents, 0);
  const step = niceStepCents(hi - lo, targetTicks);
  const start = Math.floor(lo / step) * step;
  const end = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let t = start; t <= end; t += step) ticks.push(t === 0 ? 0 : t); // normalise -0
  return ticks;
}
