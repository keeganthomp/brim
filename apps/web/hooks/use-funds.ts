'use client';

import { useRef, useState, type FormEvent } from 'react';
import { loadFundsActions } from '../lib/deferred-actions';
import type { FundsMode } from '../lib/funds';
import { type Activity } from '../lib/demo';
import { dollars } from '../lib/currency';
import type { WorkspaceMode } from '../lib/workspace';
import type { OwnerWalletController } from './use-owner-wallet';
import type { DemoActions } from './types';

export type { FundsMode } from '../lib/funds';

export function useFunds({
  demo,
  setState,
  notify,
  liveUnavailable,
  balance,
  workspaceMode,
  transfer,
  onChainChange,
}: DemoActions & {
  balance: number;
  workspaceMode: WorkspaceMode;
  transfer?: OwnerWalletController['transfer'] | undefined;
  onChainChange: () => void;
}) {
  const [mode, setMode] = useState<FundsMode | null>(null);
  const [amount, setAmount] = useState('500');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const revision = useRef(0);
  const pendingRevision = useRef<number | null>(null);
  const inputPattern = demo ? /^\d*\.?\d{0,2}$/ : /^\d*\.?\d{0,6}$/;
  const inputLimit = demo ? 10 : 21;

  function invalidateSubmission() {
    revision.current += 1;
    pendingRevision.current = null;
  }

  function close() {
    invalidateSubmission();
    setMode(null);
  }

  function open(nextMode: FundsMode) {
    if (busy) return;
    if (!demo && !transfer) return liveUnavailable();
    invalidateSubmission();
    setMode(nextMode);
    setAmount(demo ? '500' : '');
    setError('');
  }

  function editAmount(value: string) {
    if (!busy && inputPattern.test(value) && value.length <= inputLimit) {
      invalidateSubmission();
      setAmount(value);
      setError('');
    }
  }

  function addKey(key: string) {
    if (busy) return;
    invalidateSubmission();
    if (key === 'back') return setAmount((value) => value.slice(0, -1));
    setAmount((value) => {
      const next = !value && key === '.' ? '0.' : value === '0' && key !== '.' ? key : value + key;
      return next.length <= inputLimit && inputPattern.test(next) ? next : value;
    });
    setError('');
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if ((!demo && !transfer) || !mode || busy || pendingRevision.current !== null) return;
    const currentRevision = revision.current;
    pendingRevision.current = currentRevision;
    setBusy(true);
    try {
      const { validateDemoTransfer, parseLiveTransfer } = await loadFundsActions();
      if (revision.current !== currentRevision) return;
      if (!demo && transfer) {
        const units = parseLiveTransfer(amount);
        if (units === undefined)
          return setError('Enter a positive USDC amount with up to six decimals.');
        const result = await transfer({ mode, amount: units });
        onChainChange();
        if (revision.current !== currentRevision) return;
        if (!result.success) return setError(result.message);
        close();
        notify(mode === 'deposit' ? 'Funds added.' : 'Withdrawal confirmed.');
        return;
      }
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
      setBusy(false);
    }
  }

  return {
    mode,
    amount,
    error,
    workspaceMode,
    busy,
    open,
    editAmount,
    addKey,
    submit,
    close,
  };
}

export type FundsController = ReturnType<typeof useFunds>;
