'use client';

import { useEffect, useState } from 'react';
import { loadLocalClient } from '../lib/deferred-actions';
import type { LocalWorkspaceSnapshot } from '../lib/local/adapter';
import type { LocalWorkspaceStatus } from '../lib/workspace';

interface LocalState {
  status: LocalWorkspaceStatus;
  snapshot: LocalWorkspaceSnapshot | null;
}
const initial: LocalState = { status: 'connecting', snapshot: null };

export function useLocalWorkspace(enabled: boolean) {
  const [state, setState] = useState<LocalState>(initial);

  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let request: AbortController | undefined;

    async function refresh() {
      if (stopped || document.hidden) return;
      const current = new AbortController();
      request = current;
      try {
        const { fetchLocalWorkspace } = await loadLocalClient();
        if (stopped || current.signal.aborted || document.hidden) return;
        const snapshot = await fetchLocalWorkspace(current.signal);
        if (stopped || current.signal.aborted || document.hidden) return;
        setState({ status: 'ready', snapshot });
      } catch {
        if (!stopped && !current.signal.aborted)
          setState({ status: 'unavailable', snapshot: null });
      } finally {
        if (!stopped && !current.signal.aborted && !document.hidden)
          timer = setTimeout(refresh, 2000);
      }
    }

    function visibilityChanged() {
      clearTimeout(timer);
      request?.abort();
      setState({
        status: document.hidden ? 'paused' : 'connecting',
        snapshot: null,
      });
      if (!document.hidden) void refresh();
    }

    visibilityChanged();
    document.addEventListener('visibilitychange', visibilityChanged);
    return () => {
      stopped = true;
      clearTimeout(timer);
      request?.abort();
      document.removeEventListener('visibilitychange', visibilityChanged);
    };
  }, [enabled]);

  return { ...state, reset: () => setState(initial) };
}
