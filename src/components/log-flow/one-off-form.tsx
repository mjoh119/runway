'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { formatCentsPlain, parseMoney } from '@/lib/money';
import { Field, inputClass, localToday, postJson, submitOnEnter } from './form-field';
import { useLogFlow } from './log-flow-context';
import { alreadyHappenedDefault, nextAlreadyHappened } from './log-flow-state';
import { useSubmit } from './use-submit';

export function OneOffForm() {
  const { closeLogFlow } = useLogFlow();
  const { submitting, error, errorField, submit } = useSubmit({ onSuccess: closeLogFlow });
  const [today] = useState(localToday);
  const [direction, setDirection] = useState<'DEBIT' | 'INCOME'>('DEBIT');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today);
  const [description, setDescription] = useState('');
  const [alreadyHappened, setAlreadyHappened] = useState(() => alreadyHappenedDefault(today, today));
  const [manuallyToggled, setManuallyToggled] = useState(false);
  const [clientError, setClientError] = useState<{ field: string; message: string } | null>(null);
  const amountRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    amountRef.current?.focus();
  }, []);

  const fieldError = (field: string) =>
    clientError?.field === field ? clientError.message : errorField === field ? error : null;
  const generalError =
    error && !['amount', 'date', 'description', 'direction'].includes(errorField ?? '') ? error : null;

  function onDateChange(value: string) {
    setDate(value);
    setAlreadyHappened(nextAlreadyHappened({ alreadyHappened, manuallyToggled }, value, today));
  }

  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setClientError(null);
    const parsed = parseMoney(amount);
    if (!parsed.ok) return setClientError({ field: 'amount', message: parsed.error });
    await submit((submissionKey) =>
      postJson('/api/entries/one-off', {
        direction,
        amount: formatCentsPlain(parsed.cents),
        date,
        description: description.trim() || undefined,
        alreadyHappened,
        today,
        submissionKey,
      }),
    );
  }

  return (
    <form onSubmit={onSubmit} onKeyDown={submitOnEnter} noValidate className="flex flex-col gap-4">
      <Field id="oneoff-amount" label="Amount" error={fieldError('amount')}>
        <input
          id="oneoff-amount"
          ref={amountRef}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          className={inputClass}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          aria-invalid={fieldError('amount') ? true : undefined}
          aria-describedby={fieldError('amount') ? 'oneoff-amount-error' : undefined}
        />
      </Field>
      <Field id="oneoff-direction" label="Type" error={fieldError('direction')}>
        <select
          id="oneoff-direction"
          className={inputClass}
          value={direction}
          onChange={(e) => setDirection(e.target.value as 'DEBIT' | 'INCOME')}
        >
          <option value="DEBIT">Expense</option>
          <option value="INCOME">Income</option>
        </select>
      </Field>
      <Field id="oneoff-date" label="Date" error={fieldError('date')}>
        <input
          id="oneoff-date"
          type="date"
          className={inputClass}
          value={date}
          onChange={(e) => onDateChange(e.target.value)}
          aria-invalid={fieldError('date') ? true : undefined}
          aria-describedby={fieldError('date') ? 'oneoff-date-error' : undefined}
        />
      </Field>
      <Field id="oneoff-description" label="Description (optional)" error={fieldError('description')}>
        <input
          id="oneoff-description"
          type="text"
          autoComplete="off"
          className={inputClass}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          aria-invalid={fieldError('description') ? true : undefined}
          aria-describedby={fieldError('description') ? 'oneoff-description-error' : undefined}
        />
      </Field>
      <div className="flex items-center gap-2">
        <input
          id="oneoff-happened"
          type="checkbox"
          className="size-4"
          checked={alreadyHappened}
          onChange={(e) => {
            setManuallyToggled(true);
            setAlreadyHappened(e.target.checked);
          }}
        />
        <label htmlFor="oneoff-happened" className="text-sm font-medium">
          This already happened
        </label>
      </div>
      {generalError ? (
        <p role="alert" className="text-sm text-destructive">
          {generalError}
        </p>
      ) : null}
      <div className="flex justify-end">
        <Button type="submit" size="lg" disabled={submitting}>
          Add one-off
        </Button>
      </div>
    </form>
  );
}
