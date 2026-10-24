'use client';

import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { useLogFlow, type LogFlowMode } from './log-flow-context';
import { OneOffForm } from './one-off-form';
import { PostActualForm } from './post-actual-form';
import { PurchaseForm } from './purchase-form';

const MODES: { mode: LogFlowMode; label: string }[] = [
  { mode: 'post', label: 'Post an actual' },
  { mode: 'purchase', label: 'Add a purchase' },
  { mode: 'one-off', label: 'Add a one-off' },
];

/** Modal Log_Flow dialog. Forms mount per mode, so each opened form gets its own Submission_Key. */
export function LogFlow() {
  const { open, openLogFlow, closeLogFlow } = useLogFlow();
  const ref = useRef<HTMLDialogElement>(null);
  const isOpen = open !== null;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) dialog.showModal();
    if (!isOpen && dialog.open) dialog.close();
  }, [isOpen]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="log-flow-title"
      onClose={closeLogFlow}
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-xl border border-border bg-card p-5 text-card-foreground backdrop:bg-black/40"
    >
      {open ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 id="log-flow-title" className="text-lg font-semibold">
              Log
            </h2>
            <Button type="button" variant="ghost" size="sm" onClick={closeLogFlow}>
              Close
            </Button>
          </div>
          <div role="group" aria-label="Log mode" className="flex gap-1">
            {MODES.map(({ mode, label }) => (
              <Button
                key={mode}
                type="button"
                size="sm"
                variant={open.mode === mode ? 'default' : 'outline'}
                aria-pressed={open.mode === mode}
                onClick={() => open.mode !== mode && openLogFlow({ mode })}
              >
                {label}
              </Button>
            ))}
          </div>
          {open.mode === 'post' ? <PostActualForm key="post" entryRef={open.entryRef} /> : null}
          {open.mode === 'purchase' ? <PurchaseForm key="purchase" /> : null}
          {open.mode === 'one-off' ? <OneOffForm key="one-off" /> : null}
        </div>
      ) : null}
    </dialog>
  );
}
