import type { ProjectionOutput } from './projection/types';

/** /api/projection response: the engine output plus an additive echo of workspace settings. */
export type ProjectionResponse = ProjectionOutput & {
  settings: {
    /** User-set low-balance threshold in integer cents; null when none is set. */
    lowBalanceThresholdCents: number | null;
  };
};
