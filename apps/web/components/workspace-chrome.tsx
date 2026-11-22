import { FlaskConical, LockKeyhole } from 'lucide-react';
import type { LocalWorkspaceStatus, WorkspaceMode } from '../lib/workspace';

const localMessages: Record<LocalWorkspaceStatus, string> = {
  connecting: 'Connecting to your local workspace',
  ready: 'Local workspace · Test funds only',
  unavailable: 'Local workspace is unavailable',
  paused: 'Local updates are paused',
};

interface WorkspaceHeadingProps {
  mode: WorkspaceMode;
  localStatus: LocalWorkspaceStatus;
  localPaused: boolean;
  onExploreDemo: () => void;
}

export function WorkspaceHeading({
  mode,
  localStatus,
  localPaused,
  onExploreDemo,
}: WorkspaceHeadingProps) {
  return (
    <>
      <div className="page-heading">
        <h1>Overview</h1>
        <span className="network-label">
          <svg
            className="network-symbol"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="m6 4-3 3h15l3-3H6Zm-3 6 3 3h15l-3-3H3Zm3 6-3 3h15l3-3H6Z" />
          </svg>
          Solana <span className="network-divider">/</span>
          {mode === 'local' ? 'Test USDC' : 'USDC'}
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
            <p>
              {localStatus === 'ready'
                ? 'Verified test payments and a read-only vault.'
                : 'Start the local stack to view its balances and payments. Test funds have no cash value.'}
            </p>
          </div>
          <button onClick={onExploreDemo}>Open demo</button>
        </div>
      )}
      {mode === 'live' && (
        <div className="live-banner">
          <LockKeyhole size={18} aria-hidden="true" />
          <div>
            <strong>Connect your treasury</strong>
            <p>
              Live payments need a connected owner wallet and a deployed vault. Controls are
              disabled.
            </p>
          </div>
          <button onClick={onExploreDemo}>Open demo</button>
        </div>
      )}
    </>
  );
}
