'use client';

import { useRef, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react';
import { loadLocalPolicies, loadPolicyActions } from '../lib/deferred-actions';
import { newDemoAgent } from '../lib/new-demo-agent';
import { copySdkTemplate, copyText } from '../lib/clipboard';
import type { Agent } from '../lib/demo';
import type { WorkspaceMode } from '../lib/workspace';
import type { OwnerWalletController } from './use-owner-wallet';
import type { LiveWorkspaceConnection } from '../lib/live/client';
import { usePolicyConnection } from './use-policy-connection';
import type { DemoActions } from './types';

interface PolicyActions extends DemoActions {
  mode: WorkspaceMode;
  localWrites: boolean;
  saveLivePolicy?: OwnerWalletController['save'] | undefined;
  freezeLiveAgent?: OwnerWalletController['freeze'] | undefined;
  setup?: LiveWorkspaceConnection | undefined;
  onChainChange: () => void;
}

export function useAgentPolicy({
  mode,
  demo,
  setState,
  notify,
  liveUnavailable,
  localWrites,
  saveLivePolicy,
  freezeLiveAgent,
  setup,
  onChainChange,
}: PolicyActions) {
  const [draft, setDraftState] = useState<Agent | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [isFreezing, setIsFreezing] = useState(false);
  const connection = usePolicyConnection(setup);
  const revision = useRef(0);
  const pendingRevision = useRef<number | null>(null);
  const canEdit = demo || localWrites || Boolean(saveLivePolicy);

  const setDraft: Dispatch<SetStateAction<Agent | null>> = (next) => {
    revision.current += 1;
    pendingRevision.current = null;
    setBusy(false);
    setIsFreezing(false);
    connection.reset();
    setDraftState(next);
  };

  function openAgent(agent?: Agent) {
    if (!canEdit && !(mode !== 'demo' && agent)) return liveUnavailable();
    if (localWrites) void loadLocalPolicies().catch(() => undefined);
    setCreating(!agent);
    const next = agent ? { ...agent } : newDemoAgent();
    setDraft(!agent && mode !== 'demo' ? { ...next, minTxInterval: 3 } : next);
    setError('');
  }

  async function freezeAgent(agent: Agent, frozen: boolean) {
    if (pendingRevision.current !== null) return;
    if (!demo) {
      if (!freezeLiveAgent || !agent.agentKey) return liveUnavailable();
      const currentRevision = revision.current;
      pendingRevision.current = currentRevision;
      setBusy(true);
      setIsFreezing(true);
      setError('');
      try {
        const result = await freezeLiveAgent(agent.agentKey, frozen);
        onChainChange();
        if (revision.current !== currentRevision) return;
        if (!result.success) return setError(result.message);
        setDraft(null);
        notify(frozen ? 'Agent frozen.' : 'Agent resumed.');
      } finally {
        if (pendingRevision.current === currentRevision) {
          pendingRevision.current = null;
          setIsFreezing(false);
          setBusy(false);
        }
      }
      return;
    }
    setState((previous) => ({
      ...previous,
      agents: previous.agents.map((item) => (item.id === agent.id ? { ...item, frozen } : item)),
    }));
    if (draft?.id === agent.id) setDraft(null);
    notify(`${agent.name} ${frozen ? 'frozen' : 'resumed'} in Demo.`);
  }

  async function saveAgent(event: FormEvent) {
    event.preventDefault();
    if (!draft || !canEdit || pendingRevision.current !== null) return;
    const currentRevision = revision.current;
    pendingRevision.current = currentRevision;
    setBusy(true);
    setError('');
    try {
      if (mode !== 'demo') {
        const save = localWrites ? (await loadLocalPolicies()).saveLocalPolicy : saveLivePolicy;
        if (revision.current !== currentRevision) return;
        if (!save) return setError('Owner authorization is required.');
        const result = await save(draft, creating ? 'create' : 'update');
        onChainChange();
        if (revision.current !== currentRevision) return;
        if (!result.success) return setError(result.message);
        setDraft(null);
        notify(creating ? 'Agent registered.' : 'Policy updated.');
        return;
      }
      const { validateDemoPolicy } = await loadPolicyActions();
      const result = await validateDemoPolicy(draft);
      // Editing or closing while validation loads invalidates that submission.
      if (revision.current !== currentRevision) return;
      if (!result.success) return setError(result.message);
      const saved = result.value;
      setState((previous) => ({
        ...previous,
        agents: creating
          ? [...previous.agents, saved]
          : previous.agents.map((agent) => (agent.id === saved.id ? saved : agent)),
      }));
      setDraft(null);
      notify(`Demo policy ${creating ? 'added' : 'updated'}.`);
    } catch {
      if (revision.current === currentRevision)
        setError('Policy controls could not load. Please try again.');
    } finally {
      if (pendingRevision.current === currentRevision) {
        pendingRevision.current = null;
        setBusy(false);
      }
    }
  }

  async function copyConfig() {
    const copied = await copySdkTemplate(
      setup?.vaultConfig,
      setup?.rpcUrl,
      mode === 'local' ? 'http://127.0.0.1:4020/report' : undefined,
    );
    notify(copied ? 'Setup copied.' : 'Clipboard access is unavailable in this browser.');
  }

  async function copyAgentKey() {
    if (!draft?.agentKey) return;
    const copied = await copyText(draft.agentKey, 'copy-agent-key');
    notify(
      copied ? 'Agent public key copied.' : 'Clipboard access is unavailable in this browser.',
    );
  }

  return {
    draft,
    creating,
    error,
    busy,
    isFreezing,
    mode,
    canEdit,
    canFreeze: demo || Boolean(freezeLiveAgent),
    connectionStatus: connection.status,
    checkConnection: (resourceUrl?: string) =>
      draft?.agentKey && !creating ? connection.check(draft.agentKey, resourceUrl) : undefined,
    setDraft,
    openAgent,
    freezeAgent,
    saveAgent,
    copyConfig,
    copyAgentKey,
    close: () => setDraft(null),
  };
}

export type AgentPolicyController = ReturnType<typeof useAgentPolicy>;
