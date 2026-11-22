import { expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { PostgresEventStore } from '../src/index.js';

it('discards a connection whose failed transaction cannot be rolled back', async () => {
  const release = vi.fn();
  const client = {
    release,
    query: vi.fn(async (sql: string) => {
      if (sql === 'BEGIN' || sql.startsWith('SET LOCAL')) return { rows: [], rowCount: 0 };
      throw new Error('Unavailable database connection');
    }),
  };
  const pool = { connect: async () => client } as unknown as Pool;
  const store = new PostgresEventStore(pool);
  await expect(store.record('1'.repeat(88), { status: 'pending' })).rejects.toMatchObject({
    code: 'DATABASE_UNAVAILABLE',
  });
  expect(release).toHaveBeenCalledExactlyOnceWith(true);
});
