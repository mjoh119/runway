'use client';

import { useEffect, useState } from 'react';
import { formatMonthDay } from '@/lib/format';
import { weekdayAbbr } from '@/lib/projection/dates';

/** "Today is Fri, Oct 23" from the visitor's local date; empty until mounted (avoids hydration mismatch). */
export function TodayLabel({ className }: { className?: string }) {
  const [text, setText] = useState('');
  useEffect(() => {
    const today = new Date().toLocaleDateString('en-CA');
    setText(`Today is ${weekdayAbbr(today)}, ${formatMonthDay(today)}`);
  }, []);
  return <p className={className}>{text || '\u00a0'}</p>;
}
