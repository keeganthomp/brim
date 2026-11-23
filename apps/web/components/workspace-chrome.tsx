import { FlaskConical, LockKeyhole } from 'lucide-react';
import type { LocalWorkspaceStatus, WorkspaceMode } from '../lib/workspace';

const localMessages: Record<LocalWorkspaceStatus, string> = {
  connecting: 'Connecting to your local workspace',
  ready: 'Test funds · Read-only',
  unavailable: 'Local workspace is unavailable',
  paused: 'Local updates are paused',
};

interface WorkspaceHeadingProps {
  mode: WorkspaceMode;
  localStatus: LocalWorkspaceStatus;
  localPaused: boolean;
  onExploreDemo: () => void;
  onCopyVaultConfig?: (() => void) | undefined;
}

export function WorkspaceHeading({
  mode,
  localStatus,
  localPaused,
  onExploreDemo,
  onCopyVaultConfig,
}: WorkspaceHeadingProps) {
  return (
    <>
      <div className="page-heading">
        <h1>Treasury</h1>
        <span className="network-label">
          <svg
            className="network-symbol"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="m6 4-3 3h15l3-3H6Zm-3 6 3 3h15l-3-3H3Zm3 6-3 3h15l3-3H6Z" />
          </svg>
          Solana
        </span>
      </div>
      {mode === 'local' && (
        <div
          className={`live-banner local-banner ${localPaused ? 'is-paused' : ''}`}
          role="status"
          aria-live="polite"
        >
          <FlaskConical size={18} aria-hidden="true" />
          <div>
            <strong>{localPaused ? 'Local treasury is paused' : localMessages[localStatus]}</strong>
            {localStatus === 'unavailable' && (
              <p>
                Run <code>npm run dev</code> to view local balances and test payments.
              </p>
            )}
          </div>
          {localStatus === 'ready' && onCopyVaultConfig ? (
            <button type="button" onClick={onCopyVaultConfig}>
              Copy vault config
            </button>
          ) : (
            <button onClick={onExploreDemo}>Open demo</button>
          )}
        </div>
      )}
      {mode === 'live' && (
        <div className="live-banner">
          <LockKeyhole size={18} aria-hidden="true" />
          <div>
            <strong>Live workspace needs setup</strong>
            <p>Live payments require a deployed vault and an owner wallet connection.</p>
          </div>
          <button onClick={onExploreDemo}>Open demo</button>
        </div>
      )}
    </>
  );
}
