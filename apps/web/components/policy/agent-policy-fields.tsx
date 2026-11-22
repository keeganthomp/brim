import { useEffect, useRef, type RefObject } from 'react';
import { Code2, Copy, FlaskConical, XCircle } from 'lucide-react';
import type { Agent } from '../../lib/demo';
import { PolicyControl } from '../ui/policy-control';
import { PolicySwitch } from '../ui/policy-switch';
interface AgentPolicyFieldsProps {
  draft: Agent;
  setDraft: (agent: Agent) => void;
  copyConfig: () => void;
  error: string;
  nameField: RefObject<HTMLInputElement | null>;
}
export function AgentPolicyFields({
  draft,
  setDraft,
  copyConfig,
  error,
  nameField,
}: AgentPolicyFieldsProps) {
  const errorMessage = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (error) errorMessage.current?.scrollIntoView({ block: 'nearest' });
  }, [error]);
  return (
    <div className="drawer-scroll">
      <div className="drawer-demo-note" id="policy-demo-note">
        <FlaskConical size={14} aria-hidden="true" /> Demo policy · Saved in this browser
      </div>
      <label className="field-label" htmlFor="agent-name">
        Agent name
      </label>
      <input
        ref={nameField}
        id="agent-name"
        aria-describedby="policy-demo-note"
        aria-invalid={Boolean(error) && !draft.name.trim()}
        className="text-input"
        value={draft.name}
        maxLength={48}
        onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        placeholder="e.g. Research Agent"
        autoComplete="off"
      />
      <div className="policy-controls" role="group" aria-label="Spending limits">
        <PolicyControl
          title="Per-payment cap"
          description="The most an agent can spend in one payment."
          value={draft.cap}
          max={Math.max(10, draft.cap)}
          step={0.01}
          money
          onChange={(cap) => setDraft({ ...draft, cap })}
        />
        <PolicyControl
          title="Daily budget"
          description="A fixed 24-hour budget, starting at policy creation."
          value={draft.budget}
          max={Math.max(500, draft.budget)}
          step={1}
          money
          onChange={(budget) => setDraft({ ...draft, budget })}
        />
        <PolicyControl
          title="Requests per minute"
          description={`Payments stay at least ${Math.ceil(60 / Math.max(1, draft.requests))} seconds apart.`}
          value={draft.requests}
          max={60}
          step={1}
          onChange={(requests) => setDraft({ ...draft, requests })}
        />
      </div>
      <div className="allowlist-heading">
        <div>
          <label htmlFor="allowlist-toggle">Strict recipient allowlist</label>
          <p>Only pay recipients you’ve approved.</p>
        </div>
        <PolicySwitch
          id="allowlist-toggle"
          label="Strict recipient allowlist"
          checked={draft.allowlistEnabled}
          onChange={(allowlistEnabled) => setDraft({ ...draft, allowlistEnabled })}
        />
      </div>
      {draft.allowlistEnabled && (
        <div className="allowlist-field">
          <label htmlFor="recipients">Approved Solana recipient addresses</label>
          <textarea
            id="recipients"
            className="text-input mono"
            value={draft.recipients}
            onChange={(e) => setDraft({ ...draft, recipients: e.target.value })}
            placeholder="One recipient address per line"
            rows={4}
            spellCheck={false}
            autoCapitalize="none"
            aria-describedby="recipient-help"
          />
          <p id="recipient-help">
            Up to 16 recipient addresses, one per line. Domains are labels, not payment permissions.
          </p>
        </div>
      )}
      <div className="sdk-card">
        <div>
          <Code2 size={17} />
          <strong>Connect your agent</strong>
        </div>
        <p>Pass the public vault config and the bot’s scoped key to the SDK.</p>
        <button type="button" className="button secondary" onClick={copyConfig}>
          <Copy size={14} /> Copy SDK template
        </button>
        <span>Use a compatible x402 facilitator for live payments.</span>
      </div>
      {error && (
        <p ref={errorMessage} role="alert" className="form-error" id="policy-error">
          <XCircle size={15} />
          {error}
        </p>
      )}
    </div>
  );
}
