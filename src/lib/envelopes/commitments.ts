import type { EnvelopeCommitment } from '../projection/types';
import type { EnvelopePeriod } from './types';

/**
 * One Envelope_Commitment per envelope with money left. Pure; not persisted.
 * Dated on the Commitment_Date: the later of the period start and `today`.
 * Envelopes with nothing left yield no commitment.
 */
export function buildEnvelopeCommitments(
  envelopes: readonly { id: string; name: string; period: EnvelopePeriod; leftCents: number }[],
  today: string,
): EnvelopeCommitment[] {
  const commitments: EnvelopeCommitment[] = [];
  for (const env of envelopes) {
    if (env.leftCents <= 0) continue;
    commitments.push({
      envelopeId: env.id,
      description: env.name,
      amountCents: env.leftCents,
      // 'YYYY-MM-DD' strings compare chronologically.
      date: env.period.start > today ? env.period.start : today,
    });
  }
  return commitments;
}
