'use client';

import { useEffect, useRef, useState } from 'react';
import { loadLocalClient, loadLiveClient } from '../lib/deferred-actions';
import type { ChainWorkspaceSnapshot } from '../lib/local/adapter';
import type { LocalWorkspaceStatus } from '../lib/workspace';

interface LocalState {
  status: LocalWorkspaceStatus;
  snapshot: ChainWorkspaceSnapshot | null;
}
const initial: LocalState = { status: 'connecting', snapshot: null };

export function useChainWorkspace(mode: 'local' | 'live' | null) {
  const [state, setState] = useState<LocalState>(initial);
  const refreshNow = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!mode) return;
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
            : (await loadLiveClient()).fetchLiveWorkspace;
        if (stopped || current.signal.aborted || document.hidden) return;
        const snapshot = await fetchWorkspace(current.signal);
        if (stopped || current.signal.aborted || document.hidden) return;
        setState({ status: 'ready', snapshot });
      } catch {
        if (!stopped && !current.signal.aborted)
          setState({ status: 'unavailable', snapshot: null });
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
        previous.snapshot
          ? previous
          : { status: document.hidden ? 'paused' : 'connecting', snapshot: null },
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
  }, [mode]);

  return { ...state, reset: () => setState(initial), refresh: () => refreshNow.current?.() };
}
