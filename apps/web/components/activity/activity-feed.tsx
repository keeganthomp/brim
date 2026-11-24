import type { WorkspaceMode } from '../../lib/workspace';
import type { Activity } from '../../lib/demo';
import type { ActivityFilter } from '../../hooks/use-dashboard';
import { ActivityRow } from './activity-row';
import { StatusDot } from '../ui/status-dot';

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
        : mode === 'live' && ready
          ? 'Verified'
          : 'Not connected';
  return (
    <section className="activity-section" aria-labelledby="activity-heading">
      <div className="section-heading">
        <h2 id="activity-heading">Activity</h2>
        {ready && (
          <span className={`live-indicator ${mode !== 'demo' ? 'verified-indicator' : ''}`}>
            {mode !== 'demo' ? <StatusDot label={label} pulsing /> : label}
          </span>
        )}
      </div>
      {ready && mode === 'demo' && (
        <div className="feed-filter" role="group" aria-label="Filter activity">
          {filters.map(({ value, label }) => {
            const text = value === 'all' ? 'All' : label;
            return (
              <button
                key={value}
                aria-label={label}
                aria-pressed={filter === value}
                className={filter === value ? 'selected' : ''}
                data-label={text}
                onClick={() => onFilterChange(value)}
              >
                {text}
              </button>
            );
          })}
        </div>
      )}
      <div
        className="activity-list"
        role={activities.length > 0 ? 'region' : undefined}
        tabIndex={activities.length > 0 ? 0 : undefined}
        aria-label={activities.length > 0 ? 'Activity feed' : undefined}
      >
        {activities.map((item) => (
          <ActivityRow
            key={item.id}
            item={item}
            onClick={mode !== 'demo' && item.signature ? () => onSelect(item) : undefined}
          />
        ))}
        {activities.length === 0 && (
          <div className="empty-state">
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
                : 'Settled payments appear here.'}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
