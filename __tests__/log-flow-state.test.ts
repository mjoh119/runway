import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  alreadyHappenedDefault,
  nextAlreadyHappened,
} from '@/components/log-flow/log-flow-state';

const isoDate = fc
  .integer({ min: Date.UTC(2000, 0, 1), max: Date.UTC(2099, 11, 31) })
  .map((ms) => new Date(ms).toISOString().slice(0, 10));

describe('Property 25: Already-happened default follows the date unless overridden', () => {
  /** **Validates: Requirements 14.14, 14.15, 14.16, 14.17** */

  it('default is true exactly when the date is on or before today', () => {
    fc.assert(
      fc.property(isoDate, isoDate, (date, today) => {
        expect(alreadyHappenedDefault(date, today)).toBe(date <= today);
      }),
    );
  });

  it('is true when the date equals today', () => {
    fc.assert(fc.property(isoDate, (d) => alreadyHappenedDefault(d, d) === true));
  });

  it('follows the new date when the user has not toggled, whatever the prior value', () => {
    fc.assert(
      fc.property(fc.boolean(), isoDate, isoDate, (prior, newDate, today) => {
        const next = nextAlreadyHappened(
          { alreadyHappened: prior, manuallyToggled: false },
          newDate,
          today,
        );
        expect(next).toBe(alreadyHappenedDefault(newDate, today));
      }),
    );
  });

  it('keeps the manual choice unchanged when the user has toggled', () => {
    fc.assert(
      fc.property(fc.boolean(), isoDate, isoDate, (choice, newDate, today) => {
        const next = nextAlreadyHappened(
          { alreadyHappened: choice, manuallyToggled: true },
          newDate,
          today,
        );
        expect(next).toBe(choice);
      }),
    );
  });
});
