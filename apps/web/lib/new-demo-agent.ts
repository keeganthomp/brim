import type { Agent } from './demo';

/** A draft needs no schema runtime; validation happens when it is submitted. */
export function newDemoAgent(): Agent {
  return {
    id: crypto.randomUUID(),
    name: '',
    role: 'Custom agent',
    spent: 0,
    cap: 1,
    budget: 50,
    requests: 20,
    frozen: false,
    allowlistEnabled: false,
    recipients: '',
    icon: 'code',
  };
}
