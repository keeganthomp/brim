import type { RegisteredAgentPolicy } from './read-vault';

export const workspaceAgentName = (agentKey: string, seededAgentAddress?: string) =>
  agentKey === seededAgentAddress
    ? 'Local Agent'
    : `Agent ${agentKey.slice(0, 4)}…${agentKey.slice(-4)}`;

/** Public JSON projection shared by local and browser-RPC dashboards. */
export const toWorkspaceAgents = (
  policies: readonly RegisteredAgentPolicy[],
  seededAgentAddress?: string,
) =>
  policies.map((policy) => ({
    id: policy.agentKey,
    name: workspaceAgentName(policy.agentKey, seededAgentAddress),
    agentKey: policy.agentKey,
    policyAddress: policy.policyAddress,
    isFrozen: policy.isFrozen,
    maxPerTxBaseUnits: policy.maxPerTx.toString(),
    windowLimitBaseUnits: policy.windowLimit.toString(),
    windowSpentBaseUnits: policy.windowSpent.toString(),
    windowStart: policy.windowStart.toString(),
    windowDuration: policy.windowDuration.toString(),
    minTxInterval: Number(policy.minTxInterval),
    allowlistEnabled: policy.allowlistEnabled,
    allowlist: policy.allowlist,
  }));
export type WorkspaceAgent = ReturnType<typeof toWorkspaceAgents>[number];
