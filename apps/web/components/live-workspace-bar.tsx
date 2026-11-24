import { LockKeyhole } from 'lucide-react';
import type { OwnerWalletController } from '../hooks/use-owner-wallet';
import type { LocalWorkspaceStatus } from '../lib/workspace';

interface LiveWorkspaceBarProps {
  configured: boolean;
  status: LocalWorkspaceStatus;
  paused: boolean;
  connected: boolean;
  uninitialized: boolean;
  wallet: OwnerWalletController;
  onCopyVaultConfig?: (() => void) | undefined;
  onExploreDemo: () => void;
}

export function LiveWorkspaceBar({
  configured,
  status,
  paused,
  connected,
  uninitialized,
  wallet,
  onCopyVaultConfig,
  onExploreDemo,
}: LiveWorkspaceBarProps) {
  let message = 'Connecting to your vault…';
  if (!configured) message = 'Live workspace needs setup';
  else if (uninitialized) message = 'Owner wallet connected';
  else if (status === 'unavailable')
    message = 'Could not load chain state. Check the connection and config.';
  else if (status === 'ready')
    message = paused
      ? 'Treasury paused'
      : connected
        ? 'Owner wallet connected'
        : 'Connect the vault owner wallet to manage policies';

  return (
    <div className={`live-banner ${paused ? 'is-paused' : ''}`}>
      <LockKeyhole size={16} aria-hidden="true" />
      <div>
        <strong role="status">{message}</strong>
        {wallet.error && <p role="alert">{wallet.error}</p>}
        {!connected && configured && wallet.choices.length > 0 && (
          <div className="live-wallet-choices" role="group" aria-label="Choose an owner wallet">
            {wallet.choices.map((choice) => (
              <button
                key={choice.id}
                disabled={wallet.connecting}
                onClick={() => void wallet.connect(choice)}
              >
                {choice.name}
              </button>
            ))}
          </div>
        )}
      </div>
      {connected && <button onClick={wallet.disconnect}>Disconnect</button>}
      {onCopyVaultConfig && <button onClick={onCopyVaultConfig}>Copy vault config</button>}
      {!configured && <button onClick={onExploreDemo}>Open demo</button>}
    </div>
  );
}
