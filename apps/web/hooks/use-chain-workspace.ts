'use client';

import { useEffect, useRef, useState } from 'react';
import { loadLocalClient, loadLiveClient } from '../lib/deferred-actions';
import type { LiveWorkspaceConnection } from '../lib/live/client';
import type { ChainWorkspaceSnapshot } from '../lib/local/adapter';
import type { LocalWorkspaceStatus } from '../lib/workspace';

interface LocalState {
  key: string | null;
  status: LocalWorkspaceStatus;
  snapshot: ChainWorkspaceSnapshot | null;
}
const initial: LocalState = { key: null, status: 'connecting', snapshot: null };

export function useChainWorkspace(mode: 'local' | 'live' | null, live?: LiveWorkspaceConnection) {
  const [state, setState] = useState<LocalState>(initial);
  const refreshNow = useRef<(() => void) | null>(null);
  const vaultConfig = live?.vaultConfig;
  const rpcUrl = live?.rpcUrl;
  const key = mode === 'local' ? 'local' : mode === 'live' ? (vaultConfig ?? null) : null;

  useEffect(() => {
    if (!key) return;
    const workspaceKey = key;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let request: AbortController | undefined;

    async function refresh() {
      if (stopped || document.hidden) return;
      const current = new AbortController();
      request = current;
      try {
        const fetchWorkspace =
          mode === 'local'
            ? (await loadLocalClient()).fetchLocalWorkspace
            : (signal: AbortSignal) =>
                loadLiveClient().then(({ fetchLiveWorkspace }) =>
                  fetchLiveWorkspace({ vaultConfig: workspaceKey, rpcUrl }, signal),
                );
        if (stopped || current.signal.aborted || document.hidden) return;
        const snapshot = await fetchWorkspace(current.signal);
        if (stopped || current.signal.aborted || document.hidden) return;
        setState((previous) => {
          const existing = previous.key === key && mode === 'live' ? previous.snapshot : null;
          return {
            key,
            status: 'ready',
            snapshot: existing
              ? {
                  ...snapshot,
                  activity: existing.activity,
                  activityAvailable: existing.activityAvailable,
                  indexedSpend: existing.indexedSpend,
                }
              : snapshot,
          };
        });
        if (mode === 'live' && snapshot.vaultAddress) {
          const vault = snapshot.vaultAddress;
          const activity = await import('../lib/live/activity-client')
            .then(({ fetchLiveActivity }) => fetchLiveActivity(vault, current.signal))
            .catch(() => undefined);
          if (stopped || current.signal.aborted || activity === undefined) return;
          setState((previous) =>
            previous.key === key && previous.snapshot
              ? {
                  ...previous,
                  snapshot: {
                    ...previous.snapshot,
                    activity: activity ?? [],
                    activityAvailable: activity !== null,
                    indexedSpend:
                      activity?.reduce((total, payment) => total + payment.amount, 0) ?? 0,
                  },
                }
              : previous,
          );
        }
      } catch {
        if (!stopped && !current.signal.aborted)
          setState({ key, status: 'unavailable', snapshot: null });
      } finally {
        if (!stopped && !current.signal.aborted && !document.hidden)
          timer = setTimeout(refresh, mode === 'local' ? 2_000 : 8_000);
      }
    }

    function restartRefresh() {
      clearTimeout(timer);
      request?.abort();
      if (document.hidden) return;
      void refresh();
    }

    function visibilityChanged() {
      setState((previous) =>
        previous.key === key && previous.snapshot
          ? previous
          : { key, status: document.hidden ? 'paused' : 'connecting', snapshot: null },
      );
      restartRefresh();
    }

    refreshNow.current = restartRefresh;
    visibilityChanged();
    document.addEventListener('visibilitychange', visibilityChanged);
    return () => {
      stopped = true;
      refreshNow.current = null;
      clearTimeout(timer);
      request?.abort();
      document.removeEventListener('visibilitychange', visibilityChanged);
    };
  }, [key, mode, rpcUrl]);

  return {
    ...(state.key === key ? state : initial),
    reset: () => setState(initial),
    refresh: () => refreshNow.current?.(),
  };
}
