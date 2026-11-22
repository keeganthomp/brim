import { ChevronDown, FlaskConical, Wallet } from 'lucide-react';
import type { WorkspaceMode } from '../lib/workspace';

interface WorkspaceHeaderProps {
  mode: WorkspaceMode;
  onModeChange: (mode: WorkspaceMode) => void;
  onConnectWallet: () => void;
}

export function WorkspaceHeader({ mode, onModeChange, onConnectWallet }: WorkspaceHeaderProps) {
  return (
    <header className="app-header">
      <div className="header-inner">
        <a href="/" className="brand" aria-label="Brim home">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 28 28" fill="currentColor">
              <rect x="6" y="5" width="4" height="18" rx="1" />
              <path d="M12 5h5a4 4 0 0 1 0 8h-5V5Zm0 10h6a4 4 0 0 1 0 8h-6v-8Z" />
            </svg>
          </span>
          <span className="brand-wordmark">brim</span>
        </a>
        <span className="header-divider" aria-hidden="true" />
        <span className="header-label">Treasury</span>
        <div className="header-right">
          <div className="workspace-select">
            <FlaskConical size={14} aria-hidden="true" />
            <select
              aria-label="Workspace mode"
              value={mode}
              onChange={(event) => onModeChange(event.target.value as WorkspaceMode)}
            >
              <option value="demo">Demo workspace</option>
              <option value="local">Local workspace</option>
              <option value="live">Live workspace</option>
            </select>
            <ChevronDown size={12} aria-hidden="true" />
          </div>
          <button
            className="button wallet-button"
            onClick={onConnectWallet}
            aria-label="Connect wallet"
          >
            <Wallet size={15} aria-hidden="true" />
            <span>Connect wallet</span>
          </button>
        </div>
      </div>
    </header>
  );
}
