'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';

export type LogFlowMode = 'post' | 'purchase' | 'one-off';

export interface OpenLogFlowArgs {
  mode: LogFlowMode;
  /** Entry id (generated entries use "<scheduleId>:<YYYY-MM-DD>") preselected in post mode. */
  entryRef?: string;
}

export interface LogFlowContextValue {
  /** Null while the dialog is closed. */
  open: OpenLogFlowArgs | null;
  openLogFlow: (args: OpenLogFlowArgs) => void;
  closeLogFlow: () => void;
}

const LogFlowContext = createContext<LogFlowContextValue | null>(null);

export function LogFlowProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState<OpenLogFlowArgs | null>(null);
  const openLogFlow = useCallback((args: OpenLogFlowArgs) => setOpen(args), []);
  const closeLogFlow = useCallback(() => setOpen(null), []);
  const value = useMemo(
    () => ({ open, openLogFlow, closeLogFlow }),
    [open, openLogFlow, closeLogFlow],
  );
  return <LogFlowContext.Provider value={value}>{children}</LogFlowContext.Provider>;
}

export function useLogFlow(): LogFlowContextValue {
  const ctx = useContext(LogFlowContext);
  if (!ctx) throw new Error('useLogFlow must be used inside LogFlowProvider');
  return ctx;
}
