import { ChevronRight } from 'lucide-react';
import type { WorkspaceMode } from '../../lib/workspace';
import type { Agent } from '../../lib/demo';
import { dollars } from '../../lib/currency';
import { PolicySwitch } from '../ui/policy-switch';

interface AgentListProps {
  mode: WorkspaceMode;
  ready: boolean;
  canEdit: boolean;
  canFreeze: boolean;
  agents: Agent[];
  onEdit: (agent?: Agent) => void;
  onFreeze: (agent: Agent, frozen: boolean) => void;
  onPolicyIntent: () => void;
}

export function AgentList({
  mode,
  ready,
  canEdit,
  canFreeze,
  agents,
  onEdit,
  onFreeze,
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
          const usage = agent.budget > 0 ? Math.min((agent.spent / agent.budget) * 100, 100) : 0;
          const Row = canEdit ? 'button' : 'div';
          return (
            <div className={`agent-row ${agent.frozen ? 'frozen' : ''}`} key={agent.id}>
              <Row
                className="agent-main"
                {...intent}
                onClick={canEdit ? () => onEdit(agent) : undefined}
                aria-description={canEdit ? `View ${agent.name} spending policy` : undefined}
              >
                <span className="agent-title">
                  <span className="agent-name">{agent.name}</span>
                  {canEdit && <ChevronRight size={14} aria-hidden="true" />}
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
                    <span style={{ width: `${usage}%` }} />
                  </span>
                </span>
              </Row>
              <div className="agent-toggle">
                <span className={agent.frozen ? 'frozen-label' : 'active-label'}>
                  {agent.frozen ? 'Frozen' : 'Active'}
                </span>
                {canFreeze && (
                  <PolicySwitch
                    checked={!agent.frozen}
                    onChange={(value) => onFreeze(agent, !value)}
                    label={`${agent.name} payments`}
                  />
                )}
              </div>
            </div>
          );
        })}
        {agents.length === 0 && (
          <div className="empty-state">
            <h3>{mode === 'local' && !ready ? 'Waiting for local policies' : 'No agents yet'}</h3>
            <p>
              {mode === 'local' && !ready
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
