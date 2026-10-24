'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

/** Window event fired after a successful reset so any mounted page can refetch. */
export const DEMO_RESET_EVENT = 'runway:demo-reset';

export interface ResetDemoButtonProps {
  /** Optional extra callback after a successful reset. */
  onReset?: () => void | Promise<void>;
  className?: string;
}

/**
 * "Demo data · Reset": reseeds the calling visitor's workspace (Requirement 1.4).
 * Today is the visitor's local date, never derived from toISOString.
 */
export function ResetDemoButton({ onReset, className }: ResetDemoButtonProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setPending(true);
    setError(null);
    try {
      const today = new Date().toLocaleDateString('en-CA');
      const res = await fetch(`/api/workspace/reset?today=${encodeURIComponent(today)}`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error(`Reset failed (${res.status})`);
      window.dispatchEvent(new Event(DEMO_RESET_EVENT));
      await onReset?.();
    } catch {
      setError('Could not reset the demo. Please try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={cn('flex flex-col items-start gap-1 text-xs text-muted-foreground', className)}>
      <p>
        Demo data ·{' '}
        <button
          type="button"
          onClick={handleClick}
          disabled={pending}
          className="rounded-sm font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50"
        >
          {pending ? 'Resetting…' : 'Reset'}
        </button>
      </p>
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
