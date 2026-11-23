import type { RefObject } from 'react';
import { Copy } from 'lucide-react';
import type { Agent } from '../../lib/demo';
import type { WorkspaceMode } from '../../lib/workspace';

export function PolicyIdentity({
  draft,
  setDraft,
  creating,
  mode,
  canEdit,
  busy,
  firstField,
  copyAgentKey,
}: {
  draft: Agent;
  setDraft: (agent: Agent) => void;
  creating: boolean;
  mode: WorkspaceMode;
  canEdit: boolean;
  busy: boolean;
  firstField: RefObject<HTMLInputElement | null>;
  copyAgentKey: () => Promise<void>;
}) {
  const agentKey = draft.agentKey ?? '';
  return (
    <section className="policy-identity" aria-label="Agent identity">
      {creating ? (
        <div className="policy-key-field">
          <label className="field-label" htmlFor="agent-public-key">
            Agent public key
            {mode === 'demo' && <span aria-hidden="true">Optional</span>}
          </label>
          <input
            ref={mode !== 'demo' ? firstField : undefined}
            id="agent-public-key"
            className="text-input policy-key-input"
            value={agentKey}
            onChange={(event) => setDraft({ ...draft, agentKey: event.currentTarget.value.trim() })}
            placeholder="Paste your agent’s public key"
            aria-describedby="agent-public-key-help"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            required={mode !== 'demo'}
            pattern="[1-9A-HJ-NP-Za-km-z]{32,44}"
            readOnly={!canEdit}
            disabled={busy}
          />
          <p id="agent-public-key-help" className="policy-field-help">
            {mode === 'demo'
              ? 'Leave blank to create a sample policy.'
              : 'This is the key you are authorizing to spend.'}
          </p>
        </div>
      ) : (
        <div className="policy-key-field">
          <h3 id="agent-public-key-label">Agent public key</h3>
          {agentKey ? (
            <div
              className="policy-key-display"
              role="group"
              aria-labelledby="agent-public-key-label"
            >
              <code>{agentKey}</code>
              <button type="button" className="button secondary small" onClick={copyAgentKey}>
                <Copy size={14} aria-hidden="true" />
                Copy public key
              </button>
            </div>
          ) : (
            <p className="policy-key-empty">
              {mode === 'demo' ? 'Sample policy · No public key' : 'No public key available'}
            </p>
          )}
        </div>
      )}
      {mode === 'demo' && (
        <div className="policy-name-field">
          <label className="field-label" htmlFor="agent-name">
            Agent name
          </label>
          <input
            ref={firstField}
            id="agent-name"
            className="text-input"
            value={draft.name}
            maxLength={48}
            required
            onChange={(event) => setDraft({ ...draft, name: event.currentTarget.value })}
            placeholder="e.g. Research Agent"
            autoComplete="off"
            readOnly={!canEdit}
            disabled={busy}
          />
        </div>
      )}
    </section>
  );
}
