'use client';

import { useState, type FormEvent } from 'react';
import { RESET_PERIOD_LABELS } from '@/components/envelope-form';
import { dispatchRunwayChanged } from '@/components/log-flow/events';
import { Field, inputClass, localToday } from '@/components/log-flow/form-field';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Money } from '@/components/ui/money';
import type { EnvelopePeriod } from '@/lib/envelopes/types';
import type { EnvelopeCardView, LineItemView } from '@/lib/envelopes/view-model';
import { formatCents, formatMonthDay } from '@/lib/format';
import { formatCentsPlain, parseMoney } from '@/lib/money';

function rangeLabel(p: EnvelopePeriod): string {
  return `${formatMonthDay(p.start)} to ${formatMonthDay(p.end)}`;
}

type ItemErrors = { amount?: string; purchaseDate?: string; description?: string; form?: string };

type MutationBody =
  | { ok: true }
  | { ok: false; error: { message: string; field?: string | null } }
  | null;

function LineItemRow({ item, envelopeName }: { item: LineItemView; envelopeName: string }) {
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [amount, setAmount] = useState(formatCentsPlain(item.amountCents));
  const [date, setDate] = useState(item.purchaseDate);
  const [description, setDescription] = useState(item.description ?? '');
  const [errors, setErrors] = useState<ItemErrors>({});
  const [busy, setBusy] = useState(false);
  const label = item.description ? item.description : `purchase on ${formatMonthDay(item.purchaseDate)}`;
  const idBase = `line-item-${item.id}`;

  async function onSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const parsed = parseMoney(amount);
    if (!parsed.ok) {
      setErrors({ amount: parsed.error });
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const res = await fetch(`/api/line-items/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: formatCentsPlain(parsed.cents),
          purchaseDate: date,
          description,
          today: localToday(),
        }),
      });
      const body = (await res.json().catch(() => null)) as MutationBody;
      if (res.ok && body?.ok) {
        dispatchRunwayChanged();
        setMode('view');
      } else if (body && !body.ok) {
        const { message, field } = body.error;
        if (field === 'amount' || field === 'purchaseDate' || field === 'description') {
          setErrors({ [field]: message });
        } else setErrors({ form: message });
      } else {
        setErrors({ form: 'Something went wrong. Please try again.' });
      }
    } catch {
      setErrors({ form: 'Could not save the purchase. Please try again.' });
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (busy) return;
    setBusy(true);
    setErrors({});
    try {
      const res = await fetch(`/api/line-items/${item.id}?today=${encodeURIComponent(localToday())}`, {
        method: 'DELETE',
      });
      const body = (await res.json().catch(() => null)) as MutationBody;
      if (res.ok && body?.ok) {
        dispatchRunwayChanged();
        return;
      }
      setErrors({ form: body && !body.ok ? body.error.message : 'Something went wrong. Please try again.' });
    } catch {
      setErrors({ form: 'Could not delete the purchase. Please try again.' });
    }
    setBusy(false);
  }

  if (mode === 'edit') {
    return (
      <li className="py-2">
        <form
          onSubmit={onSave}
          noValidate
          aria-label={`Edit ${label} in ${envelopeName}`}
          className="flex flex-col gap-3"
        >
          <Field id={`${idBase}-amount`} label="Amount (dollars)" error={errors.amount}>
            <input
              id={`${idBase}-amount`}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              autoFocus
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-invalid={errors.amount ? true : undefined}
              aria-describedby={errors.amount ? `${idBase}-amount-error` : undefined}
              className={inputClass}
            />
          </Field>
          <Field id={`${idBase}-date`} label="Date" error={errors.purchaseDate}>
            <input
              id={`${idBase}-date`}
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              aria-invalid={errors.purchaseDate ? true : undefined}
              aria-describedby={errors.purchaseDate ? `${idBase}-date-error` : undefined}
              className={inputClass}
            />
          </Field>
          <Field id={`${idBase}-description`} label="Description" error={errors.description}>
            <input
              id={`${idBase}-description`}
              type="text"
              autoComplete="off"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              aria-invalid={errors.description ? true : undefined}
              aria-describedby={errors.description ? `${idBase}-description-error` : undefined}
              className={inputClass}
            />
          </Field>
          {errors.form && (
            <p role="alert" className="text-sm text-destructive">
              {errors.form}
            </p>
          )}
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setMode('view');
                setErrors({});
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className="flex flex-col gap-1 py-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate">{item.description ?? 'Purchase'}</p>
          <p className="text-xs text-muted-foreground">
            <time dateTime={item.purchaseDate}>{formatMonthDay(item.purchaseDate)}</time>
          </p>
        </div>
        <Money cents={-item.amountCents} />
      </div>
      <div className="flex gap-1">
        <Button
          type="button"
          size="xs"
          variant="ghost"
          onClick={() => setMode('edit')}
          aria-label={`Edit ${label}`}
        >
          Edit
        </Button>
        <Button
          type="button"
          size="xs"
          variant="ghost"
          disabled={busy}
          onClick={() => void onDelete()}
          aria-label={`Delete ${label}`}
        >
          Delete
        </Button>
      </div>
      {errors.form && (
        <p role="alert" className="text-sm text-destructive">
          {errors.form}
        </p>
      )}
    </li>
  );
}

function ItemList({
  title,
  period,
  items,
  envelopeName,
}: {
  title: string;
  period: EnvelopePeriod;
  items: LineItemView[];
  envelopeName: string;
}) {
  return (
    <section aria-label={`${title}, ${envelopeName}`}>
      <h3 className="text-xs font-medium text-muted-foreground">
        {title} · {rangeLabel(period)}
      </h3>
      {items.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">No purchases.</p>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((item) => (
            <LineItemRow key={`${item.id}:${item.amountCents}:${item.purchaseDate}:${item.description}`} item={item} envelopeName={envelopeName} />
          ))}
        </ul>
      )}
    </section>
  );
}

/** Integer percentage of the budget spent, capped at 100. */
function percentSpent(spentCents: number, budgetCents: number): number {
  if (budgetCents <= 0) return spentCents > 0 ? 100 : 0;
  return Math.min(100, Math.floor((spentCents * 100) / budgetCents));
}

export function EnvelopeCard({
  view,
  onEdit,
  onAddPurchase,
}: {
  view: EnvelopeCardView;
  onEdit: () => void;
  onAddPurchase: () => void;
}) {
  const overspent = view.overageCents > 0;
  const percent = percentSpent(view.spentCents, view.budgetCents);
  const valueText = overspent
    ? `Spent ${formatCents(view.spentCents)} of ${formatCents(view.budgetCents)} budget, overspent by ${formatCents(view.overageCents)}`
    : `Spent ${formatCents(view.spentCents)} of ${formatCents(view.budgetCents)} budget, ${formatCents(view.leftCents)} left`;
  const nameId = `envelope-title-${view.id}`;

  return (
    <Card aria-labelledby={nameId} role="group">
      <div className="flex flex-col gap-4 px-(--card-spacing)">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id={nameId} className="font-heading text-base font-medium">
              {view.name}
            </h2>
            <p className="text-xs text-muted-foreground">
              {RESET_PERIOD_LABELS[view.resetPeriod]} · {rangeLabel(view.period)}
            </p>
          </div>
          {overspent && <Chip variant="overdue">Overspent by {formatCents(view.overageCents)}</Chip>}
        </div>

        <div
          role="progressbar"
          aria-labelledby={nameId}
          aria-valuemin={0}
          aria-valuemax={view.budgetCents}
          aria-valuenow={Math.min(view.spentCents, view.budgetCents)}
          aria-valuetext={valueText}
          className="h-2 w-full overflow-hidden rounded-full bg-muted"
        >
          <div
            className={overspent ? 'h-full bg-destructive' : 'h-full bg-primary'}
            style={{ width: `${percent}%` }}
          />
        </div>

        <dl className="grid grid-cols-3 gap-3 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Budget</dt>
            <dd>
              <Money cents={view.budgetCents} />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Spent</dt>
            <dd>
              <Money cents={view.spentCents} />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Left</dt>
            <dd>
              <Money cents={view.leftCents} />
            </dd>
          </div>
        </dl>

        {overspent && view.runwayImpactCents > 0 && (
          <p className="text-sm text-destructive">Runway is {formatCents(view.runwayImpactCents)} lower</p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={onAddPurchase} aria-label={`Add purchase to ${view.name}`}>
            Add purchase
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onEdit} aria-label={`Edit ${view.name}`}>
            Edit envelope
          </Button>
        </div>

        <ItemList title="Current period" period={view.period} items={view.currentItems} envelopeName={view.name} />
        {view.preceding && (
          <ItemList
            title="Previous period"
            period={view.preceding.period}
            items={view.preceding.items}
            envelopeName={view.name}
          />
        )}
      </div>
    </Card>
  );
}
