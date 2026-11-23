import { ChevronDown } from 'lucide-react';
import type { Agent } from '../../lib/demo';
import type { WorkspaceMode } from '../../lib/workspace';
import { PolicySwitch } from '../ui/policy-switch';
import { PolicyNumberField } from './policy-number-field';

export function PolicyAdvanced({
  draft,
  setDraft,
  mode,
  canEdit,
  busy,
}: {
  draft: Agent;
  setDraft: (agent: Agent) => void;
  mode: WorkspaceMode;
  canEdit: boolean;
  busy: boolean;
}) {
  return (
    <details className="policy-details">
      <summary>
        Advanced settings
        <ChevronDown size={16} aria-hidden="true" />
      </summary>
      <div className="policy-details-content">
        {mode === 'demo' ? (
          <PolicyNumberField
            label="Paid requests / minute"
            unit="requests"
            value={draft.requests}
            min={1}
            step={1}
            description={`At least ${Math.ceil(60 / Math.max(1, draft.requests))} seconds apart.`}
            onChange={(requests) => setDraft({ ...draft, requests })}
            readOnly={!canEdit}
            disabled={busy}
          />
        ) : (
          <PolicyNumberField
            label="Minimum time between payments"
            unit="seconds"
            value={draft.minTxInterval ?? 0}
            min={0}
            step={1}
            onChange={(minTxInterval) => setDraft({ ...draft, minTxInterval })}
            readOnly={!canEdit}
            disabled={busy}
          />
        )}
        <div className="policy-recipient-toggle">
          <label htmlFor="allowlist-toggle">Approved recipients only</label>
          <PolicySwitch
            id="allowlist-toggle"
            label="Approved recipients only"
            checked={draft.allowlistEnabled}
            onChange={(allowlistEnabled) => setDraft({ ...draft, allowlistEnabled })}
            disabled={!canEdit || busy}
          />
        </div>
        {draft.allowlistEnabled && (
          <div className="allowlist-field">
            <label htmlFor="recipients">Recipient wallet addresses</label>
            <textarea
              id="recipients"
              className="text-input policy-key-input"
              value={draft.recipients}
              onChange={(event) => setDraft({ ...draft, recipients: event.currentTarget.value })}
              placeholder="One address per line"
              rows={3}
              spellCheck={false}
              autoCapitalize="none"
              readOnly={!canEdit}
              disabled={busy}
              aria-describedby="recipient-help"
            />
            <p id="recipient-help">Up to 16 Solana wallet addresses.</p>
          </div>
        )}
      </div>
    </details>
  );
}
