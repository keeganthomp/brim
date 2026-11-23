import { dollars, paymentDollars } from '../../lib/currency';
import type { WorkspaceMode } from '../../lib/workspace';
import { demoSpendTotal, SpendChart } from './spend-chart';

interface SpendOverviewProps {
  mode: WorkspaceMode;
  ready: boolean;
  indexedSpend: number;
  spent: number;
  activeCount: number;
}

export function SpendOverview({
  mode,
  ready,
  indexedSpend,
  spent,
  activeCount,
}: SpendOverviewProps) {
  const demo = mode === 'demo';
  return (
    <section className="chart-area" aria-labelledby="spend-heading">
      <h2 id="spend-heading">
        {demo ? '7-day spend' : mode === 'local' ? 'Recent settled spend' : 'Agent spend'}
      </h2>
      <p className="chart-amount mono">
        {demo ? dollars(demoSpendTotal) : ready ? paymentDollars(indexedSpend) : '—'}
      </p>
      {demo ? <SpendChart /> : null}
      {ready && (
        <dl className="spend-summary">
          <div>
            <dt>{demo ? 'Spent today' : 'Current policy spend'}</dt>
            <dd className="mono">{paymentDollars(spent)}</dd>
          </div>
          <div>
            <dt>Active agents</dt>
            <dd>{activeCount}</dd>
          </div>
        </dl>
      )}
    </section>
  );
}
