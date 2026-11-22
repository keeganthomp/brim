import { ArrowDownLeft, ArrowUpRight, Check, X } from 'lucide-react';
import type { Activity } from '../../lib/demo';
import { paymentDollars } from '../../lib/currency';

export function ActivityRow({ item, onClick }: { item: Activity; onClick: () => void }) {
  const blocked = item.status === 'blocked';
  const funding = item.status === 'deposit' || item.status === 'withdrawal';
  const settled = item.status === 'settled';
  const status = blocked
    ? 'Blocked'
    : settled
      ? 'Settled'
      : item.status === 'deposit'
        ? 'Deposit'
        : 'Withdrawal';
  return (
    <button
      className={`activity-row ${blocked ? 'blocked' : ''}`}
      onClick={onClick}
      title={item.signature ? 'Copy verified transaction signature' : undefined}
    >
      <span className={`merchant-avatar ${blocked ? 'blocked-avatar' : ''}`} aria-hidden="true">
        {blocked ? (
          <X size={15} />
        ) : funding ? (
          item.status === 'deposit' ? (
            <ArrowDownLeft size={17} />
          ) : (
            <ArrowUpRight size={17} />
          )
        ) : (
          <span>{item.merchant.charAt(0).toUpperCase()}</span>
        )}
      </span>
      <span className="activity-info">
        <span className="merchant-name">{item.merchant}</span>
        <span className={blocked ? 'blocked-reason' : 'activity-agent'}>
          {blocked ? item.reason : item.agent}
        </span>
      </span>
      <span className="activity-amount">
        <strong className="mono">
          {item.status === 'deposit' ? '+' : ''}
          {paymentDollars(item.amount)}
        </strong>
        <span className="activity-row-meta">
          <span
            className={`payment-state ${settled ? 'settled-state' : blocked ? 'blocked-status' : ''}`}
          >
            {settled && <Check size={10} aria-hidden="true" />}
            {status}
          </span>
          <span className="activity-time mono">{item.time}</span>
        </span>
      </span>
    </button>
  );
}
