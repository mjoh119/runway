import { describe, expect, it } from 'vitest';
import { formatCents, formatMonthDay, formatSignedCents, formatWholeDollars } from '@/lib/format';

describe('formatCents', () => {
  it('formats zero', () => {
    expect(formatCents(0)).toBe('$0.00');
  });

  it('formats positive amounts with padded cents', () => {
    expect(formatCents(13000)).toBe('$130.00');
    expect(formatCents(5)).toBe('$0.05');
    expect(formatCents(1050)).toBe('$10.50');
  });

  it('formats negative amounts', () => {
    expect(formatCents(-550)).toBe('-$5.50');
    expect(formatCents(-1)).toBe('-$0.01');
  });

  it('adds thousands separators', () => {
    expect(formatCents(123456789)).toBe('$1,234,567.89');
  });

  it('rejects non-integer cents', () => {
    expect(() => formatCents(1.5)).toThrow();
  });
});

describe('formatWholeDollars', () => {
  it('formats whole dollars', () => {
    expect(formatWholeDollars(6000)).toBe('$60');
    expect(formatWholeDollars(0)).toBe('$0');
  });

  it('truncates sub-dollar remainders toward zero', () => {
    expect(formatWholeDollars(6099)).toBe('$60');
    expect(formatWholeDollars(-6099)).toBe('-$60');
  });

  it('formats negatives and thousands', () => {
    expect(formatWholeDollars(-6000)).toBe('-$60');
    expect(formatWholeDollars(250000)).toBe('$2,500');
  });

  it('does not render negative zero', () => {
    expect(formatWholeDollars(-50)).toBe('$0');
  });
});

describe('formatMonthDay', () => {
  it('formats month and day without padding', () => {
    expect(formatMonthDay('2026-03-12')).toBe('Mar 12');
    expect(formatMonthDay('2026-01-05')).toBe('Jan 5');
    expect(formatMonthDay('2026-12-31')).toBe('Dec 31');
  });

  it('rejects malformed dates and invalid months', () => {
    expect(() => formatMonthDay('3/12/2026')).toThrow();
    expect(() => formatMonthDay('2026-13-01')).toThrow();
  });
});

describe('formatSignedCents', () => {
  it('uses a real minus sign for negatives', () => {
    expect(formatSignedCents(-7500)).toBe('\u2212$75.00');
    expect(formatSignedCents(-7500, true)).toBe('\u2212$75.00');
  });
  it('adds a plus only when asked and non-zero', () => {
    expect(formatSignedCents(240000, true)).toBe('+$2,400.00');
    expect(formatSignedCents(240000)).toBe('$2,400.00');
    expect(formatSignedCents(0, true)).toBe('$0.00');
  });
});
