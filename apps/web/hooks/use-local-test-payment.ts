'use client';

import { useRef, useState } from 'react';

export function useLocalTestPayment(available: boolean, refresh: () => void) {
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<{ amount: string; signature: string }>();

  async function run() {
    if (!available || pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(undefined);
    setResult(undefined);
    try {
      const { runLocalTestPayment } = await import('../lib/local/test-payment');
      const reply = await runLocalTestPayment();
      if (reply.ok) setResult(reply.result);
      else setError(reply.message);
      refresh();
    } catch {
      setError('Could not start the test payment. Try reloading the dashboard.');
    } finally {
      setBusy(false);
      pending.current = false;
    }
  }

  return { available, busy, error, result, run };
}
