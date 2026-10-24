import { describe, expect, it } from 'vitest';
import {
  createSubmissionSession,
  postPrefill,
  purchasePrefill,
} from '@/components/log-flow/log-flow-state';
import { formatCentsPlain } from '@/lib/money';

// No DOM/React testing setup exists (node environment, no jsdom or
// testing-library), so these tests cover the pure helpers the hook and forms use.

describe('Log_Flow pre-fill values', () => {
  it('post form pre-fills the estimate via formatCentsPlain and today', () => {
    expect(postPrefill(120500, '2025-03-14', formatCentsPlain)).toEqual({
      amount: '1205.00',
      actualDate: '2025-03-14',
    });
  });

  it('uses the absolute estimate for outflows', () => {
    expect(postPrefill(-4599, '2025-03-14', formatCentsPlain).amount).toBe('45.99');
  });

  it('purchase form pre-fills today with an empty amount', () => {
    expect(purchasePrefill('2025-03-14')).toEqual({ amount: '', purchaseDate: '2025-03-14' });
  });
});

describe('Submission_Key', () => {
  it('is reused across attempts within one opened form', () => {
    let n = 0;
    const session = createSubmissionSession(() => `key-${++n}`);
    const attempts = [session.key, session.key, session.key];
    expect(new Set(attempts).size).toBe(1);
    expect(n).toBe(1);
  });

  it('generates no new key until the form reopens', () => {
    let n = 0;
    const gen = () => `key-${++n}`;
    const first = createSubmissionSession(gen);
    void first.key;
    void first.key;
    expect(n).toBe(1);
    const reopened = createSubmissionSession(gen);
    expect(reopened.key).not.toBe(first.key);
    expect(n).toBe(2);
  });
});
