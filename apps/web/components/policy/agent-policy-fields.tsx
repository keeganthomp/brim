import { useEffect, useRef, type RefObject } from 'react';
import { XCircle } from 'lucide-react';
import type { AgentPolicyController } from '../../hooks/use-agent-policy';
import { PolicyIdentity } from './policy-identity';
import { PolicyNumberField } from './policy-number-field';
import { PolicyAdvanced } from './policy-advanced';
import { PolicySetup } from './policy-setup';

export function AgentPolicyFields({
  controller,
  firstField,
}: {
  controller: AgentPolicyController;
  firstField: RefObject<HTMLInputElement | null>;
}) {
  const { draft, setDraft, creating, mode, canEdit, busy, copyAgentKey, copyConfig, error } =
    controller;
  const errorMessage = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (error) errorMessage.current?.scrollIntoView({ block: 'nearest' });
  }, [error]);
  if (!draft) return null;
  const daily = !draft.windowDuration || draft.windowDuration === '86400';
  return (
    <div className="drawer-scroll">
      <PolicyIdentity
        draft={draft}
        setDraft={setDraft}
        creating={creating}
        mode={mode}
        canEdit={canEdit}
        busy={busy}
        firstField={firstField}
        copyAgentKey={copyAgentKey}
      />
      <section className="policy-controls" aria-labelledby="policy-limits-title">
        <h3 id="policy-limits-title">Spending limits</h3>
        <div className="policy-limits-grid">
          <PolicyNumberField
            label="Per-payment cap"
            unit="USDC"
            value={draft.cap}
            onChange={(cap) => setDraft({ ...draft, cap })}
            readOnly={!canEdit}
            disabled={busy}
          />
          <PolicyNumberField
            label={daily ? '24-hour budget' : 'Window budget'}
            unit="USDC"
            value={draft.budget}
            onChange={(budget) => setDraft({ ...draft, budget })}
            description={
              daily
                ? 'Per fixed 24-hour window.'
                : `Window length: ${draft.windowDuration} seconds.`
            }
            readOnly={!canEdit}
            disabled={busy}
          />
        </div>
      </section>
      <PolicyAdvanced draft={draft} setDraft={setDraft} mode={mode} canEdit={canEdit} busy={busy} />
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
