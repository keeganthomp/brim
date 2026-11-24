import { ChevronRight } from 'lucide-react';
import type { WorkspaceMode } from '../../lib/workspace';
import type { Agent } from '../../lib/demo';
import { dollars } from '../../lib/currency';
import { FrozenStatus } from './frozen-status';

interface AgentListProps {
  mode: WorkspaceMode;
  ready: boolean;
  canEdit: boolean;
  vaultInitialized: boolean;
  agents: Agent[];
  onEdit: (agent?: Agent) => void;
  onPolicyIntent: () => void;
}

/** Each row opens its policy sheet; freezing lives in the sheet, so rows only report status. */
export function AgentList({
  mode,
  ready,
  canEdit,
  vaultInitialized,
  agents,
  onEdit,
  onPolicyIntent,
}: AgentListProps) {
  const intent = {
    onPointerEnter: onPolicyIntent,
    onFocus: onPolicyIntent,
    onTouchStart: onPolicyIntent,
  };
  return (
    <section className="agents-section" aria-labelledby="agents-heading">
      <div className="section-heading">
        <h2 id="agents-heading">Spending policies</h2>
        {ready && agents.length > 0 && <span className="agent-count">{agents.length}</span>}
      </div>
      <div className="agent-list">
        {agents.map((agent) => {
          const usage = agent.budget > 0 ? Math.min(agent.spent / agent.budget, 1) : 0;
          const Row = canEdit ? 'button' : 'div';
          return (
            <Row
              key={agent.id}
              className={`agent-row${agent.frozen ? ' is-frozen' : ''}`}
              {...intent}
              onClick={canEdit ? () => onEdit(agent) : undefined}
              aria-description={canEdit ? `View ${agent.name} spending policy` : undefined}
            >
              <span className="agent-title">
                <span className="agent-name">{agent.name}</span>
                {agent.frozen && <FrozenStatus />}
              </span>
              <span className="agent-budget">
                <span className="budget-line">
                  <span className="mono">
                    <strong>{dollars(agent.spent)}</strong>
                    <span className="budget-limit"> / {dollars(agent.budget)}</span>
                  </span>
                  <span>{mode === 'demo' ? 'Today' : 'This window'}</span>
                </span>
                <span className="progress-track" aria-hidden="true">
                  <span style={{ transform: `scaleX(${usage})` }} />
                </span>
              </span>
              {canEdit && <ChevronRight className="agent-chevron" size={16} aria-hidden="true" />}
            </Row>
          );
        })}
        {agents.length === 0 && (
          <div className="empty-state">
            <h3>
              {mode === 'live' && !vaultInitialized
                ? 'Create your vault first'
                : mode === 'local' && !ready
                  ? 'Waiting for local policies'
                  : 'No agents yet'}
            </h3>
            <p>
              {mode === 'live' && !vaultInitialized
                ? 'Then fund it and add a spending policy for your agent.'
                : mode === 'local' && !ready
                  ? 'Policies appear when the local stack connects.'
                  : mode === 'live' && !ready
                    ? 'Connect your vault to view its policies.'
                    : 'Add a policy to set your first agent’s spending limits.'}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
