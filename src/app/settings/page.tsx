'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { dispatchRunwayChanged } from '@/components/log-flow/events';
import { MobileTitle, PageHeader } from '@/components/page-header';
import { DEMO_RESET_EVENT } from '@/components/reset-demo-button';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { formatCentsPlain, parseMoney } from '@/lib/money';

type LoadState = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready' };

type FieldErrors = { threshold?: string; horizon?: string; form?: string };

type SettingsResult = { lowBalanceThresholdCents: number | null; projectionHorizonDays: number };

const HORIZON_ERROR = 'Projection horizon must be a whole number from 1 to 365';

const inputClass =
  'h-9 w-full max-w-xs rounded-lg border border-border bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive';

/** Visitor's local calendar date. Never toISOString(): it converts to UTC. */
function localToday(): string {
  return new Date().toLocaleDateString('en-CA');
}

export default function SettingsPage() {
  const [loadState, setLoadState] = useState<LoadState>({ kind: 'loading' });
  const [threshold, setThreshold] = useState('');
  const [horizon, setHorizon] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const applyResult = useCallback((r: SettingsResult) => {
    setThreshold(r.lowBalanceThresholdCents === null ? '' : formatCentsPlain(r.lowBalanceThresholdCents));
    setHorizon(String(r.projectionHorizonDays));
  }, []);

  const load = useCallback(async () => {
    setLoadState({ kind: 'loading' });
    setErrors({});
    setSaved(false);
    try {
      const res = await fetch(`/api/settings?today=${encodeURIComponent(localToday())}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { ok: true; result: SettingsResult };
      applyResult(body.result);
      setLoadState({ kind: 'ready' });
    } catch {
      setLoadState({ kind: 'error' });
    }
  }, [applyResult]);

  useEffect(() => {
    void load();
  }, [load]);

  // The shell's "Reset" control fires this after reseeding the workspace.
  useEffect(() => {
    const onReset = () => void load();
    window.addEventListener(DEMO_RESET_EVENT, onReset);
    return () => window.removeEventListener(DEMO_RESET_EVENT, onReset);
  }, [load]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaved(false);

    const next: FieldErrors = {};
    let thresholdText = '';
    if (threshold.trim() !== '') {
      const parsed = parseMoney(threshold, { allowZero: true });
      if (parsed.ok) thresholdText = formatCentsPlain(parsed.cents);
      else next.threshold = parsed.error;
    }
    const horizonText = horizon.trim();
    const horizonDays = /^\d+$/.test(horizonText) ? Number(horizonText) : NaN;
    if (!(horizonDays >= 1 && horizonDays <= 365)) next.horizon = HORIZON_ERROR;

    setErrors(next);
    if (next.threshold || next.horizon) return;

    setSaving(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threshold: thresholdText, horizon: horizonText, today: localToday() }),
      });
      const body = (await res.json().catch(() => null)) as
        | { ok: true; result: SettingsResult }
        | { ok: false; error: { message: string; field: string | null } }
        | null;
      if (res.ok && body?.ok) {
        applyResult(body.result);
        setSaved(true);
        dispatchRunwayChanged();
      } else if (body && !body.ok) {
        const { message, field } = body.error;
        if (field === 'threshold' || field === 'horizon') setErrors({ [field]: message });
        else setErrors({ form: message });
      } else {
        setErrors({ form: 'Something went wrong. Please try again.' });
      }
    } catch {
      setErrors({ form: 'Could not save settings. Please try again.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader title="Settings" subtitle="Tune the low-balance warning and how far ahead Runway looks." />
      <MobileTitle title="Settings" />
      <div className="flex max-w-2xl flex-col gap-5">
        {loadState.kind === 'loading' && (
          <Card>
            <p role="status" className="px-(--card-spacing) text-muted-foreground">
              Loading settings…
            </p>
          </Card>
        )}
        {loadState.kind === 'error' && (
          <Card>
            <div className="flex flex-wrap items-center gap-4 px-(--card-spacing)">
              <p role="alert" className="text-destructive">
                Settings failed to load. Please try again.
              </p>
              <Button type="button" variant="outline" onClick={() => void load()}>
                Retry
              </Button>
            </div>
          </Card>
        )}
        {loadState.kind === 'ready' && (
          <Card>
            <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5 px-(--card-spacing)">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="threshold" className="text-sm font-medium">
                  Low-balance threshold (dollars)
                </label>
                <input
                  id="threshold"
                  name="threshold"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={threshold}
                  onChange={(e) => setThreshold(e.target.value)}
                  aria-invalid={errors.threshold ? true : undefined}
                  aria-describedby={errors.threshold ? 'threshold-error threshold-hint' : 'threshold-hint'}
                  className={inputClass}
                />
                <p id="threshold-hint" className="text-xs text-muted-foreground">
                  Warn me when the runway drops below this amount. Leave empty for no warning.
                </p>
                {errors.threshold && (
                  <p id="threshold-error" role="alert" className="text-sm text-destructive">
                    {errors.threshold}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="horizon" className="text-sm font-medium">
                  Projection horizon (days)
                </label>
                <input
                  id="horizon"
                  name="horizon"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={horizon}
                  onChange={(e) => setHorizon(e.target.value)}
                  aria-invalid={errors.horizon ? true : undefined}
                  aria-describedby={errors.horizon ? 'horizon-error horizon-hint' : 'horizon-hint'}
                  className={inputClass}
                />
                <p id="horizon-hint" className="text-xs text-muted-foreground">
                  How many days to project when no income is scheduled. 1 to 365.
                </p>
                {errors.horizon && (
                  <p id="horizon-error" role="alert" className="text-sm text-destructive">
                    {errors.horizon}
                  </p>
                )}
              </div>

              {errors.form && (
                <p role="alert" className="text-sm text-destructive">
                  {errors.form}
                </p>
              )}

              <div className="flex items-center gap-3">
                <Button type="submit" disabled={saving}>
                  {saving ? 'Saving…' : 'Save settings'}
                </Button>
                {saved && (
                  <p role="status" className="text-sm text-muted-foreground">
                    Settings saved.
                  </p>
                )}
              </div>
            </form>
          </Card>
        )}
        <p className="text-sm text-muted-foreground">
          Editing schedules and accounts is not available yet.
        </p>
      </div>
    </>
  );
}
