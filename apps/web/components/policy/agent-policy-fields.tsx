import { useEffect, useRef, type RefObject } from 'react';
import { FlaskConical, XCircle } from 'lucide-react';
import type { Agent } from '../../lib/demo';
import { PolicyControl } from '../ui/policy-control';
import { PolicySwitch } from '../ui/policy-switch';
import { PolicySetup } from './policy-setup';
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
        aria-describedby={
          error && !draft.name.trim() ? 'agent-name-help policy-error' : 'agent-name-help'
        }
        aria-invalid={Boolean(error) && !draft.name.trim()}
        className="text-input"
        value={draft.name}
        maxLength={48}
        onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        placeholder="e.g. Research Agent"
        autoComplete="off"
      />
      <p className="policy-name-help" id="agent-name-help">
        A label for a bot or app you already run.
      </p>
      <div className="policy-controls" role="group" aria-labelledby="policy-limits-title">
        <div className="policy-section-heading">
          <h3 id="policy-limits-title">Spending limits</h3>
          <span>Amounts in USDC</span>
        </div>
        <PolicyControl
          title="Per-payment cap"
          description="The most a single paid request can cost."
          value={draft.cap}
          max={Math.max(10, draft.cap)}
          step={0.01}
          money
          onChange={(cap) => setDraft({ ...draft, cap })}
        />
        <PolicyControl
          title="24-hour budget"
          description="Total spend allowed within each fixed 24-hour window."
          value={draft.budget}
          max={Math.max(500, draft.budget)}
          step={1}
          money
          onChange={(budget) => setDraft({ ...draft, budget })}
        />
        <PolicyControl
          title="Paid requests / minute"
          description={`At least ${Math.ceil(60 / Math.max(1, draft.requests))} seconds between paid requests.`}
          value={draft.requests}
          max={60}
          step={1}
          onChange={(requests) => setDraft({ ...draft, requests })}
        />
      </div>
      <div className="allowlist-heading">
        <div>
          <label htmlFor="allowlist-toggle">Approved recipients only</label>
          <p>
            {draft.allowlistEnabled
              ? 'Only the listed recipients can be paid.'
              : 'Allow payments to any recipient within these limits.'}
          </p>
        </div>
        <PolicySwitch
          id="allowlist-toggle"
          label="Approved recipients only"
          checked={draft.allowlistEnabled}
          onChange={(allowlistEnabled) => setDraft({ ...draft, allowlistEnabled })}
        />
      </div>
      {draft.allowlistEnabled && (
        <div className="allowlist-field">
          <label htmlFor="recipients">Recipient wallet addresses</label>
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
          <p id="recipient-help">Up to 16 Solana recipient addresses, one per line.</p>
        </div>
      )}
      <PolicySetup onCopy={copyConfig} />
      {error && (
        <p ref={errorMessage} role="alert" className="form-error" id="policy-error">
          <XCircle size={15} aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  );
}
