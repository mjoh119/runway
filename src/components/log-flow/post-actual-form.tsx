'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { formatCents } from '@/lib/format';
import { formatCentsPlain, parseMoney } from '@/lib/money';
import type { Entry } from '@/lib/projection/types';
import type { ProjectionResponse } from '@/lib/projection-response';
import { Field, inputClass, localToday, postJson, submitOnEnter } from './form-field';
import { useLogFlow } from './log-flow-context';
import { postPrefill } from './log-flow-state';
import { useSubmit } from './use-submit';

function postable(p: ProjectionResponse): Entry[] {
  const seen = new Set<string>();
  const out: Entry[] = [];
  for (const e of [...(p.warnings.overdueEntries ?? []), ...p.upcomingEntries]) {
    if (seen.has(e.id) || (e.status !== 'PLANNED' && e.status !== 'PENDING')) continue;
    seen.add(e.id);
    out.push(e);
  }
  return out;
}

function entryLabel(e: Entry): string {
  const sign = e.entryType === 'INCOME' ? '+' : '-';
  return `${e.description ?? 'Entry'} · ${e.shiftedPostDate} · ${sign}${formatCents(Math.abs(e.estimatedAmountCents))}`;
}

export function PostActualForm({ entryRef }: { entryRef?: string }) {
  const { closeLogFlow } = useLogFlow();
  const { submitting, error, errorField, submit } = useSubmit({ onSuccess: closeLogFlow });
  const [today] = useState(localToday);
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState(entryRef ?? '');
  const [amount, setAmount] = useState('');
  const [actualDate, setActualDate] = useState(today);
  const [clientError, setClientError] = useState<{ field: string; message: string } | null>(null);
  const amountRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    amountRef.current?.focus();
    let cancelled = false;
    fetch(`/api/projection?today=${today}`)
      .then((r) => (r.ok ? (r.json() as Promise<ProjectionResponse>) : Promise.reject(new Error())))
      .then((p) => {
        if (cancelled) return;
        const list = postable(p);
        setEntries(list);
        const initial = list.find((e) => e.id === entryRef) ?? list[0];
        if (initial) {
          setSelected(initial.id);
          setAmount(postPrefill(initial.estimatedAmountCents, today, formatCentsPlain).amount);
        }
      })
      .catch(() => !cancelled && setLoadError('Could not load entries. Close and try again.'));
    return () => {
      cancelled = true;
    };
  }, [today, entryRef]);

  const current = useMemo(() => entries?.find((e) => e.id === selected), [entries, selected]);

  const fieldError = (field: string) =>
    clientError?.field === field ? clientError.message : errorField === field ? error : null;
  const generalError = error && !['entryRef', 'amount', 'actualDate'].includes(errorField ?? '') ? error : null;

  function onSelect(id: string) {
    setSelected(id);
    const e = entries?.find((x) => x.id === id);
    if (e) setAmount(postPrefill(e.estimatedAmountCents, today, formatCentsPlain).amount);
    setActualDate(postPrefill(e?.estimatedAmountCents ?? 0, today, formatCentsPlain).actualDate);
  }

  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setClientError(null);
    if (!selected) return setClientError({ field: 'entryRef', message: 'Choose an entry' });
    const parsed = parseMoney(amount);
    if (!parsed.ok) return setClientError({ field: 'amount', message: parsed.error });
    await submit((submissionKey) =>
      postJson('/api/entries/post', {
        entryRef: selected,
        amount: formatCentsPlain(parsed.cents),
        actualDate,
        today,
        submissionKey,
      }),
    );
  }

  async function onSkip() {
    setClientError(null);
    if (!selected) return setClientError({ field: 'entryRef', message: 'Choose an entry' });
    await submit(() => postJson('/api/entries/skip', { entryRef: selected, today }));
  }

  return (
    <form onSubmit={onSubmit} onKeyDown={submitOnEnter} noValidate className="flex flex-col gap-4">
      <Field id="post-entry" label="Entry" error={fieldError('entryRef') ?? loadError}>
        <select
          id="post-entry"
          className={inputClass}
          value={selected}
          onChange={(e) => onSelect(e.target.value)}
          disabled={!entries || entries.length === 0}
          aria-invalid={fieldError('entryRef') ? true : undefined}
          aria-describedby={fieldError('entryRef') ? 'post-entry-error' : undefined}
        >
          {!entries ? <option value="">Loading…</option> : null}
          {entries?.length === 0 ? <option value="">No entries to post</option> : null}
          {entries?.map((e) => (
            <option key={e.id} value={e.id}>
              {entryLabel(e)}
            </option>
          ))}
        </select>
      </Field>
      <Field id="post-amount" label="Actual amount" error={fieldError('amount')}>
        <input
          id="post-amount"
          ref={amountRef}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          className={inputClass}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          aria-invalid={fieldError('amount') ? true : undefined}
          aria-describedby={fieldError('amount') ? 'post-amount-error' : undefined}
        />
      </Field>
      <Field id="post-date" label="Date" error={fieldError('actualDate')}>
        <input
          id="post-date"
          type="date"
          className={inputClass}
          value={actualDate}
          onChange={(e) => setActualDate(e.target.value)}
          aria-invalid={fieldError('actualDate') ? true : undefined}
          aria-describedby={fieldError('actualDate') ? 'post-date-error' : undefined}
        />
      </Field>
      {generalError ? (
        <p role="alert" className="text-sm text-destructive">
          {generalError}
        </p>
      ) : null}
      <div className="flex justify-between gap-2">
        <Button type="button" variant="outline" onClick={onSkip} disabled={submitting || !current}>
          Skip this entry
        </Button>
        <Button type="submit" disabled={submitting || !current}>
          Post actual
        </Button>
      </div>
    </form>
  );
}
