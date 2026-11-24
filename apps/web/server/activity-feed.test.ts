import { getBase58Decoder } from '@solana/kit';
import { Effect } from 'effect';
import type { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { activityFeed } from './activity-feed';

const vault = getBase58Decoder().decode(new Uint8Array(32).fill(1));
const other = getBase58Decoder().decode(new Uint8Array(32).fill(2));
const signature = getBase58Decoder().decode(new Uint8Array(64).fill(3));
const environment = {
  BRIM_PUBLIC_ACTIVITY_ENABLED: 'true',
  BRIM_TRACKED_VAULTS: vault,
  DATABASE_URL: 'postgresql://configured-database',
};
const request = (query = `vault=${vault}`) =>
  new Request(`https://brim.test/api/activity?${query}`);
const row = {
  signature,
  event_index: 0,
  vault,
  agent_key: other,
  recipient: other,
  amount_base_units: '40000',
  chain_timestamp: '1700000000',
  slot: '123',
};
function database(rows: unknown[] = [row]) {
  const query = vi.fn(async (_sql: string, _values?: unknown[]) => ({ rows }));
  const connect = vi.fn((_connectionString: string) =>
    Effect.succeed({ query } as unknown as Pool),
  );
  return { query, connect };
}

describe('explicit public finalized Activity', () => {
  it('requires explicit opt-in and an exactly tracked vault before database access', async () => {
    for (const [env, input] of [
      [{ ...environment, BRIM_PUBLIC_ACTIVITY_ENABLED: undefined }, request()],
      [environment, request(`vault=${other}`)],
      [{ ...environment, BRIM_TRACKED_VAULTS: undefined }, request()],
    ] as const) {
      const db = database();
      expect((await Effect.runPromise(activityFeed(input, env, db.connect))).status).toBe(404);
      expect(db.connect).not.toHaveBeenCalled();
    }
  });
  it.each([
    '',
    'vault=invalid',
    `vault=${vault}&vault=${other}`,
    `vault=${vault}&secret=unexpected`,
  ])('rejects an invalid or ambiguous scope query: %s', async (query) => {
    const db = database();
    expect(
      (await Effect.runPromise(activityFeed(request(query), environment, db.connect))).status,
    ).toBe(400);
    expect(db.connect).not.toHaveBeenCalled();
  });
  it('returns only projected public chain facts from a bounded scoped SELECT', async () => {
    const db = database([{ ...row, merchant: 'UNVERIFIED_METADATA', bearer: 'PRIVATE_MARKER' }]);
    const response = await Effect.runPromise(activityFeed(request(), environment, db.connect));
    const body = await response.json();
    expect(body).toEqual({
      status: 'ready',
      commitment: 'finalized',
      vaultAddress: vault,
      payments: [
        {
          id: `${signature}:0`,
          signature,
          eventIndex: 0,
          vaultAddress: vault,
          agentKey: other,
          recipient: other,
          amountBaseUnits: '40000',
          chainTimestamp: '1700000000',
          settledAt: '2023-11-14T22:13:20.000Z',
          slot: '123',
        },
      ],
    });
    expect(response.headers.get('cache-control')).toBe('no-store');
    const [sql, values] = db.query.mock.calls[0]!;
    expect(sql).toMatch(/^SELECT /);
    expect(sql).toContain("notification.status = 'settled'");
    expect(sql).toContain('payment.vault = $1');
    expect(sql).toContain('LIMIT 50');
    expect(values).toEqual([vault]);
    expect(JSON.stringify(body)).not.toContain('PRIVATE_MARKER');
    expect(JSON.stringify(body)).not.toContain('UNVERIFIED_METADATA');
  });
  it('fails closed if returned rows do not match requested vault or the database fails', async () => {
    const db = database([{ ...row, vault: other }]);
    expect((await Effect.runPromise(activityFeed(request(), environment, db.connect))).status).toBe(
      503,
    );
    const failed = vi.fn((_connectionString: string) =>
      Effect.succeed({
        query: async () => {
          throw new Error('PRIVATE_PROVIDER_DIAGNOSTIC');
        },
      } as unknown as Pool),
    );
    const response = await Effect.runPromise(activityFeed(request(), environment, failed));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('PRIVATE_PROVIDER_DIAGNOSTIC');
  });
});
