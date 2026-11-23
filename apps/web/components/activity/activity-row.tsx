import { ArrowDownLeft, ArrowUpRight, Check, X } from 'lucide-react';
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
  const settled = item.status === 'settled';
  const stateClass = settled ? 'settled-state' : blocked ? 'blocked-state' : '';
  const StatusIcon = blocked
    ? X
    : settled
      ? Check
      : item.status === 'deposit'
        ? ArrowDownLeft
        : ArrowUpRight;
  const Row = onClick ? 'button' : 'div';

  return (
    <Row
      className={`activity-row ${blocked ? 'blocked' : ''}`}
      onClick={onClick}
      title={onClick ? 'Copy verified transaction signature' : undefined}
    >
      <span className={`payment-icon ${stateClass}`} aria-hidden="true">
        <StatusIcon size={14} strokeWidth={1.8} />
      </span>
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
        <span className={`payment-state ${stateClass}`}>{statusLabels[item.status]}</span>
      </span>
      {blocked && item.reason && <span className="blocked-reason">{item.reason}</span>}
    </Row>
  );
}
