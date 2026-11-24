'use client';

import { useRef, useState } from 'react';
import type { Effect as WalletEffect } from 'effect/Effect';
import { loadOwnerWallet } from '../lib/deferred-actions';
import type { Agent } from '../lib/demo';
import type { PolicyIntent, PolicySaveError } from '../lib/chain/policy-input';
import { liveVault } from '../lib/live/config';
import type {
  OwnerWalletConfig,
  OwnerWalletConnection,
  OwnerWalletError,
  WalletChoice,
} from '../lib/live/owner-wallet';

type WalletAdapter = Awaited<ReturnType<typeof loadOwnerWallet>>;
type WalletAction = (
  adapter: WalletAdapter,
  connection: OwnerWalletConnection,
  config: OwnerWalletConfig,
) => WalletEffect<{ signature: string }, OwnerWalletError | PolicySaveError>;
type Transfer = { mode: 'deposit' | 'withdraw'; amount: bigint };

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
        setError('Open a compatible Solana wallet, then try again.');
        return;
      }
      if (picked.length > 1) {
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

  async function runAction(action: WalletAction) {
    if (!wallet || !liveVault)
      return { success: false as const, message: 'Connect the vault owner wallet first.' };
    if (savingRef.current)
      return { success: false as const, message: 'Finish the pending action in your wallet.' };
    savingRef.current = true;
    try {
      const [adapter, Effect] = await Promise.all([loadOwnerWallet(), import('effect/Effect')]);
      return await Effect.runPromise(
        action(adapter, wallet.connection, liveVault).pipe(
          Effect.match({
            onSuccess: ({ signature }) => ({ success: true as const, signature }),
            onFailure: (failure) => ({
              success: false as const,
              message: failure.message,
              ...('signature' in failure && failure.signature
                ? { signature: failure.signature }
                : {}),
            }),
          }),
        ),
      );
    } catch {
      return {
        success: false as const,
        message: 'Check your wallet and refresh the vault before trying again.',
      };
    } finally {
      savingRef.current = false;
    }
  }

  async function createVault() {
    const previous = wallet?.connection;
    const result = await runAction((adapter, connection, config) =>
      adapter.initializeOwnerVault(connection, config),
    );
    if (result.success)
      setWallet((current) =>
        current && current.connection === previous
          ? {
              ...current,
              connection: { ...current.connection, initialized: true },
            }
          : current,
      );
    return result;
  }

  async function save(draft: Agent, intent: PolicyIntent) {
    const [Effect, { preparePolicyInput }] = await Promise.all([
      import('effect/Effect'),
      import('../lib/chain/policy-input'),
    ]);
    return runAction((adapter, connection, config) =>
      preparePolicyInput(draft).pipe(
        Effect.flatMap((input) =>
          adapter.submitOwnerPolicy(connection, config, { ...input, intent }),
        ),
      ),
    );
  }

  function transfer({ mode, amount }: Transfer) {
    return runAction((adapter, connection, config) =>
      mode === 'deposit'
        ? adapter.depositOwnerFunds(connection, config, { amount })
        : adapter.withdrawOwnerFunds(connection, config, { amount }),
    );
  }

  function freeze(agentKey: string, isFrozen: boolean) {
    return runAction((adapter, connection, config) =>
      adapter.setOwnerAgentFrozen(connection, config, { agentKey, isFrozen }),
    );
  }

  return {
    choices,
    wallet,
    connecting,
    error,
    connect,
    save,
    createVault,
    transfer,
    freeze,
    disconnect: () => {
      if (savingRef.current) return;
      setWallet(undefined);
      setChoices([]);
      setError('');
    },
  };
}

export type OwnerWalletController = ReturnType<typeof useOwnerWallet>;
