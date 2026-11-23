import { ArrowDownToLine, ArrowUpFromLine, LockKeyhole } from 'lucide-react';
import type { FundsMode } from '../../hooks/use-funds';
import { dollars } from '../../lib/currency';
import type { WorkspaceMode } from '../../lib/workspace';

interface BalanceOverviewProps {
  mode: WorkspaceMode;
  balance: number | null;
  editable: boolean;
  onFunds: (mode: FundsMode) => void;
  onFundsIntent: () => void;
}

export function BalanceOverview({
  mode,
  balance,
  editable,
  onFunds,
  onFundsIntent,
}: BalanceOverviewProps) {
  const demo = mode === 'demo';
  const formattedBalance = balance === null ? null : dollars(balance);
  const [whole, cents] = formattedBalance?.split('.') ?? ['—'];
  const intent = {
    onPointerEnter: onFundsIntent,
    onFocus: onFundsIntent,
    onTouchStart: onFundsIntent,
  };

  return (
    <section className="balance-summary" aria-labelledby="balance-heading">
      <div className="balance-header">
        <h2 id="balance-heading">Vault balance</h2>
        <span className="balance-unit">
          {demo ? 'Demo USDC' : mode === 'local' ? 'Test USDC' : 'USDC'}
        </span>
      </div>
      <p className="balance mono">
        <span className="sr-only">{formattedBalance ?? 'Balance unavailable'}</span>
        <span aria-hidden="true">{whole}</span>
        {cents && (
          <span className="balance-decimals" aria-hidden="true">
            .{cents}
          </span>
        )}
      </p>
      {demo ? (
        <div className="balance-actions">
          <button
            className="button vault-primary"
            {...intent}
            onClick={() => onFunds('deposit')}
            disabled={!editable}
          >
            <ArrowDownToLine size={15} aria-hidden="true" /> Deposit
          </button>
          <button
            className="button vault-secondary"
            {...intent}
            onClick={() => onFunds('withdraw')}
            disabled={!editable}
          >
            <ArrowUpFromLine size={15} aria-hidden="true" /> Withdraw
          </button>
        </div>
      ) : (
        <p className="balance-note">
          <LockKeyhole size={14} aria-hidden="true" />
          {mode === 'local' ? 'Read-only vault' : 'Waiting for vault setup'}
        </p>
      )}
    </section>
  );
}
