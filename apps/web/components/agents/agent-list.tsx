import { Bot, ChevronRight, Code2, Database, Plus, Search, ShieldCheck } from 'lucide-react';
import type { WorkspaceMode } from '../../lib/workspace';
import type { Agent } from '../../lib/demo';
import { dollars } from '../../lib/currency';
import { PolicySwitch } from '../ui/policy-switch';

const icons = { research: Search, data: Database, code: Code2 };

interface AgentListProps {
  mode: WorkspaceMode;
  ready: boolean;
  editable: boolean;
  agents: Agent[];
  budget: number;
  onEdit: (agent?: Agent) => void;
  onFreeze: (agent: Agent, frozen: boolean) => void;
  onIntegration: () => void;
  onPolicyIntent: () => void;
}

export function AgentList({
  mode,
  ready,
  editable,
  agents,
  budget,
  onEdit,
  onFreeze,
  onIntegration,
  onPolicyIntent,
}: AgentListProps) {
  const demo = mode === 'demo';
  const intent = {
    onPointerEnter: onPolicyIntent,
    onFocus: onPolicyIntent,
    onTouchStart: onPolicyIntent,
  };
  return (
    <section className="agents-section" aria-labelledby="agents-heading">
      <div className="section-heading">
        <h2 id="agents-heading">Agents</h2>
        <button
          className="button small new-agent-button"
          {...intent}
          onClick={() => onEdit()}
          disabled={!editable}
        >
          <Plus size={15} aria-hidden="true" /> Add spending policy
        </button>
      </div>
      <div className="agent-list">
        {agents.map((agent) => {
          const Icon = icons[agent.icon];
          const usage = agent.budget > 0 ? Math.min((agent.spent / agent.budget) * 100, 100) : 0;
          return (
            <div className={`agent-row ${agent.frozen ? 'frozen' : ''}`} key={agent.id}>
              <button
                disabled={!editable}
                className="agent-main"
                {...intent}
                onClick={() => onEdit(agent)}
                aria-description={`Edit ${agent.name} policy`}
              >
                <span className="agent-avatar">
                  <Icon size={19} strokeWidth={1.6} aria-hidden="true" />
                </span>
                <span className="agent-info">
                  <span className="agent-title">
                    <span className="agent-name">{agent.name}</span>
                    <ChevronRight size={13} aria-hidden="true" />
                  </span>
                  <span className="agent-role">{agent.role}</span>
                </span>
              </button>
              <div className="agent-toggle">
                <span className={agent.frozen ? 'frozen-label' : 'active-label'}>
                  {agent.frozen ? 'Frozen' : 'Active'}
                </span>
                <PolicySwitch
                  disabled={!editable}
                  checked={!agent.frozen}
                  onChange={(value) => onFreeze(agent, !value)}
                  label={`${agent.frozen ? 'Resume' : 'Freeze'} ${agent.name}`}
                />
              </div>
              <button
                disabled={!editable}
                className="agent-budget"
                {...intent}
                onClick={() => onEdit(agent)}
                aria-description={`Edit ${agent.name} budget`}
              >
                <span className="budget-line">
                  <span className="mono">
                    <strong>{dollars(agent.spent)}</strong>
                    <span className="budget-limit"> / {dollars(agent.budget)}</span>
                  </span>
                  <span>{mode === 'local' ? 'Policy window' : 'Today'}</span>
                </span>
                <span className="progress-track">
                  <span style={{ width: `${usage}%` }} />
                </span>
              </button>
            </div>
          );
        })}
        {agents.length === 0 && (
          <div className="empty-state">
            <Bot size={25} strokeWidth={1.5} aria-hidden="true" />
            <h3>No spending policies yet</h3>
            <p>
              {mode === 'local'
                ? 'Your local agent will appear when the stack is connected.'
                : 'Connect a vault to manage your agents and their spending limits.'}
            </p>
          </div>
        )}
      </div>
      <div className="budget-summary">
        <div>
          <span>{mode === 'local' ? 'Combined window budget' : 'Combined daily budget'}</span>
          <strong className="mono">{ready ? dollars(budget) : '$—'}</strong>
        </div>
        <div className="agent-footer">
          <span>
            <ShieldCheck size={13} aria-hidden="true" />
            {demo ? 'Demo policies · Saved in this browser' : 'On-chain spending policies'}
          </span>
          <button
            disabled={!editable}
            className="sdk-setup-button"
            {...intent}
            onClick={onIntegration}
          >
            <Code2 size={14} aria-hidden="true" /> SDK setup
          </button>
        </div>
      </div>
    </section>
  );
}
