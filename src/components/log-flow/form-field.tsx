'use client';

import { Button } from '@/components/ui/button';
import type { SubmitOutcome } from './use-submit';

export const inputClass =
  'h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive';

/** Today's calendar date in the visitor's local timezone, as YYYY-MM-DD. */
export function localToday(): string {
  return new Date().toLocaleDateString('en-CA');
}

/** Label + control + inline error. The control must use `id` and may reference `${id}-error`. */
export function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** POSTs JSON and maps the `{ ok, result } / { ok:false, error }` envelope to a SubmitOutcome. */
export async function postJson(url: string, body: unknown): Promise<SubmitOutcome> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  let json: { ok?: boolean; error?: { message?: string; field?: string | null } } | null = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  if (res.ok && json?.ok) return { ok: true };
  return {
    ok: false,
    error: json?.error?.message ?? 'Something went wrong. Try again.',
    field: json?.error?.field ?? undefined,
  };
}

/** Submit the enclosing form when Enter is pressed in a control that does not submit natively (select). */
export function submitOnEnter(e: React.KeyboardEvent<HTMLFormElement>) {
  if (e.key === 'Enter' && e.target instanceof HTMLSelectElement) {
    e.preventDefault();
    e.currentTarget.requestSubmit();
  }
}

/** Primary Save plus Cancel, with optional extra controls underneath. */
export function FormActions({
  disabled,
  saveLabel = 'Save',
  onCancel,
  children,
}: {
  disabled?: boolean;
  saveLabel?: string;
  onCancel: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="mt-2 flex flex-col gap-3">
      <div className="flex gap-3">
        <Button type="submit" size="lg" className="flex-1" disabled={disabled}>
          {saveLabel}
        </Button>
        <Button type="button" size="lg" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      {children}
    </div>
  );
}