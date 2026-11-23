'use client';

import { useState } from 'react';
import { copyText } from '../lib/clipboard';
import type { Activity } from '../lib/demo';
import { liveVault } from '../lib/live/config';
import { initialWorkspaceMode, type WorkspaceMode } from '../lib/workspace';
import { useAgentPolicy } from './use-agent-policy';
import { useDemoStore } from './use-demo-store';
import { useFunds } from './use-funds';
import { useChainWorkspace } from './use-chain-workspace';
import { useNotification } from './use-notification';
import { useOwnerWallet } from './use-owner-wallet';

export type ActivityFilter = 'all' | 'settled' | 'blocked';

export function useDashboard() {
  const [mode, setMode] = useState<WorkspaceMode>(initialWorkspaceMode);
  const { state, setState, ready: demoReady } = useDemoStore(mode === 'demo');
  const notification = useNotification();
  const [filter, setFilter] = useState<ActivityFilter>('all');
  const chain = useChainWorkspace(mode === 'local' || (mode === 'live' && liveVault) ? mode : null);
  const ownerWallet = useOwnerWallet();
  const demo = mode === 'demo';
  const localWrites = mode === 'local' && Boolean(chain.snapshot?.policyWritesEnabled);
  const connectedOwner = Boolean(
    mode === 'live' &&
    chain.snapshot?.ownerAddress &&
    ownerWallet.wallet?.connection.ownerAddress === chain.snapshot.ownerAddress,
  );

  function liveUnavailable() {
    if (demo && !demoReady) {
      notification.notify('Restoring your saved demo. Controls will be ready in a moment.');
      return;
    }
    notification.notify(
      mode === 'local'
        ? 'Start Brim locally with npm run dev to register a test agent.'
        : 'Connect the vault owner wallet to edit policies.',
    );
  }

  const actions = {
    demo: demo && demoReady,
    setState,
    notify: notification.notify,
    liveUnavailable,
  };
  const policy = useAgentPolicy({
    ...actions,
    mode,
    localWrites,
    saveLivePolicy: connectedOwner ? ownerWallet.save : undefined,
    onChainChange: chain.refresh,
  });
  const funds = useFunds({ ...actions, balance: state.balance });
  const workspace = demo ? state : chain.snapshot;
  const agents = workspace?.agents ?? [];
  const activities = (workspace?.activity ?? []).filter(
    (item) => filter === 'all' || item.status === filter,
  );

  function changeMode(nextMode: WorkspaceMode) {
    if (nextMode === mode) return;
    chain.reset();
    policy.close();
    funds.close();
    setMode(nextMode);
    setFilter('all');
  }

  async function selectActivity(item: Activity) {
    if (mode !== 'local' || !item.signature) return;
    const copied = await copyText(item.signature, 'copy-signature');
    const message = copied
      ? 'Verified local transaction signature copied.'
      : 'Clipboard access is unavailable in this browser.';
    notification.notify(message);
  }

  async function copyVaultConfig() {
    if (demo || !chain.snapshot?.vaultConfig) return;
    const copied = await copyText(chain.snapshot.vaultConfig, 'copy-vault-config');
    notification.notify(
      copied ? 'Vault config copied.' : 'Clipboard access is unavailable in this browser.',
    );
  }

  return {
    mode,
    demo,
    demoReady,
    ready: workspace !== null,
    balance: workspace?.balance ?? null,
    chainStatus: chain.status,
    chainPaused: chain.snapshot?.isPaused ?? false,
    liveConfigured: Boolean(liveVault),
    ownerWallet,
    connectedOwner,
    canWritePolicy: policy.canEdit,
    indexedSpend: chain.snapshot?.indexedSpend ?? 0,
    agents,
    activities,
    filter,
    setFilter,
    changeMode,
    policy,
    funds,
    notification,
    selectActivity,
    copyVaultConfig,
    canCopyVaultConfig: !demo && Boolean(chain.snapshot?.vaultConfig),
  };
}
