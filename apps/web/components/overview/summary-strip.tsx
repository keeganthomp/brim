import { Activity, WalletCards } from 'lucide-react';
import { paymentDollars } from '../../lib/currency';
import type { WorkspaceMode } from '../../lib/workspace';

interface SummaryStripProps {
  mode: WorkspaceMode;
  ready: boolean;
  activeCount: number;
  spent: number;
}

export function SummaryStrip({ mode, ready, activeCount, spent }: SummaryStripProps) {
  return (
    <dl className="summary-strip" aria-label="Agent usage">
      <div>
        <dt>
          <Activity size={16} aria-hidden="true" /> Active agents
        </dt>
        <dd className="mono">{ready ? activeCount : '—'}</dd>
      </div>
      <div>
        <dt>
          <WalletCards size={16} aria-hidden="true" />{' '}
          {mode === 'local' ? 'Current policy spend' : 'Spent today'}
        </dt>
        <dd className="mono">{ready ? paymentDollars(spent) : '—'}</dd>
      </div>
    </dl>
  );
}
