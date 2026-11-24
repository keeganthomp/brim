import { ArrowDownToLine, ArrowUpFromLine } from 'lucide-react';
import type { FundsMode } from '../../hooks/use-funds';
import { dollars } from '../../lib/currency';
import type { WorkspaceMode } from '../../lib/workspace';
import { LocalTestPayment, type LocalPaymentAction } from './local-test-payment';

interface BalanceOverviewProps {
  mode: WorkspaceMode;
  balance: number | null;
  editable: boolean;
  canCreateVault: boolean;
  canFundVault: boolean;
  localPayment: LocalPaymentAction;
  onFunds: (mode: FundsMode) => void;
  onFundsIntent: () => void;
}

export function BalanceOverview({
  mode,
  balance,
  editable,
  canCreateVault,
  canFundVault,
  localPayment,
  onFunds,
  onFundsIntent,
}: BalanceOverviewProps) {
  const demo = mode === 'demo';
  const uninitialized = mode === 'live' && canCreateVault;
  const canFund = demo ? editable : mode === 'live' && canFundVault;
  // An empty Live treasury has its single Deposit action in the page heading.
  const showFunding = demo || (mode === 'live' && canFundVault && balance !== null && balance > 0);
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
      {uninitialized ? (
        <div className="vault-start">
          <h3>No vault yet</h3>
          <p>Create a vault to hold USDC and register your agents’ spending policies.</p>
        </div>
      ) : (
        <p className="balance mono">
          <span className="sr-only">{formattedBalance ?? 'Balance unavailable'}</span>
          <span className="value-change" key={formattedBalance ?? 'none'} aria-hidden="true">
            {whole}
            {cents && <span className="balance-decimals">.{cents}</span>}
          </span>
        </p>
      )}
      {showFunding && (
        <div className="balance-actions">
          <button
            className="button vault-primary"
            {...intent}
            onClick={() => onFunds('deposit')}
            disabled={!canFund}
          >
            <ArrowDownToLine size={15} aria-hidden="true" /> Deposit
          </button>
          <button
            className="button vault-secondary"
            {...intent}
            onClick={() => onFunds('withdraw')}
            disabled={!canFund}
          >
            <ArrowUpFromLine size={15} aria-hidden="true" /> Withdraw
          </button>
        </div>
      )}
      {mode === 'local' &&
        (localPayment.available ||
          localPayment.busy ||
          localPayment.result ||
          localPayment.error) && <LocalTestPayment payment={localPayment} />}
    </section>
  );
}
