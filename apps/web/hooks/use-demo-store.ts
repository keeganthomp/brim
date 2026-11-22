'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { loadBrowserEffects } from '../lib/deferred-actions';
import { DEMO_STORAGE_KEY, initialDemo, type DemoState } from '../lib/demo';

/** Sample state never authorizes payments; unused modes perform no storage work. */
export function useDemoStore(enabled: boolean) {
  const [state, setStoredState] = useState<DemoState>(initialDemo);
  const [hydrated, setHydrated] = useState(false);
  const revision = useRef(0);
  const persistedRevision = useRef(0);
  const loaded = useRef(false);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const setState: Dispatch<SetStateAction<DemoState>> = useCallback((next) => {
    // Never apply a sample mutation while a saved treasury is still being restored.
    if (!loaded.current || !enabledRef.current) return;
    revision.current += 1;
    setStoredState(next);
  }, []);

  useLayoutEffect(() => {
    if (!enabled || loaded.current) return;
    let active = true;
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(DEMO_STORAGE_KEY);
    } catch {
      // Private browsing or a disabled storage API leaves an in-memory demo.
    }
    if (saved === null) {
      loaded.current = true;
      setHydrated(true);
      return;
    }
    void loadBrowserEffects()
      .then(({ decodeDemoState }) => decodeDemoState(saved))
      .then((restored) => {
        if (!active) return;
        if (restored) setStoredState(restored);
        loaded.current = true;
        setHydrated(true);
      })
      .catch(() => {
        // A failed chunk download must not unlock sample edits over unknown saved data.
        // Returning to demo mode or reloading will retry without changing storage.
      });
    return () => {
      active = false;
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !hydrated || revision.current <= persistedRevision.current) return;
    const currentRevision = revision.current;
    let active = true;
    const canPersist = () => active && enabledRef.current && revision.current === currentRevision;
    void loadBrowserEffects()
      .then(async ({ persistDemoState }) => {
        if (!canPersist()) return;
        await persistDemoState(state, canPersist);
        if (canPersist()) persistedRevision.current = currentRevision;
      })
      .catch(() => {
        // The demo stays available in memory if a lazy chunk or storage fails.
      });
    return () => {
      active = false;
    };
  }, [enabled, hydrated, state]);

  return { state, setState, ready: hydrated };
}
