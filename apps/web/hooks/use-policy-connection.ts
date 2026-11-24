'use client';

import { useRef, useState } from 'react';
import type { LiveWorkspaceConnection } from '../lib/live/client';

export type PolicyConnectionStatus =
  { status: 'idle' | 'checking' } | { status: 'ready' | 'blocked' | 'error'; message: string };

export function usePolicyConnection(config?: LiveWorkspaceConnection) {
  const [status, setStatus] = useState<PolicyConnectionStatus>({ status: 'idle' });
  const pending = useRef<AbortController | null>(null);

  function reset() {
    pending.current?.abort();
    pending.current = null;
    setStatus({ status: 'idle' });
  }

  async function check(agentPublicKey: string, resourceUrl?: string) {
    if (!config || pending.current) return;
    const current = new AbortController();
    pending.current = current;
    setStatus({ status: 'checking' });
    try {
      const { checkBrimConnection } = await import('@brim/sdk');
      if (current.signal.aborted) return;
      const report = await checkBrimConnection(
        {
          vaultConfig: config.vaultConfig,
          agentPublicKey,
          ...(config.rpcUrl ? { rpcUrl: config.rpcUrl } : {}),
          ...(resourceUrl?.trim() ? { resourceUrl: resourceUrl.trim() } : {}),
        },
        { signal: current.signal },
      );
      if (current.signal.aborted) return;
      const blocker = report.blockers[0];
      if (blocker) {
        setStatus({ status: 'blocked', message: blocker.message });
        return;
      }
      setStatus({
        status: 'ready',
        message:
          report.merchant?.status === 'quote'
            ? 'Quote and policy match. A test payment verifies settlement.'
            : report.merchant?.status === 'free'
              ? 'Policy is ready. The endpoint responded without requesting payment.'
              : 'Policy and vault are ready.',
      });
    } catch {
      if (!current.signal.aborted)
        setStatus({
          status: 'error',
          message: resourceUrl?.trim()
            ? 'Could not read the quote. Check the URL or try the SDK from your agent runtime.'
            : 'Could not check the connection. Verify your vault and RPC.',
        });
    } finally {
      if (pending.current === current) pending.current = null;
    }
  }

  return { status, check, reset };
}
