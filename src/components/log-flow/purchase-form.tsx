'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { formatCentsPlain, parseMoney } from '@/lib/money';
import { Field, inputClass, localToday, postJson, submitOnEnter } from './form-field';
import { useLogFlow } from './log-flow-context';
import { purchasePrefill } from './log-flow-state';
import { useSubmit } from './use-submit';

interface EnvelopeOption {
  id: string;
  name: string;
}

export function PurchaseForm() {
  const { closeLogFlow } = useLogFlow();
  const { submitting, error, errorField, submit } = useSubmit({ onSuccess: closeLogFlow });
  const [today] = useState(localToday);
  const [envelopes, setEnvelopes] = useState<EnvelopeOption[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [envelopeId, setEnvelopeId] = useState('');
  const [amount, setAmount] = useState(() => purchasePrefill(today).amount);
  const [purchaseDate, setPurchaseDate] = useState(() => purchasePrefill(today).purchaseDate);
  const [description, setDescription] = useState('');
  const [clientError, setClientError] = useState<{ field: string; message: string } | null>(null);
  const amountRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    amountRef.current?.focus();
    let cancelled = false;
    fetch(`/api/envelopes?today=${today}`)
      .then((r) => (r.ok ? (r.json() as Promise<{ envelopes: EnvelopeOption[] }>) : Promise.reject(new Error())))
      .then((d) => {
        if (cancelled) return;
        setEnvelopes(d.envelopes.map(({ id, name }) => ({ id, name })));
        setEnvelopeId((cur) => cur || d.envelopes[0]?.id || '');
      })
      .catch(() => !cancelled && setLoadError('Could not load envelopes. Close and try again.'));
    return () => {
      cancelled = true;
    };
  }, [today]);

  const fieldError = (field: string) =>
    clientError?.field === field ? clientError.message : errorField === field ? error : null;
  const generalError =
    error && !['envelopeId', 'amount', 'purchaseDate', 'description'].includes(errorField ?? '') ? error : null;

  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setClientError(null);
    if (!envelopeId) return setClientError({ field: 'envelopeId', message: 'Choose an envelope' });
    const parsed = parseMoney(amount);
    if (!parsed.ok) return setClientError({ field: 'amount', message: parsed.error });
    await submit((submissionKey) =>
      postJson('/api/line-items', {
        envelopeId,
        amount: formatCentsPlain(parsed.cents),
        purchaseDate,
        description: description.trim() || undefined,
        today,
        submissionKey,
      }),
    );
  }

  return (
    <form onSubmit={onSubmit} onKeyDown={submitOnEnter} noValidate className="flex flex-col gap-4">
      <Field id="purchase-amount" label="Amount" error={fieldError('amount')}>
        <input
          id="purchase-amount"
          ref={amountRef}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          className={inputClass}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          aria-invalid={fieldError('amount') ? true : undefined}
          aria-describedby={fieldError('amount') ? 'purchase-amount-error' : undefined}
        />
      </Field>
      <Field id="purchase-envelope" label="Envelope" error={fieldError('envelopeId') ?? loadError}>
        <select
          id="purchase-envelope"
          className={inputClass}
          value={envelopeId}
          onChange={(e) => setEnvelopeId(e.target.value)}
          disabled={!envelopes || envelopes.length === 0}
          aria-invalid={fieldError('envelopeId') ? true : undefined}
          aria-describedby={fieldError('envelopeId') ? 'purchase-envelope-error' : undefined}
        >
          {!envelopes ? <option value="">Loading…</option> : null}
          {envelopes?.length === 0 ? <option value="">No envelopes yet</option> : null}
          {envelopes?.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </Field>
      <Field id="purchase-date" label="Date" error={fieldError('purchaseDate')}>
        <input
          id="purchase-date"
          type="date"
          className={inputClass}
          value={purchaseDate}
          onChange={(e) => setPurchaseDate(e.target.value)}
          aria-invalid={fieldError('purchaseDate') ? true : undefined}
          aria-describedby={fieldError('purchaseDate') ? 'purchase-date-error' : undefined}
        />
      </Field>
      <Field id="purchase-description" label="Description (optional)" error={fieldError('description')}>
        <input
          id="purchase-description"
          type="text"
          autoComplete="off"
          className={inputClass}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          aria-invalid={fieldError('description') ? true : undefined}
          aria-describedby={fieldError('description') ? 'purchase-description-error' : undefined}
        />
      </Field>
      {generalError ? (
        <p role="alert" className="text-sm text-destructive">
          {generalError}
        </p>
      ) : null}
      <div className="flex justify-end">
        <Button type="submit" size="lg" disabled={submitting || !envelopeId}>
          Add purchase
        </Button>
      </div>
    </form>
  );
}
