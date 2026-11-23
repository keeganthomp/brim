import { Code2, Copy } from 'lucide-react';

/** Setup explains the operator handoff; this browser preview never issues a key. */
export function PolicySetup({ onCopy }: { onCopy: () => void }) {
  return (
    <section className="sdk-card" aria-labelledby="policy-setup-title">
      <div>
        <Code2 size={17} aria-hidden="true" />
        <h3 id="policy-setup-title">Connect this agent</h3>
      </div>
      <p>
        For live payments, an operator registers the agent’s public key with this spending policy.
      </p>
      <dl className="policy-setup-inputs">
        <div>
          <dt>Public vault config</dt>
          <dd>
            <code>vaultConfig</code>
          </dd>
        </div>
        <div>
          <dt>Scoped private key</dt>
          <dd>
            <code>agentKey</code>
          </dd>
        </div>
      </dl>
      <button type="button" className="button secondary" onClick={onCopy}>
        <Copy size={14} aria-hidden="true" /> Copy SDK template
      </button>
      <p className="policy-setup-note">This demo does not register or connect a key.</p>
    </section>
  );
}
