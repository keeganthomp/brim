import { CheckCheck } from 'lucide-react';
import type { WorkspaceMode } from '../../lib/workspace';
import type { Activity } from '../../lib/demo';
import type { ActivityFilter } from '../../hooks/use-dashboard';
import { ActivityRow } from './activity-row';

interface ActivityFeedProps {
  mode: WorkspaceMode;
  ready: boolean;
  activities: Activity[];
  filter: ActivityFilter;
  onFilterChange: (filter: ActivityFilter) => void;
  onSelect: (activity: Activity) => void;
}

const filters: { value: ActivityFilter; label: string }[] = [
  { value: 'all', label: 'All activity' },
  { value: 'settled', label: 'Settled' },
  { value: 'blocked', label: 'Blocked' },
];

export function ActivityFeed({
  mode,
  ready,
  activities,
  filter,
  onFilterChange,
  onSelect,
}: ActivityFeedProps) {
  const label =
    mode === 'demo'
      ? 'Sample data'
      : mode === 'local' && ready
        ? 'Verified local'
        : 'Not connected';
  return (
    <section className="activity-section" aria-labelledby="activity-heading">
      <div className="section-heading">
        <h2 id="activity-heading">Activity</h2>
        <span className={`live-indicator ${mode === 'local' && ready ? 'verified-indicator' : ''}`}>
          {label}
        </span>
      </div>
      {ready && (
        <div className="feed-filter" role="group" aria-label="Filter activity">
          {filters.map(({ value, label }) => (
            <button
              key={value}
              aria-pressed={filter === value}
              className={filter === value ? 'selected' : ''}
              onClick={() => onFilterChange(value)}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <div className="activity-list">
        {activities.map((item) => (
          <ActivityRow
            key={item.id}
            item={item}
            onClick={mode === 'local' && item.signature ? () => onSelect(item) : undefined}
          />
        ))}
        {activities.length === 0 && (
          <div className="empty-state">
            <CheckCheck size={25} strokeWidth={1.5} aria-hidden="true" />
            <h3>
              {mode === 'demo'
                ? 'No activity in this view'
                : !ready
                  ? 'Waiting for your workspace'
                  : 'No payments yet'}
            </h3>
            <p>
              {mode === 'demo'
                ? 'Choose another filter to see your agents’ payments.'
                : mode === 'local'
                  ? 'Verified local payments appear here. Blocked attempts are not indexed.'
                  : 'Payments appear here when your vault is connected.'}
            </p>
          </div>
        )}
      </div>
      {mode === 'local' && activities.some((item) => item.signature) && (
        <p className="activity-footer">Select a payment to copy its signature.</p>
      )}
    </section>
  );
}
