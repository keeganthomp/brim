import { ArrowUpRight, ChevronDown } from 'lucide-react';
import type { WorkspaceMode } from '../lib/workspace';

interface WorkspaceHeaderProps {
  mode: WorkspaceMode;
  onModeChange: (mode: WorkspaceMode) => void;
}

export function WorkspaceHeader({ mode, onModeChange }: WorkspaceHeaderProps) {
  const sdkDocsUrl =
    process.env.NEXT_PUBLIC_BRIM_SDK_DOCS_URL ||
    (process.env.NODE_ENV === 'development'
      ? '/docs/sdk/#use-two-inputs'
      : 'https://github.com/keeganthomp/brim/blob/main/apps/site/content/docs/sdk.mdx#use-two-inputs');
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
        <nav className="header-actions" aria-label="Workspace">
          <a
            className="header-docs-link"
            href={sdkDocsUrl}
            target="_blank"
            rel="noreferrer"
            aria-label="SDK docs (opens in a new tab)"
          >
            SDK docs <ArrowUpRight size={13} aria-hidden="true" />
          </a>
          <div className="workspace-select">
            <select
              aria-label="Workspace mode"
              value={mode}
              onChange={(event) => onModeChange(event.target.value as WorkspaceMode)}
            >
              <option value="demo">Demo workspace</option>
              <option value="local">Local workspace</option>
              <option value="live">Live workspace</option>
            </select>
            <ChevronDown size={14} aria-hidden="true" />
          </div>
        </nav>
      </div>
    </header>
  );
}
