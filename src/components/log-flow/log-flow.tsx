'use client';

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useLogFlow, type LogFlowMode } from './log-flow-context';
import { OneOffForm } from './one-off-form';
import { PostActualForm } from './post-actual-form';
import { PurchaseForm } from './purchase-form';

const MODES: { mode: LogFlowMode; label: string }[] = [
  { mode: 'post', label: 'Mark paid' },
  { mode: 'purchase', label: 'Add purchase' },
  { mode: 'one-off', label: 'Add one-off' },
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
      className="fixed inset-y-0 right-0 m-0 h-dvh max-h-none w-[min(30rem,100vw)] max-w-none overflow-y-auto rounded-none border-0 border-l border-border bg-card p-0 text-card-foreground backdrop:bg-black/40 open:animate-in open:slide-in-from-right md:rounded-l-xl"
    >
      {open ? (
        <div className="flex min-h-full flex-col">
          <div className="flex items-center justify-between px-6 pt-6">
            <h2 id="log-flow-title" className="text-xl font-semibold tracking-tight">
              Log activity
            </h2>
            <Button type="button" variant="ghost" size="icon" onClick={closeLogFlow} aria-label="Close">
              <X aria-hidden="true" />
            </Button>
          </div>
          <div role="group" aria-label="Log mode" className="mt-4 grid grid-cols-3 border-b border-border px-6">
            {MODES.map(({ mode, label }) => {
              const active = open.mode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={active}
                  onClick={() => open.mode !== mode && openLogFlow({ mode })}
                  className={cn(
                    '-mb-px border-b-2 px-2 py-2.5 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
                    active
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground',
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <div className="flex-1 px-6 py-6">
            {open.mode === 'post' ? <PostActualForm key="post" entryRef={open.entryRef} /> : null}
            {open.mode === 'purchase' ? <PurchaseForm key="purchase" /> : null}
            {open.mode === 'one-off' ? <OneOffForm key="one-off" /> : null}
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
