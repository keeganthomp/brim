'use client';

import { useRef, useState } from 'react';
import { loadOwnerWallet } from '../lib/deferred-actions';
import type { Agent } from '../lib/demo';
import type { PolicyIntent } from '../lib/chain/policy-input';
import { liveVault } from '../lib/live/config';
import type { OwnerWalletConnection, WalletChoice } from '../lib/live/owner-wallet';

export function useOwnerWallet() {
  const [choices, setChoices] = useState<WalletChoice[]>([]);
  const [wallet, setWallet] = useState<{ name: string; connection: OwnerWalletConnection }>();
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');
  const connectingRef = useRef(false);
  const savingRef = useRef(false);

  async function connect(choice?: WalletChoice) {
    if (!liveVault || connectingRef.current) return;
    connectingRef.current = true;
    setConnecting(true);
    setError('');
    try {
      const [adapter, Effect] = await Promise.all([loadOwnerWallet(), import('effect/Effect')]);
      const picked = choice
        ? [choice]
        : await Effect.runPromise(adapter.discoverOwnerWallets(liveVault));
      if (!picked.length) {
        setError('Open a Solana wallet with the vault owner’s account, then try again.');
        return;
      }
      if (picked.length > 1 && !picked[0]?.connected) {
        setChoices(picked);
        return;
      }
      const selected = picked[0]!;
      const result = await Effect.runPromise(
        adapter.connectOwnerWallet(selected, liveVault).pipe(Effect.result),
      );
      if (result._tag === 'Failure') {
        setError(result.failure.message);
        return;
      }
      setWallet({ name: selected.name, connection: result.success });
      setChoices([]);
    } catch {
      setError('Could not connect your wallet. Try again.');
    } finally {
      connectingRef.current = false;
      setConnecting(false);
    }
  }

  async function save(draft: Agent, intent: PolicyIntent) {
    const config = liveVault;
    if (!wallet || !config)
      return { success: false as const, message: 'Connect the vault owner wallet first.' };
    if (savingRef.current)
      return {
        success: false as const,
        message: 'Finish the pending policy change in your wallet.',
      };
    savingRef.current = true;
    try {
      const [adapter, Effect, { preparePolicyInput }] = await Promise.all([
        loadOwnerWallet(),
        import('effect/Effect'),
        import('../lib/chain/policy-input'),
      ]);
      return await Effect.runPromise(
        preparePolicyInput(draft).pipe(
          Effect.flatMap((input) =>
            adapter.submitOwnerPolicy(wallet.connection, config, { ...input, intent }),
          ),
          Effect.match({
            onSuccess: () => ({ success: true as const }),
            onFailure: (failure) => ({ success: false as const, message: failure.message }),
          }),
        ),
      );
    } finally {
      savingRef.current = false;
    }
  }

  return {
    choices,
    wallet,
    connecting,
    error,
    connect,
    save,
    disconnect: () => {
      setWallet(undefined);
      setChoices([]);
      setError('');
    },
  };
}

export type OwnerWalletController = ReturnType<typeof useOwnerWallet>;
