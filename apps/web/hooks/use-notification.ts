'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** One notification; a new id replays the toast's entrance even for a repeated message. */
export interface Toast {
  readonly id: number;
  readonly message: string;
}

const VISIBLE_MS = 5500;
const RESUMED_MS = 2500;

/** A single auto-dismissing toast that holds open while a pointer or focus is on it. */
export function useNotification() {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const paused = useRef(false);
  const count = useRef(0);

  useEffect(() => () => clearTimeout(timer.current), []);

  const hideAfter = useCallback((ms: number) => {
    clearTimeout(timer.current);
    if (!paused.current) timer.current = setTimeout(() => setToast(null), ms);
  }, []);

  const notify = useCallback(
    (message: string) => {
      count.current += 1;
      setToast({ id: count.current, message });
      hideAfter(VISIBLE_MS);
    },
    [hideAfter],
  );

  const dismiss = useCallback(() => {
    clearTimeout(timer.current);
    paused.current = false;
    setToast(null);
  }, []);

  // Pointer or keyboard attention holds a toast open; leaving gives a short grace period.
  const pause = useCallback(() => {
    paused.current = true;
    clearTimeout(timer.current);
  }, []);
  const resume = useCallback(() => {
    paused.current = false;
    hideAfter(RESUMED_MS);
  }, [hideAfter]);

  return { toast, notify, dismiss, pause, resume };
}
