'use client';

import { ChevronDown, ChevronRight, Film, Fuel, ShoppingCart, Utensils, Wallet, type LucideIcon } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { RESET_PERIOD_LABELS } from '@/components/envelope-form';
import { dispatchRunwayChanged } from '@/components/log-flow/events';
import { Field, inputClass, localToday } from '@/components/log-flow/form-field';
import { Button } from '@/components/ui/button';
import { AmountCell } from '@/components/ui/amount-cell';
import { SectionCard } from '@/components/ui/section-card';
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
      <li className="px-4 py-3">
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
    <li className="flex items-center gap-3 px-4 py-2.5 text-sm">
      <time dateTime={item.purchaseDate} className="w-16 shrink-0 text-muted-foreground">
        {formatMonthDay(item.purchaseDate)}
      </time>
      <span className="min-w-0 flex-1 truncate font-medium">{item.description ?? 'Purchase'}</span>
      <AmountCell cents={-item.amountCents} className="shrink-0" />
      <span className="flex shrink-0 gap-1">
        <Button type="button" size="xs" variant="ghost" onClick={() => setMode('edit')} aria-label={`Edit ${label}`}>
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
      </span>
      {errors.form && (
        <p role="alert" className="basis-full text-sm text-destructive">
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
  collapsible,
}: {
  title: string;
  period: EnvelopePeriod;
  items: LineItemView[];
  envelopeName: string;
  collapsible?: boolean;
}) {
  const heading = (
    <>
      <span>
        {title} &middot; {rangeLabel(period)}
      </span>
      <span className="flex items-center gap-1 font-medium normal-case">
        {items.length} {items.length === 1 ? 'purchase' : 'purchases'}
        {collapsible && (
          <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden="true" />
        )}
      </span>
    </>
  );
  const headingClass =
    'flex items-center justify-between gap-2 px-4 py-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase';
  const list =
    items.length === 0 ? (
      <p className="px-4 py-3 text-sm text-muted-foreground">No purchases.</p>
    ) : (
      <ul className="divide-y divide-border border-t border-border">
        {items.map((item) => (
          <LineItemRow
            key={`${item.id}:${item.amountCents}:${item.purchaseDate}:${item.description}`}
            item={item}
            envelopeName={envelopeName}
          />
        ))}
      </ul>
    );

  if (collapsible) {
    return (
      <details className="group rounded-lg border border-border bg-background">
        <summary
          aria-label={`${title}, ${envelopeName}`}
          className={`${headingClass} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}
        >
          {heading}
        </summary>
        {list}
      </details>
    );
  }
  return (
    <section aria-label={`${title}, ${envelopeName}`} className="rounded-lg border border-border bg-background">
      <h3 className={headingClass}>{heading}</h3>
      {list}
    </section>
  );
}

/** Integer percentage of the budget spent (not capped, so 118% can be shown). */
function percentUsed(spentCents: number, budgetCents: number): number {
  if (budgetCents <= 0) return spentCents > 0 ? 100 : 0;
  return Math.floor((spentCents * 100) / budgetCents);
}

/** Envelope states: normal (primary), near limit at 80% or more (warning), over budget (danger). */
export type EnvelopeState = 'normal' | 'near' | 'over';
export function envelopeState(spentCents: number, budgetCents: number, overageCents: number): EnvelopeState {
  if (overageCents > 0) return 'over';
  return percentUsed(spentCents, budgetCents) >= 80 ? 'near' : 'normal';
}

const BAR_CLASS: Record<EnvelopeState, string> = {
  normal: 'bg-primary',
  near: 'bg-warning-foreground',
  over: 'bg-danger',
};

const ICON_RULES: [RegExp, LucideIcon][] = [
  [/groc|food|market|supermarket/i, ShoppingCart],
  [/gas|fuel|car|transport|commut/i, Fuel],
  [/takeout|dining|restaurant|coffee|lunch|eat/i, Utensils],
  [/entertain|fun|movie|game|hobb/i, Film],
];

/** Category icon chosen from the envelope's name; falls back to a wallet. */
export function envelopeIcon(name: string): LucideIcon {
  return ICON_RULES.find(([re]) => re.test(name))?.[1] ?? Wallet;
}

function stateOf(view: EnvelopeCardView): EnvelopeState {
  return envelopeState(view.spentCents, view.budgetCents, view.overageCents);
}

function summaryText(view: EnvelopeCardView): string {
  return stateOf(view) === 'over'
    ? `Spent ${formatCents(view.spentCents)} of ${formatCents(view.budgetCents)} budget, overspent by ${formatCents(view.overageCents)}`
    : `Spent ${formatCents(view.spentCents)} of ${formatCents(view.budgetCents)} budget, ${formatCents(view.leftCents)} left`;
}

function Bar({ view, labelledBy, className }: { view: EnvelopeCardView; labelledBy: string; className?: string }) {
  const state = stateOf(view);
  const width = Math.min(100, percentUsed(view.spentCents, view.budgetCents));
  return (
    <div
      role="progressbar"
      aria-labelledby={labelledBy}
      aria-valuemin={0}
      aria-valuemax={view.budgetCents}
      aria-valuenow={Math.min(view.spentCents, view.budgetCents)}
      aria-valuetext={summaryText(view)}
      className={`h-2 w-full overflow-hidden rounded-full bg-muted ${className ?? ''}`}
    >
      <div className={`h-full rounded-full ${BAR_CLASS[state]}`} style={{ width: `${width}%` }} />
    </div>
  );
}

function LeftText({ view }: { view: EnvelopeCardView }) {
  return stateOf(view) === 'over' ? (
    <span className="money font-medium text-destructive">{formatCents(view.overageCents)} over</span>
  ) : (
    <span className="money font-medium">{formatCents(view.leftCents)} left</span>
  );
}

/** Compact overview tile: icon, name, spent of budget, bar, left and % used. Selects the envelope. */
export function EnvelopeTile({
  view,
  selected,
  onSelect,
}: {
  view: EnvelopeCardView;
  selected: boolean;
  onSelect: () => void;
}) {
  const state = stateOf(view);
  const Icon = envelopeIcon(view.name);
  const nameId = `envelope-tile-${view.id}`;
  const border = state === 'over' ? 'border-danger' : selected ? 'border-ring' : 'border-border';
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`${view.name}, ${summaryText(view)}`}
      className={`flex flex-col gap-3 rounded-xl border bg-card p-4 text-left transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 ${border} ${state === 'over' ? 'bg-destructive-soft hover:bg-destructive-soft' : ''}`}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span id={nameId} className="truncate text-sm font-semibold">
            {view.name}
          </span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </span>
      <span className="money text-xl leading-7 font-semibold">
        {formatCents(view.spentCents)}{' '}
        <span className="text-sm font-normal text-muted-foreground">of {formatCents(view.budgetCents)}</span>
      </span>
      <Bar view={view} labelledBy={nameId} />
      <span className="flex items-center justify-between text-xs">
        <LeftText view={view} />
        <span className="text-muted-foreground">{percentUsed(view.spentCents, view.budgetCents)}% used</span>
      </span>
    </button>
  );
}

/** Collapsed row for the envelopes that are not currently selected. */
export function EnvelopeRow({ view, onSelect }: { view: EnvelopeCardView; onSelect: () => void }) {
  const state = stateOf(view);
  const Icon = envelopeIcon(view.name);
  const nameId = `envelope-row-${view.id}`;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={`${view.name}, ${summaryText(view)}`}
      className="flex w-full items-center gap-4 px-(--card-spacing) py-4 text-left outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span id={nameId} className="block truncate text-sm font-semibold">
          {view.name}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {RESET_PERIOD_LABELS[view.resetPeriod]} &middot; {rangeLabel(view.period)}
        </span>
      </span>
      <span className="money hidden shrink-0 text-sm font-semibold sm:block">
        {formatCents(view.spentCents)}{' '}
        <span className="font-normal text-muted-foreground">of {formatCents(view.budgetCents)}</span>
      </span>
      <Bar view={view} labelledBy={nameId} className="hidden w-32 shrink-0 md:block" />
      <span className={`w-20 shrink-0 text-right text-xs ${state === 'over' ? 'text-destructive' : 'text-muted-foreground'}`}>
        {percentUsed(view.spentCents, view.budgetCents)}% used
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </button>
  );
}

/** Full detail panel for the selected envelope. */
export function EnvelopeDetail({
  view,
  onEdit,
  onAddPurchase,
}: {
  view: EnvelopeCardView;
  onEdit: () => void;
  onAddPurchase: () => void;
}) {
  const state = stateOf(view);
  const Icon = envelopeIcon(view.name);
  const nameId = `envelope-title-${view.id}`;
  return (
    <SectionCard
      id={`envelope-${view.id}`}
      title={<span id={nameId}>{view.name}</span>}
      description={`${RESET_PERIOD_LABELS[view.resetPeriod]} \u00b7 ${rangeLabel(view.period)}`}
      icon={<Icon aria-hidden="true" />}
      action={
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" size="lg" onClick={onAddPurchase} aria-label={`Add purchase to ${view.name}`}>
            Add purchase
          </Button>
          <Button type="button" size="lg" variant="outline" onClick={onEdit} aria-label={`Edit ${view.name}`}>
            Edit envelope
          </Button>
        </div>
      }
      bodyClassName="flex flex-col gap-4"
    >
      <div className="rounded-lg border border-border bg-background p-4">
        <dl className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Budget</dt>
            <dd className="mt-0.5 text-lg font-semibold">
              <Money cents={view.budgetCents} />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Spent</dt>
            <dd className="mt-0.5 text-lg font-semibold">
              <Money cents={view.spentCents} />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{state === 'over' ? 'Over' : 'Left'}</dt>
            <dd className="mt-0.5 text-lg font-semibold">
              {state === 'over' ? (
                <Money cents={view.overageCents} className="text-destructive" />
              ) : (
                <Money cents={view.leftCents} />
              )}
            </dd>
          </div>
        </dl>
        <div className="mt-4 flex items-center gap-3">
          <Bar view={view} labelledBy={nameId} className="flex-1" />
          <span className="shrink-0 text-xs text-muted-foreground">
            {percentUsed(view.spentCents, view.budgetCents)}% used
          </span>
        </div>
      </div>

      {state === 'over' && view.runwayImpactCents > 0 && (
        <p className="rounded-lg bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive">
          Runway is {formatCents(view.runwayImpactCents)} lower
        </p>
      )}

      <ItemList title="Recent purchases" period={view.period} items={view.currentItems} envelopeName={view.name} />
      {view.preceding && (
        <ItemList
          title="Previous period"
          period={view.preceding.period}
          items={view.preceding.items}
          envelopeName={view.name}
          collapsible
        />
      )}
    </SectionCard>
  );
}