import { Copy } from 'lucide-react';
import type { Activity } from '../../lib/demo';
import { paymentDollars } from '../../lib/currency';

const statusLabels = {
  settled: 'Settled',
  blocked: 'Blocked',
  deposit: 'Deposit',
  withdrawal: 'Withdrawal',
} as const;

export function ActivityRow({
  item,
  onClick,
}: {
  item: Activity;
  onClick: (() => void) | undefined;
}) {
  const blocked = item.status === 'blocked';
  const Row = onClick ? 'button' : 'div';
  return (
    <Row
      className={`activity-row ${blocked ? 'blocked' : ''}`}
      onClick={onClick}
      aria-description={onClick ? 'Copy transaction signature' : undefined}
      title={onClick ? 'Copy transaction signature' : undefined}
    >
      <span className="activity-info">
        <span className="merchant-name">{item.merchant}</span>
        <span className="activity-context">
          <span className="activity-agent">{item.agent}</span>
          <span className="activity-time mono">{item.time}</span>
        </span>
      </span>
      <span className="activity-amount">
        <strong className="mono">
          {item.status === 'deposit' ? '+' : ''}
          {paymentDollars(item.amount)}
        </strong>
        <span className="activity-status">
          <span
            className={`payment-state ${item.status === 'settled' ? 'settled-state' : blocked ? 'blocked-state' : ''}`}
          >
            {statusLabels[item.status]}
          </span>
          {onClick && <Copy className="activity-copy" size={12} aria-hidden="true" />}
        </span>
      </span>
      {blocked && item.reason && <span className="blocked-reason">{item.reason}</span>}
    </Row>
  );
}
