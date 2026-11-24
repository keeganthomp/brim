import { randomBytes } from 'node:crypto';
import { getBase58Decoder } from '@solana/kit';
import { Effect } from 'effect';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrateDatabaseEffect, PostgresEventStore } from '@brim/indexer';
import { activityFeed } from './activity-feed';
import { readVerifiedPayments } from './verified-feed';

const connectionString = process.env.BRIM_TEST_DATABASE_URL;
const schema = `brim_feed_test_${randomBytes(8).toString('hex')}`;
const key = (bytes: number, value: number) =>
  getBase58Decoder().decode(new Uint8Array(bytes).fill(value));
const vault = key(32, 1);
const otherVault = key(32, 2);
const agent = key(32, 3);

describe.runIf(Boolean(connectionString))('isolated verified Activity database projection', () => {
  let admin: Pool;
  let pool: Pool;
  beforeAll(async () => {
    admin = new Pool({ connectionString, max: 1 });
    await admin.query(`CREATE SCHEMA "${schema}"`);
    pool = new Pool({ connectionString, max: 2, options: `-c search_path=${schema}` });
    await Effect.runPromise(migrateDatabaseEffect(pool));
    const store = new PostgresEventStore(pool);
    for (const [index, recipientVault] of [vault, otherVault].entries())
      await store.record(key(64, index + 1), {
        status: 'settled',
        slot: 123,
        payments: [
          {
            vault: recipientVault,
            agentKey: agent,
            recipient: agent,
            amount: '40000',
            timestamp: '1700000000',
            eventIndex: 0,
          },
        ],
      });
    await store.record(key(64, 7), { status: 'pending' });
  });
  afterAll(async () => {
    await pool?.end();
    if (admin) {
      await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await admin.end();
    }
  });
  it('returns settled public facts only for the explicitly requested vault', async () => {
    const payments = await Effect.runPromise(readVerifiedPayments(pool, vault));
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({
      vaultAddress: vault,
      agentKey: agent,
      amountBaseUnits: '40000',
      slot: '123',
    });
    const response = await Effect.runPromise(
      activityFeed(
        new Request(`https://brim.test/api/activity?vault=${vault}`),
        {
          BRIM_PUBLIC_ACTIVITY_ENABLED: 'true',
          BRIM_TRACKED_VAULTS: vault,
          DATABASE_URL: 'configured-test-database',
        },
        () => Effect.succeed(pool),
      ),
    );
    expect(response.status).toBe(200);
    expect((await response.json()).payments).toEqual(payments);
  });
  it('never turns the tracked-vault list into unscoped or cross-vault database access', async () => {
    const response = await Effect.runPromise(
      activityFeed(
        new Request(`https://brim.test/api/activity?vault=${otherVault}`),
        {
          BRIM_PUBLIC_ACTIVITY_ENABLED: 'true',
          BRIM_TRACKED_VAULTS: vault,
          DATABASE_URL: 'configured-test-database',
        },
        () => Effect.succeed(pool),
      ),
    );
    expect(response.status).toBe(404);
    expect((await Effect.runPromise(readVerifiedPayments(pool, otherVault)))[0]?.vaultAddress).toBe(
      otherVault,
    );
  });
});
