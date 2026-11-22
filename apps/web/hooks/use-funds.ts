'use client';

import { useRef, useState, type FormEvent } from 'react';
import { loadFundsActions } from '../lib/deferred-actions';
import type { FundsMode } from '../lib/funds';
import { type Activity } from '../lib/demo';
import { dollars } from '../lib/currency';
import type { DemoActions } from './types';

export type { FundsMode } from '../lib/funds';

export function useFunds({
  demo,
  setState,
  notify,
  liveUnavailable,
  balance,
}: DemoActions & { balance: number }) {
  const [mode, setMode] = useState<FundsMode | null>(null);
  const [amount, setAmount] = useState('500');
  const [error, setError] = useState('');
  const revision = useRef(0);
  const pendingRevision = useRef<number | null>(null);

  function invalidateSubmission() {
    revision.current += 1;
    pendingRevision.current = null;
  }

  function close() {
    invalidateSubmission();
    setMode(null);
  }

  function open(nextMode: FundsMode) {
    if (!demo) return liveUnavailable();
    invalidateSubmission();
    setMode(nextMode);
    setAmount('500');
    setError('');
  }

  function editAmount(value: string) {
    if (/^\d*\.?\d{0,2}$/.test(value) && value.length <= 10) {
      invalidateSubmission();
      setAmount(value);
      setError('');
    }
  }

  function addKey(key: string) {
    invalidateSubmission();
    if (key === 'back') return setAmount((value) => value.slice(0, -1));
    setAmount((value) => {
      if (key === '.' && value.includes('.')) return value;
      if (value.length >= 9 || (value.includes('.') && value.split('.')[1]!.length >= 2))
        return value;
      return value === '0' && key !== '.' ? key : value + key;
    });
    setError('');
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!demo || !mode || pendingRevision.current !== null) return;
    const currentRevision = revision.current;
    pendingRevision.current = currentRevision;
    try {
      const { validateDemoTransfer } = await loadFundsActions();
      const result = await validateDemoTransfer(mode, amount, balance);
      if (revision.current !== currentRevision) return;
      if (!result.success) return setError(result.message);
      const value = result.value;
      const activity: Activity = {
        id: crypto.randomUUID(),
        merchant: mode === 'deposit' ? 'Demo deposit' : 'Demo withdrawal',
        agent: 'Treasury',
        amount: value,
        status: mode === 'deposit' ? 'deposit' : 'withdrawal',
        time: 'Just now',
      };
      setState((previous) => ({
        ...previous,
        balance: Math.round((previous.balance + (mode === 'deposit' ? value : -value)) * 100) / 100,
        activity: [activity, ...previous.activity].slice(0, 100),
      }));
      close();
      notify(
        `${dollars(value)} ${mode === 'deposit' ? 'added to' : 'withdrawn from'} the demo balance. No funds moved on-chain.`,
      );
    } catch {
      if (revision.current === currentRevision)
        setError('Funding controls could not load. Please try again.');
    } finally {
      if (pendingRevision.current === currentRevision) pendingRevision.current = null;
    }
  }

  return {
    mode,
    amount,
    error,
    open,
    editAmount,
    addKey,
    submit,
    close,
  };
}

export type FundsController = ReturnType<typeof useFunds>;
