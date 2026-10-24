'use client';

import { useState, type FormEvent } from 'react';
import { dispatchRunwayChanged } from '@/components/log-flow/events';
import { Field, inputClass, localToday } from '@/components/log-flow/form-field';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { ResetPeriod } from '@/lib/envelopes/types';
import { formatCentsPlain, parseMoney } from '@/lib/money';

export const RESET_PERIOD_LABELS: Record<ResetPeriod, string> = {
  EACH_PAY_CYCLE: 'Each pay cycle',
  WEEKLY: 'Weekly',
  MONTHLY: 'Monthly',
};

export interface EnvelopeFormTarget {
  id: string;
  name: string;
  budgetCents: number;
  resetPeriod: ResetPeriod;
}

type Errors = { name?: string; budget?: string; resetPeriod?: string; form?: string };

/** Create (no `envelope`) or edit an envelope. Parses the budget client-side before sending. */
export function EnvelopeForm({
  envelope,
  onDone,
  onCancel,
}: {
  envelope?: EnvelopeFormTarget;
  onDone: () => void;
  onCancel: () => void;
}) {
  const editing = Boolean(envelope);
  const idBase = envelope ? `envelope-${envelope.id}` : 'envelope-new';
  const [name, setName] = useState(envelope?.name ?? '');
  const [budget, setBudget] = useState(envelope ? formatCentsPlain(envelope.budgetCents) : '');
  const [resetPeriod, setResetPeriod] = useState<ResetPeriod>(envelope?.resetPeriod ?? 'EACH_PAY_CYCLE');
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;

    const parsed = parseMoney(budget);
    if (!parsed.ok) {
      setErrors({ budget: parsed.error });
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      const res = await fetch(editing ? `/api/envelopes/${envelope!.id}` : '/api/envelopes', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          budget: formatCentsPlain(parsed.cents),
          resetPeriod,
          today: localToday(),
        }),
      });
      const body = (await res.json().catch(() => null)) as
        | { ok: true }
        | { ok: false; error: { message: string; field?: string | null } }
        | null;
      if (res.ok && body?.ok) {
        dispatchRunwayChanged();
        onDone();
      } else if (body && !body.ok) {
        const { message, field } = body.error;
        if (field === 'name' || field === 'budget' || field === 'resetPeriod') setErrors({ [field]: message });
        else setErrors({ form: message });
      } else {
        setErrors({ form: 'Something went wrong. Please try again.' });
      }
    } catch {
      setErrors({ form: 'Could not save the envelope. Please try again.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <form
        onSubmit={onSubmit}
        noValidate
        aria-label={editing ? `Edit ${envelope!.name}` : 'Create envelope'}
        className="flex flex-col gap-4 px-(--card-spacing)"
      >
        <h2 className="font-heading text-base font-medium">{editing ? 'Edit envelope' : 'New envelope'}</h2>
        <Field id={`${idBase}-name`} label="Name" error={errors.name}>
          <input
            id={`${idBase}-name`}
            type="text"
            autoComplete="off"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? `${idBase}-name-error` : undefined}
            className={inputClass}
          />
        </Field>
        <Field id={`${idBase}-budget`} label="Budget (dollars)" error={errors.budget}>
          <input
            id={`${idBase}-budget`}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            aria-invalid={errors.budget ? true : undefined}
            aria-describedby={errors.budget ? `${idBase}-budget-error` : undefined}
            className={inputClass}
          />
        </Field>
        <Field id={`${idBase}-period`} label="Resets" error={errors.resetPeriod}>
          <select
            id={`${idBase}-period`}
            value={resetPeriod}
            onChange={(e) => setResetPeriod(e.target.value as ResetPeriod)}
            aria-invalid={errors.resetPeriod ? true : undefined}
            aria-describedby={errors.resetPeriod ? `${idBase}-period-error` : undefined}
            className={inputClass}
          >
            {(Object.keys(RESET_PERIOD_LABELS) as ResetPeriod[]).map((p) => (
              <option key={p} value={p}>
                {RESET_PERIOD_LABELS[p]}
              </option>
            ))}
          </select>
        </Field>
        {errors.form && (
          <p role="alert" className="text-sm text-destructive">
            {errors.form}
          </p>
        )}
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Create envelope'}
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
