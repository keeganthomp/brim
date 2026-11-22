'use client';

import dynamic from 'next/dynamic';
import { loadFundsActions, loadPolicyActions } from '../lib/deferred-actions';

const loadPolicy = () => import('./policy/agent-policy-drawer');
const loadFunds = () => import('./funds/funds-dialog');

function LoadingControls() {
  return (
    <div className="sheet-loading" role="status" aria-live="polite">
      <span aria-hidden="true" /> Opening controls…
    </div>
  );
}

// Closed sheets contribute no interactive runtime to the initial dashboard.
export const DeferredPolicyDrawer = dynamic(
  () => loadPolicy().then((module) => module.AgentPolicyDrawer),
  { ssr: false, loading: LoadingControls },
);
export const DeferredFundsDialog = dynamic(() => loadFunds().then((module) => module.FundsDialog), {
  ssr: false,
  loading: LoadingControls,
});

// Intent preloading warms sheets before a click; failure remains retryable.
export const preloadPolicyDrawer = () => {
  void Promise.all([loadPolicy(), loadPolicyActions()]).catch(() => undefined);
};
export const preloadFundsDialog = () => {
  void Promise.all([loadFunds(), loadFundsActions()]).catch(() => undefined);
};
