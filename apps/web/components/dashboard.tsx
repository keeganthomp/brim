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
import { SummaryStrip } from './overview/summary-strip';
import { NotificationToast } from './ui/notification-toast';
import { WorkspaceHeading } from './workspace-chrome';
import { WorkspaceHeader } from './workspace-header';

export function Dashboard() {
  const dashboard = useDashboard();
  const { mode, ready, balance, policy, funds, notification } = dashboard;
  const editable = dashboard.demo && dashboard.demoReady;

  return (
    <>
      <WorkspaceHeader
        mode={mode}
        onModeChange={dashboard.changeMode}
        onConnectWallet={dashboard.liveUnavailable}
      />
      <main className="main-shell">
        <WorkspaceHeading
          mode={mode}
          localStatus={dashboard.localStatus}
          localPaused={dashboard.localPaused}
          onExploreDemo={() => dashboard.changeMode('demo')}
        />
        <BalanceOverview
          mode={mode}
          balance={balance}
          editable={editable}
          indexedSpend={dashboard.indexedSpend}
          onFunds={funds.open}
          onFundsIntent={preloadFundsDialog}
        />
        <SummaryStrip
          mode={mode}
          ready={ready}
          activeCount={dashboard.activeCount}
          spent={dashboard.spent}
        />
        <div className="workspace-grid">
          <AgentList
            mode={mode}
            ready={ready}
            editable={editable}
            agents={dashboard.agents}
            budget={dashboard.budget}
            onEdit={policy.openAgent}
            onFreeze={policy.freezeAgent}
            onIntegration={dashboard.viewIntegration}
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
        </div>
      </main>
      {policy.draft && <DeferredPolicyDrawer controller={policy} />}
      {funds.mode && <DeferredFundsDialog controller={funds} balance={balance ?? 0} />}
      <NotificationToast toast={notification.toast} onDismiss={notification.dismiss} />
    </>
  );
}
