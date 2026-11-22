'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export function useNotification() {
  const [toast, setToast] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const notify = useCallback((message: string) => {
    setToast(message);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(''), 5500);
  }, []);

  return { toast, notify, dismiss: () => setToast('') };
}
