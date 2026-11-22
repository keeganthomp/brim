'use client';

import { useRef, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react';
import { loadPolicyActions } from '../lib/deferred-actions';
import { newDemoAgent } from '../lib/new-demo-agent';
import { copySdkTemplate } from '../lib/clipboard';
import type { Agent } from '../lib/demo';
import type { DemoActions } from './types';

export function useAgentPolicy({ demo, setState, notify, liveUnavailable }: DemoActions) {
  const [draft, setDraftState] = useState<Agent | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const revision = useRef(0);
  const pendingRevision = useRef<number | null>(null);

  const setDraft: Dispatch<SetStateAction<Agent | null>> = (next) => {
    revision.current += 1;
    pendingRevision.current = null;
    setDraftState(next);
  };

  function openAgent(agent?: Agent) {
    if (!demo) return liveUnavailable();
    setCreating(!agent);
    setDraft(agent ? { ...agent } : newDemoAgent());
    setError('');
  }

  function freezeAgent(agent: Agent, frozen: boolean) {
    if (!demo) return liveUnavailable();
    setState((previous) => ({
      ...previous,
      agents: previous.agents.map((item) => (item.id === agent.id ? { ...item, frozen } : item)),
    }));
    notify(
      `${agent.name} ${frozen ? 'frozen' : 'resumed'} in this demo. No on-chain policy was changed.`,
    );
  }

  async function saveAgent(event: FormEvent) {
    event.preventDefault();
    if (!draft || !demo || pendingRevision.current !== null) return;
    const currentRevision = revision.current;
    pendingRevision.current = currentRevision;
    try {
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
      notify(`Demo spending policy ${creating ? 'added' : 'updated'} for ${saved.name}.`);
    } catch {
      if (revision.current === currentRevision)
        setError('Policy controls could not load. Please try again.');
    } finally {
      if (pendingRevision.current === currentRevision) pendingRevision.current = null;
    }
  }

  async function copyConfig() {
    const copied = await copySdkTemplate();
    const message = copied
      ? 'SDK template copied. See the SDK README for the supported x402 smart-wallet flow and required configuration.'
      : 'Clipboard access is unavailable in this browser.';
    notify(message);
  }

  return {
    draft,
    creating,
    error,
    setDraft,
    openAgent,
    freezeAgent,
    saveAgent,
    copyConfig,
    close: () => setDraft(null),
  };
}

export type AgentPolicyController = ReturnType<typeof useAgentPolicy>;
