import { ChevronDown, Copy } from 'lucide-react';
import { Disclosure } from '../ui/disclosure';

export function PolicySetup({ onCopy }: { onCopy: () => void }) {
  return (
    <Disclosure
      className="policy-details policy-setup"
      summary={
        <>
          SDK setup
          <ChevronDown size={16} aria-hidden="true" />
        </>
      }
    >
      <div className="policy-details-content">
        <p>Connect your agent with the public vault config and its scoped signing key.</p>
        <button type="button" className="button secondary small" onClick={onCopy}>
          <Copy size={14} aria-hidden="true" />
          Copy SDK template
        </button>
      </div>
    </Disclosure>
  );
}
