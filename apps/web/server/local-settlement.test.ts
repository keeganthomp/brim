import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { getBase58Decoder } from '@solana/kit';
import { Effect } from 'effect';
import { afterEach, describe, expect, it } from 'vitest';
import { IndexerPersistenceError, type PersistenceShape, type Verification } from '@brim/indexer';
import { createSettlementOutbox } from '../../../infra/local/payments/outbox';
import {
  recoverLocalSettlements,
  readLocalTrackedVaults,
} from '../../../infra/local/payments/ledger';

const directories: string[] = [];
const signature = getBase58Decoder().decode(new Uint8Array(64).fill(3));
const vault = getBase58Decoder().decode(new Uint8Array(32).fill(1));
const agent = getBase58Decoder().decode(new Uint8Array(32).fill(8));
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});
async function outbox() {
  const directory = await mkdtemp(path.join(tmpdir(), 'brim-settlement-'));
  directories.push(directory);
  return { directory, box: await Effect.runPromise(createSettlementOutbox(directory)) };
}

describe('durable local settlement handoff', () => {
  it('validates explicit local indexing scope, includes the seed, and permits an additional local vault', async () => {
    expect(await Effect.runPromise(readLocalTrackedVaults(vault))).toEqual([vault]);
    expect(
      await Effect.runPromise(readLocalTrackedVaults(vault, `${vault},${agent},${vault}`)),
    ).toEqual([vault, agent]);
    await expect(Effect.runPromise(readLocalTrackedVaults(vault, agent))).rejects.toBeDefined();
    await expect(
      Effect.runPromise(readLocalTrackedVaults(vault, `${vault},invalid`)),
    ).rejects.toBeDefined();
  });
  it('keeps captured public signatures across outbox restart and deduplicates delivery', async () => {
    const { directory, box } = await outbox();
    await Effect.runPromise(box.enqueue(signature));
    await Effect.runPromise(box.enqueue(signature));
    expect(await readdir(directory)).toEqual([`${signature}.pending`]);
    const restarted = await Effect.runPromise(createSettlementOutbox(directory));
    expect(await Effect.runPromise(restarted.pending)).toEqual([signature]);
  });
  it('retains the durable marker during database failure, then retries pending finality and any agent', async () => {
    const { box } = await outbox();
    await Effect.runPromise(box.enqueue(signature));
    let available = false;
    let proof: Verification = { status: 'pending' };
    const states = new Map<string, Verification>();
    const persistence: PersistenceShape = {
      record: (sig, state) =>
        available
          ? Effect.sync(() => {
              states.set(sig, state);
            })
          : Effect.fail(new IndexerPersistenceError({ code: 'UNAVAILABLE' })),
      claimPending: () =>
        Effect.succeed(
          [...states].filter(([, state]) => state.status === 'pending').map(([sig]) => sig),
        ),
    };
    const verify = async () => proof;
    await expect(
      Effect.runPromise(recoverLocalSettlements(box, persistence, verify, [vault])),
    ).rejects.toBeDefined();
    expect(await Effect.runPromise(box.pending)).toEqual([signature]);
    available = true;
    expect(
      (await Effect.runPromise(recoverLocalSettlements(box, persistence, verify, [vault]))).pending,
    ).toBe(1);
    expect(await Effect.runPromise(box.pending)).toEqual([]);
    proof = {
      status: 'settled',
      slot: 123,
      payments: [
        {
          vault,
          agentKey: agent,
          recipient: agent,
          amount: '40000',
          timestamp: '1700000000',
          eventIndex: 0,
        },
      ],
    };
    expect(
      (await Effect.runPromise(recoverLocalSettlements(box, persistence, verify, [vault]))).settled,
    ).toBe(1);
    expect(states.get(signature)).toMatchObject({
      status: 'settled',
      payments: [{ agentKey: agent, amount: '40000' }],
    });
  });
  it('retains verified events for an explicitly tracked second vault instead of terminalizing them as unrelated', async () => {
    const { box } = await outbox();
    await Effect.runPromise(box.enqueue(signature));
    const states = new Map<string, Verification>();
    const persistence: PersistenceShape = {
      record: (sig, state) =>
        Effect.sync(() => {
          states.set(sig, state);
        }),
      claimPending: () =>
        Effect.succeed(
          [...states].filter(([, state]) => state.status === 'pending').map(([sig]) => sig),
        ),
    };
    const verify = async (): Promise<Verification> => ({
      status: 'settled',
      slot: 123,
      payments: [
        {
          vault: agent,
          agentKey: vault,
          recipient: agent,
          amount: '40000',
          timestamp: '1700000000',
          eventIndex: 0,
        },
      ],
    });
    const result = await Effect.runPromise(
      recoverLocalSettlements(box, persistence, verify, [vault, agent]),
    );
    expect(result.settled).toBe(1);
    expect(states.get(signature)).toMatchObject({
      status: 'settled',
      payments: [{ vault: agent }],
    });
  });
});
