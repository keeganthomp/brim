'use client';

import { useRef, useState } from 'react';
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
import { useLocalTestPayment } from './use-local-test-payment';

export type ActivityFilter = 'all' | 'settled' | 'blocked';

export function useDashboard() {
  const [mode, setMode] = useState<WorkspaceMode>(initialWorkspaceMode);
  const { state, setState, ready: demoReady } = useDemoStore(mode === 'demo');
  const notification = useNotification();
  const [filter, setFilter] = useState<ActivityFilter>('all');
  const ownerWallet = useOwnerWallet();
  const connection = ownerWallet.wallet?.connection;
  const liveConnection = connection?.initialized
    ? { vaultConfig: connection.vaultConfig, rpcUrl: liveVault?.rpcUrl }
    : !connection && liveVault && 'vaultConfig' in liveVault
      ? liveVault
      : undefined;
  const chain = useChainWorkspace(
    mode === 'local' || mode === 'live' ? mode : null,
    liveConnection,
  );
  const [creatingVault, setCreatingVault] = useState(false);
  const creatingRef = useRef(false);
  const demo = mode === 'demo';
  const localWrites = mode === 'local' && Boolean(chain.snapshot?.policyWritesEnabled);
  const connectedOwner = Boolean(
    mode === 'live' &&
    connection &&
    (!chain.snapshot?.ownerAddress || connection.ownerAddress === chain.snapshot.ownerAddress),
  );
  const vaultInitialized = Boolean(chain.snapshot || (mode === 'live' && connection?.initialized));
  const canFundVault = mode === 'live' && connectedOwner && Boolean(chain.snapshot);
  const canCreateVault = connectedOwner && !vaultInitialized;
  const setup = chain.snapshot?.vaultConfig
    ? {
        vaultConfig: chain.snapshot.vaultConfig,
        rpcUrl: mode === 'local' ? chain.snapshot.rpcUrl : liveVault?.rpcUrl,
      }
    : undefined;

  function liveUnavailable() {
    if (demo && !demoReady) {
      notification.notify('Restoring your saved demo. Controls will be ready in a moment.');
      return;
    }
    notification.notify(
      mode === 'local'
        ? 'Start Brim locally with npm run dev to register a test agent.'
        : 'Connect your owner wallet and open a vault first.',
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
    saveLivePolicy: canFundVault ? ownerWallet.save : undefined,
    freezeLiveAgent: canFundVault && !chain.snapshot?.isPaused ? ownerWallet.freeze : undefined,
    setup,
    onChainChange: chain.refresh,
  });
  const workspace = demo ? state : chain.snapshot;
  const funds = useFunds({
    ...actions,
    balance: workspace?.balance ?? 0,
    workspaceMode: mode,
    transfer: canFundVault ? ownerWallet.transfer : undefined,
    onChainChange: chain.refresh,
  });
  const localPayment = useLocalTestPayment(localWrites, chain.refresh);
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

  async function createVault() {
    if (!canCreateVault || creatingRef.current) return;
    creatingRef.current = true;
    setCreatingVault(true);
    try {
      const result = await ownerWallet.createVault();
      if (!result.success) notification.notify(result.message);
      else notification.notify('Vault created. Add USDC to fund it.');
      chain.refresh();
    } finally {
      creatingRef.current = false;
      setCreatingVault(false);
    }
  }

  async function selectActivity(item: Activity) {
    if (demo || !item.signature) return;
    const copied = await copyText(item.signature, 'copy-signature');
    const message = copied
      ? 'Transaction signature copied.'
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
    vaultInitialized,
    canCreateVault,
    creatingVault,
    createVault,
    canFundVault,
    canWritePolicy: policy.canEdit,
    localPayment,
    activityAvailable: demo || Boolean(chain.snapshot?.activityAvailable),
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
