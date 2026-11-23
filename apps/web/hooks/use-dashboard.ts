'use client';

import { useState } from 'react';
import { copyText } from '../lib/clipboard';
import type { Activity } from '../lib/demo';
import { initialWorkspaceMode, type WorkspaceMode } from '../lib/workspace';
import { useAgentPolicy } from './use-agent-policy';
import { useDemoStore } from './use-demo-store';
import { useFunds } from './use-funds';
import { useLocalWorkspace } from './use-local-workspace';
import { useNotification } from './use-notification';

export type ActivityFilter = 'all' | 'settled' | 'blocked';

export function useDashboard() {
  const [mode, setMode] = useState<WorkspaceMode>(initialWorkspaceMode);
  const { state, setState, ready: demoReady } = useDemoStore(mode === 'demo');
  const notification = useNotification();
  const [filter, setFilter] = useState<ActivityFilter>('all');
  const local = useLocalWorkspace(mode === 'local');
  const demo = mode === 'demo';

  function liveUnavailable() {
    if (demo && !demoReady) {
      notification.notify('Restoring your saved demo. Controls will be ready in a moment.');
      return;
    }
    notification.notify(
      mode === 'local'
        ? 'Local workspace is read-only. Owner signing controls are not connected; no transaction was sent.'
        : 'Live transactions need a deployed program, owner wallet integration, and a verified RPC connection. Nothing has been signed or sent.',
    );
  }

  const actions = {
    demo: demo && demoReady,
    setState,
    notify: notification.notify,
    liveUnavailable,
  };
  const policy = useAgentPolicy(actions);
  const funds = useFunds({ ...actions, balance: state.balance });
  const workspace = demo ? state : mode === 'local' ? local.snapshot : null;
  const agents = workspace?.agents ?? [];
  const activities = (workspace?.activity ?? []).filter(
    (item) => filter === 'all' || item.status === filter,
  );

  function changeMode(nextMode: WorkspaceMode) {
    local.reset();
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
    if (mode !== 'local' || !local.snapshot?.vaultConfig) return;
    const copied = await copyText(local.snapshot.vaultConfig, 'copy-vault-config');
    notification.notify(
      copied
        ? 'Public vault config copied. Use it as BRIM_VAULT_CONFIG in your agent runtime.'
        : 'Clipboard access is unavailable in this browser.',
    );
  }

  return {
    mode,
    demo,
    demoReady,
    ready: workspace !== null,
    balance: workspace?.balance ?? null,
    localStatus: local.status,
    localPaused: local.snapshot?.isPaused ?? false,
    indexedSpend: local.snapshot?.indexedSpend ?? 0,
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
    canCopyVaultConfig: mode === 'local' && Boolean(local.snapshot?.vaultConfig),
    activeCount: agents.filter((agent) => !agent.frozen).length,
    spent: agents.reduce((total, agent) => total + agent.spent, 0),
    budget: agents.reduce((total, agent) => total + agent.budget, 0),
  };
}
