import { describe, expect, it } from 'vitest';
import { getBase58Decoder } from '@solana/kit';
import { reconcilePending } from '../src/index.js';
import type { PendingEventStore, Verification } from '../src/index.js';

const vault = getBase58Decoder().decode(new Uint8Array(32).fill(1));
const foreign = getBase58Decoder().decode(new Uint8Array(32).fill(2));
const signatures = ['1'.repeat(88), '2'.repeat(88), '3'.repeat(88), '4'.repeat(88), '5'.repeat(88)];
const paid = (v = vault): Verification => ({
  status: 'settled',
  slot: 123,
  payments: [
    {
      vault: v,
      agentKey: vault,
      recipient: foreign,
      amount: '40000',
      timestamp: '1700000000',
      eventIndex: 0,
    },
  ],
});

/** Test adapter models atomic final-state writes; SQL locking itself requires PostgreSQL integration QA. */
function queue(): PendingEventStore & {
  outcomes: Map<string, Verification>;
  paymentKeys: Set<string>;
  attempts: Map<string, number>;
} {
  const outcomes = new Map(signatures.map((sig) => [sig, { status: 'pending' } as Verification]));
  const paymentKeys = new Set<string>();
  const attempts = new Map<string, number>();
  return {
    outcomes,
    paymentKeys,
    attempts,
    async claimPending(limit) {
      const selected = [...outcomes.entries()]
        .filter(([, proof]) => proof.status === 'pending')
        .sort(([a], [b]) => (attempts.get(a) ?? 0) - (attempts.get(b) ?? 0))
        .slice(0, limit)
        .map(([signature]) => signature);
      selected.forEach((signature) => attempts.set(signature, (attempts.get(signature) ?? 0) + 1));
      return selected;
    },
    async record(signature, proof) {
      if (outcomes.get(signature)?.status !== 'pending') return;
      outcomes.set(signature, proof);
      if (proof.status === 'settled')
        proof.payments.forEach((payment) => paymentKeys.add(`${signature}:${payment.eventIndex}`));
    },
  };
}

describe('bounded pending reconciliation', () => {
  it('continues after individual RPC errors, preserves pending, and filters foreign vault payments', async () => {
    const store = queue();
    const result = await reconcilePending({
      store,
      trackedVaults: [vault],
      concurrency: 2,
      verifyTransaction: async (sig) => {
        if (sig === signatures[0]) throw new Error('https://sensitive-rpc-secret.invalid');
        if (sig === signatures[1]) return { status: 'pending' };
        if (sig === signatures[2]) return paid(foreign);
        if (sig === signatures[3]) return { status: 'failed', slot: 123 };
        return paid();
      },
    });
    expect(result).toEqual({
      attempted: 5,
      settled: 1,
      failed: 1,
      unrelated: 1,
      pending: 1,
      errors: 1,
    });
    expect(JSON.stringify(result)).not.toContain('sensitive');
    expect(store.outcomes.get(signatures[0]!)?.status).toBe('pending');
    expect(store.outcomes.get(signatures[1]!)?.status).toBe('pending');
    expect(store.paymentKeys.size).toBe(1);
  });
  it('enforces both batch count and active RPC concurrency', async () => {
    const store = queue();
    let active = 0;
    let peak = 0;
    const result = await reconcilePending({
      store,
      trackedVaults: [vault],
      limit: 3,
      concurrency: 2,
      verifyTransaction: async () => {
        active++;
        peak = Math.max(peak, active);
        await Promise.resolve();
        active--;
        return paid();
      },
    });
    expect(result.attempted).toBe(3);
    expect(peak).toBe(2);
    expect(store.paymentKeys.size).toBe(3);
  });
  it('overlapping passes and a subsequent retry cannot duplicate payment records', async () => {
    const store = queue();
    const options = {
      store,
      trackedVaults: [vault],
      verifyTransaction: async () => {
        await Promise.resolve();
        return paid();
      },
    };
    await Promise.all([reconcilePending(options), reconcilePending(options)]);
    expect(store.paymentKeys.size).toBe(5);
    expect(await reconcilePending(options)).toEqual({
      attempted: 0,
      settled: 0,
      failed: 0,
      unrelated: 0,
      pending: 0,
      errors: 0,
    });
  });
  it('persistent failures rotate behind never-attempted records rather than starving the queue', async () => {
    const store = queue();
    const attempted: string[] = [];
    const options = {
      store,
      trackedVaults: [vault],
      limit: 1,
      verifyTransaction: async (signature: string): Promise<Verification> => {
        attempted.push(signature);
        throw new Error('unavailable');
      },
    };
    await reconcilePending(options);
    await reconcilePending(options);
    expect(attempted).toEqual([signatures[0], signatures[1]]);
  });
  it('rejects invalid bounds and tracking configuration before touching the queue', async () => {
    const store = queue();
    const options = {
      store,
      trackedVaults: [vault],
      verifyTransaction: async (): Promise<Verification> => ({ status: 'pending' }),
    };
    await expect(reconcilePending({ ...options, limit: 501 })).rejects.toThrow(
      'INVALID_RECONCILIATION_LIMIT',
    );
    await expect(reconcilePending({ ...options, concurrency: 0 })).rejects.toThrow(
      'INVALID_RECONCILIATION_CONCURRENCY',
    );
    await expect(reconcilePending({ ...options, trackedVaults: [] })).rejects.toThrow(
      'INVALID_TRACKED_VAULTS',
    );
    expect(store.attempts.size).toBe(0);
  });
});
