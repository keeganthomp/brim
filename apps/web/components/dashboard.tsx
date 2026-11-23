'use client';

import { useDashboard } from '../hooks/use-dashboard';
import { ActivityFeed } from './activity/activity-feed';
import { AgentList } from './agents/agent-list';
import {
  DeferredFundsDialog,
  DeferredPolicyDrawer,
  preloadFundsDialog,
  preloadPolicyDrawer,
} from './deferred-controls';
import { BalanceOverview } from './overview/balance-overview';
import { SpendOverview } from './overview/spend-overview';
import { NotificationToast } from './ui/notification-toast';
import { WorkspaceHeading } from './workspace-chrome';
import { WorkspaceHeader } from './workspace-header';

export function Dashboard() {
  const dashboard = useDashboard();
  const { mode, ready, balance, policy, funds, notification } = dashboard;
  const editable = dashboard.demo && dashboard.demoReady;

  return (
    <>
      <WorkspaceHeader mode={mode} onModeChange={dashboard.changeMode} />
      <main className="main-shell">
        <WorkspaceHeading
          mode={mode}
          localStatus={dashboard.localStatus}
          localPaused={dashboard.localPaused}
          onExploreDemo={() => dashboard.changeMode('demo')}
          onCopyVaultConfig={dashboard.canCopyVaultConfig ? dashboard.copyVaultConfig : undefined}
        />
        <div className="dashboard-grid">
          <BalanceOverview
            mode={mode}
            balance={balance}
            editable={editable}
            onFunds={funds.open}
            onFundsIntent={preloadFundsDialog}
          />
          <AgentList
            mode={mode}
            ready={ready}
            editable={editable}
            agents={dashboard.agents}
            budget={dashboard.budget}
            onEdit={policy.openAgent}
            onFreeze={policy.freezeAgent}
            onPolicyIntent={preloadPolicyDrawer}
          />
          <ActivityFeed
            mode={mode}
            ready={ready}
            activities={dashboard.activities}
            filter={dashboard.filter}
            onFilterChange={dashboard.setFilter}
            onSelect={dashboard.selectActivity}
          />
          <SpendOverview
            mode={mode}
            ready={ready}
            indexedSpend={dashboard.indexedSpend}
            activeCount={dashboard.activeCount}
            spent={dashboard.spent}
          />
        </div>
      </main>
      {policy.draft && <DeferredPolicyDrawer controller={policy} />}
      {funds.mode && <DeferredFundsDialog controller={funds} balance={balance ?? 0} />}
      <NotificationToast toast={notification.toast} onDismiss={notification.dismiss} />
    </>
  );
}
