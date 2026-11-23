'use client';

import { useRef, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react';
import { loadLocalPolicies, loadPolicyActions } from '../lib/deferred-actions';
import { newDemoAgent } from '../lib/new-demo-agent';
import { copySdkTemplate, copyText } from '../lib/clipboard';
import type { Agent } from '../lib/demo';
import type { WorkspaceMode } from '../lib/workspace';
import type { OwnerWalletController } from './use-owner-wallet';
import type { DemoActions } from './types';

interface PolicyActions extends DemoActions {
  mode: WorkspaceMode;
  localWrites: boolean;
  saveLivePolicy?: OwnerWalletController['save'] | undefined;
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
  onChainChange,
}: PolicyActions) {
  const [draft, setDraftState] = useState<Agent | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const revision = useRef(0);
  const pendingRevision = useRef<number | null>(null);
  const canEdit = demo || localWrites || Boolean(saveLivePolicy);

  const setDraft: Dispatch<SetStateAction<Agent | null>> = (next) => {
    revision.current += 1;
    pendingRevision.current = null;
    setBusy(false);
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

  function freezeAgent(agent: Agent, frozen: boolean) {
    if (!demo) return liveUnavailable();
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
    const copied = await copySdkTemplate();
    notify(copied ? 'SDK template copied.' : 'Clipboard access is unavailable in this browser.');
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
    mode,
    canEdit,
    canFreeze: demo,
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
