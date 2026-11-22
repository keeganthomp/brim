import type { Agent, Activity } from '../demo-model';
import type { LocalWorkspaceResponse } from './schema';

export interface LocalWorkspaceSnapshot {
  balance: number;
  agents: Agent[];
  activity: Activity[];
  indexedSpend: number;
  isPaused: boolean;
}

const usdc = (baseUnits: string) => Number(baseUnits) / 1_000_000;

function relativeTime(timestamp: string) {
  const seconds = Math.max(0, Math.floor((Date.now() - Date.parse(timestamp)) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function adaptLocalWorkspace(data: LocalWorkspaceResponse): LocalWorkspaceSnapshot {
  const agents = data.agents.map((agent): Agent => {
    const expired =
      data.chainTimestamp !== undefined &&
      agent.windowStart !== undefined &&
      agent.windowDuration !== undefined &&
      BigInt(data.chainTimestamp) - BigInt(agent.windowStart) >= BigInt(agent.windowDuration);
    return {
      id: agent.id,
      name: agent.name || 'Local Agent',
      role: 'Local test agent · Read-only controls',
      spent: expired ? 0 : usdc(agent.windowSpentBaseUnits),
      cap: usdc(agent.maxPerTxBaseUnits),
      budget: usdc(agent.windowLimitBaseUnits),
      requests: agent.minTxInterval === 0 ? 60 : Math.min(60, Math.floor(60 / agent.minTxInterval)),
      frozen: Boolean(data.isPaused) || agent.isFrozen,
      allowlistEnabled: agent.allowlistEnabled,
      recipients: (agent.allowlist ?? []).join('\n'),
      icon: 'code',
    };
  });
  const activity = data.payments.map((payment): Activity => ({
    id: payment.id,
    merchant: payment.merchant || 'Local paid API',
    agent: payment.agentName || 'Local Agent',
    amount: usdc(payment.amountBaseUnits),
    status: 'settled',
    signature: payment.signature,
    time: relativeTime(payment.settledAt),
  }));
  return {
    balance: usdc(data.balanceBaseUnits),
    agents,
    activity,
    indexedSpend: activity.reduce((total, payment) => total + payment.amount, 0),
    isPaused: Boolean(data.isPaused),
  };
}
