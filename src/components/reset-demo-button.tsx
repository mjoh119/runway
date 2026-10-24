'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

export interface ResetDemoButtonProps {
  /** Called after a successful reset so the page can refresh the projection. */
  onReset: () => void | Promise<void>;
}

/**
 * Reseeds the calling visitor's workspace (Requirement 1.4).
 * Today is the visitor's local date, never derived from toISOString.
 */
export function ResetDemoButton({ onReset }: ResetDemoButtonProps) {
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
      await onReset();
    } catch {
      setError('Could not reset the demo. Please try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button type="button" variant="outline" onClick={handleClick} disabled={pending}>
        {pending ? 'Resetting…' : 'Reset demo'}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
