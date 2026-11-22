import { ArrowDownToLine, ArrowUpFromLine, LockKeyhole } from 'lucide-react';
import type { FundsMode } from '../../hooks/use-funds';
import { dollars, paymentDollars } from '../../lib/currency';
import type { WorkspaceMode } from '../../lib/workspace';
import { demoSpendTotal, SpendChart } from './spend-chart';

interface BalanceOverviewProps {
  mode: WorkspaceMode;
  balance: number | null;
  editable: boolean;
  indexedSpend: number;
  onFunds: (mode: FundsMode) => void;
  onFundsIntent: () => void;
}

export function BalanceOverview({
  mode,
  indexedSpend,
  balance,
  editable,
  onFunds,
  onFundsIntent,
}: BalanceOverviewProps) {
  const demo = mode === 'demo';
  const formattedBalance = balance === null ? null : dollars(balance);
  const [whole, cents] = formattedBalance?.split('.') ?? ['—'];
  const spend = demo
    ? dollars(demoSpendTotal)
    : balance === null
      ? '—'
      : paymentDollars(indexedSpend);
  const intent = {
    onPointerEnter: onFundsIntent,
    onFocus: onFundsIntent,
    onTouchStart: onFundsIntent,
  };

  return (
    <section className="balance-panel" aria-label="Vault balance and spending">
      <div className="balance-summary">
        <div className="balance-header">
          <h2>Vault balance</h2>
          <span className="balance-unit">{mode === 'local' ? 'Test USDC' : 'USDC'}</span>
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
            {mode === 'local' ? 'Read-only local vault' : 'Wallet connection required'}
          </p>
        )}
      </div>
      <div className="chart-area">
        <div className="spend-total">
          <h2>{mode === 'local' ? 'Recent settled spend' : 'Agent spend'}</h2>
          {demo && <span className="chart-period">7 days</span>}
        </div>
        <p className="chart-amount mono">{spend}</p>
        {demo ? (
          <SpendChart />
        ) : (
          <p className="chart-empty">
            {mode === 'local'
              ? 'Total from the verified payments in Activity.'
              : 'Spending history appears when a vault is connected.'}
          </p>
        )}
      </div>
    </section>
  );
}
