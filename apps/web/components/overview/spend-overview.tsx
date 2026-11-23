import { dollars, paymentDollars } from '../../lib/currency';
import type { WorkspaceMode } from '../../lib/workspace';
import { demoSpendTotal, SpendChart } from './spend-chart';

interface SpendOverviewProps {
  mode: WorkspaceMode;
  ready: boolean;
  indexedSpend: number;
}

export function SpendOverview({ mode, ready, indexedSpend }: SpendOverviewProps) {
  const demo = mode === 'demo';
  return (
    <section className="chart-area" aria-labelledby="spend-heading">
      <h2 id="spend-heading">{demo ? '7-day spend' : 'Recent settled spend'}</h2>
      <p className="chart-amount mono">
        <span className="value-change" key={`${mode}:${ready}:${indexedSpend}`}>
          {demo ? dollars(demoSpendTotal) : ready ? paymentDollars(indexedSpend) : '—'}
        </span>
      </p>
      {demo ? (
        <SpendChart />
      ) : (
        <p className="chart-context">
          {ready ? 'From the verified activity feed' : 'Waiting for payments'}
        </p>
      )}
    </section>
  );
}
