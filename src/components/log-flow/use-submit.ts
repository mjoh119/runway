'use client';

import { useCallback, useRef, useState } from 'react';
import { dispatchRunwayChanged } from './events';
import { createSubmissionSession } from './log-flow-state';

export type SubmitOutcome = { ok: true } | { ok: false; error: string; field?: string };

export interface UseSubmitOptions {
  /** Called after a successful submit, before `runway:changed` is dispatched. Typically closes the form. */
  onSuccess?: () => void;
}

export interface UseSubmit {
  /** One Submission_Key per opened form; reused on every attempt. */
  submissionKey: string;
  submitting: boolean;
  error: string | null;
  errorField: string | null;
  /** Runs `send` with the key. No-op while a request is in flight. Resolves true on success. */
  submit: (send: (submissionKey: string) => Promise<SubmitOutcome>) => Promise<boolean>;
}

/**
 * Call once per opened form (the form component mounts when the dialog opens), so the
 * key is generated on open. On failure the form stays open with its values; on success
 * the form closes and `runway:changed` fires.
 */
export function useSubmit({ onSuccess }: UseSubmitOptions = {}): UseSubmit {
  const [submissionKey] = useState(() => createSubmissionSession(() => crypto.randomUUID()).key);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<string | null>(null);
  const inFlight = useRef(false);

  const submit = useCallback<UseSubmit['submit']>(
    async (send) => {
      if (inFlight.current) return false;
      inFlight.current = true;
      setSubmitting(true);
      setError(null);
      setErrorField(null);
      try {
        const outcome = await send(submissionKey);
        if (outcome.ok) {
          onSuccess?.();
          dispatchRunwayChanged();
          return true;
        }
        setError(outcome.error);
        setErrorField(outcome.field ?? null);
        return false;
      } catch {
        setError('Something went wrong. Try again.');
        return false;
      } finally {
        inFlight.current = false;
        setSubmitting(false);
      }
    },
    [submissionKey, onSuccess],
  );

  return { submissionKey, submitting, error, errorField, submit };
}
