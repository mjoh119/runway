import type { ProjectionOutput } from './projection/types';
import type { VarianceRow } from './projection/variance';

/** /api/projection response: the engine output plus additive workspace echoes and variance. */
export type ProjectionResponse = ProjectionOutput & {
  settings: {
    /** User-set low-balance threshold in integer cents; null when none is set. */
    lowBalanceThresholdCents: number | null;
    /** Projection horizon in days. */
    projectionHorizonDays: number;
  };
  /** Posted entries in the current pay cycle; null when there are no pay cycles. */
  variance: {
    cycle: { startDate: string; endDate: string };
    rows: VarianceRow[];
    totalCents: number;
  } | null;
};
