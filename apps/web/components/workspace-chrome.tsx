import { ArrowDownToLine, FlaskConical, LoaderCircle, Plus } from 'lucide-react';
import type { OwnerWalletController } from '../hooks/use-owner-wallet';
import type { LocalWorkspaceStatus, WorkspaceMode } from '../lib/workspace';
import { LiveWorkspaceBar } from './live-workspace-bar';

const localMessages: Record<LocalWorkspaceStatus, string> = {
  connecting: 'Connecting to local workspace…',
  ready: 'Local test funds',
  unavailable: 'Local workspace is unavailable',
  paused: 'Updates paused',
};

interface WorkspaceHeadingProps {
  mode: WorkspaceMode;
  chainStatus: LocalWorkspaceStatus;
  chainPaused: boolean;
  liveConfigured: boolean;
  connectedOwner: boolean;
  ownerWallet: OwnerWalletController;
  canWritePolicy: boolean;
  vaultInitialized: boolean;
  canCreateVault: boolean;
  creatingVault: boolean;
  canFundVault: boolean;
  balance: number | null;
  createVault: () => void | Promise<void>;
  onDeposit: () => void;
  onFundsIntent: () => void;
  onAddPolicy: () => void;
  onPolicyIntent: () => void;
  onExploreDemo: () => void;
  onCopyVaultConfig?: (() => void) | undefined;
}

export function WorkspaceHeading({
  mode,
  chainStatus,
  chainPaused,
  liveConfigured,
  connectedOwner,
  ownerWallet,
  canWritePolicy,
  vaultInitialized,
  canCreateVault,
  creatingVault,
  canFundVault,
  balance,
  createVault,
  onDeposit,
  onFundsIntent,
  onAddPolicy,
  onPolicyIntent,
  onExploreDemo,
  onCopyVaultConfig,
}: WorkspaceHeadingProps) {
  const connectWallet = mode === 'live' && liveConfigured && !connectedOwner;
  const firstVault = mode === 'live' && (canCreateVault || creatingVault);
  const needsFunding = mode === 'live' && vaultInitialized && canFundVault && balance === 0;
  return (
    <>
      <div className="page-heading">
        <h1>Treasury</h1>
        {connectWallet ? (
          <button
            className="button primary add-policy-button"
            disabled={ownerWallet.connecting}
            onClick={() => void ownerWallet.connect()}
          >
            {ownerWallet.connecting ? 'Connecting…' : 'Connect owner wallet'}
          </button>
        ) : firstVault ? (
          <button
            className="button primary add-policy-button"
            disabled={creatingVault || !canCreateVault}
            aria-busy={creatingVault}
            onClick={() => void createVault()}
          >
            {creatingVault && (
              <LoaderCircle size={15} className="busy-indicator" aria-hidden="true" />
            )}
            {creatingVault ? 'Creating vault…' : 'Create vault'}
          </button>
        ) : needsFunding ? (
          <button
            className="button primary add-policy-button"
            onClick={onDeposit}
            onPointerEnter={onFundsIntent}
            onFocus={onFundsIntent}
            onTouchStart={onFundsIntent}
          >
            <ArrowDownToLine size={15} aria-hidden="true" /> Deposit
          </button>
        ) : (
          <button
            className="button primary add-policy-button"
            disabled={!canWritePolicy}
            onClick={onAddPolicy}
            onPointerEnter={onPolicyIntent}
            onFocus={onPolicyIntent}
            onTouchStart={onPolicyIntent}
          >
            <Plus size={16} aria-hidden="true" /> Add policy
          </button>
        )}
      </div>
      {mode === 'local' && (
        <div
          className={`live-banner local-banner ${chainPaused ? 'is-paused' : ''}`}
          role="status"
          aria-live="polite"
        >
          <FlaskConical size={16} aria-hidden="true" />
          <div>
            <strong>
              {chainPaused
                ? 'Treasury paused'
                : chainStatus === 'ready' && !canWritePolicy
                  ? 'Local test funds · Read-only'
                  : localMessages[chainStatus]}
            </strong>
            {chainStatus === 'unavailable' && (
              <p>
                Run <code>npm run dev</code> to reconnect.
              </p>
            )}
          </div>
          {chainStatus === 'ready' && onCopyVaultConfig ? (
            <button type="button" onClick={onCopyVaultConfig}>
              Copy vault config
            </button>
          ) : (
            <button onClick={onExploreDemo}>Open demo</button>
          )}
        </div>
      )}
      {mode === 'live' && (
        <LiveWorkspaceBar
          configured={liveConfigured}
          status={chainStatus}
          paused={chainPaused}
          connected={connectedOwner}
          uninitialized={firstVault}
          wallet={ownerWallet}
          onCopyVaultConfig={onCopyVaultConfig}
          onExploreDemo={onExploreDemo}
        />
      )}
    </>
  );
}
