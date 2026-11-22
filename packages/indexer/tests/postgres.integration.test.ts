import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Effect } from 'effect';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadMigrations, migrateDatabaseEffect, PostgresEventStore } from '../src/index.js';
import type { Verification } from '../src/index.js';

const connectionString = process.env.BRIM_TEST_DATABASE_URL;
const schema = `brim_indexer_test_${randomBytes(8).toString('hex')}`;
const vault = '11111111111111111111111111111111';
const payment: Verification = {
  status: 'settled',
  slot: 123,
  payments: [
    {
      vault,
      agentKey: vault,
      recipient: vault,
      amount: '40000',
      timestamp: '1700000000',
      eventIndex: 0,
    },
  ],
};

describe.runIf(Boolean(connectionString))('isolated PostgreSQL integration', () => {
  let admin: Pool;
  let pool: Pool;
  let directory: string;
  beforeAll(async () => {
    admin = new Pool({ connectionString, max: 1 });
    await admin.query(`CREATE SCHEMA "${schema}"`);
    pool = new Pool({ connectionString, max: 5, options: `-c search_path=${schema}` });
    directory = await mkdtemp(join(tmpdir(), 'brim-migration-test-'));
    for (const migration of await Effect.runPromise(loadMigrations())) {
      const raw = await readFile(
        new URL(`../migrations/${migration.name}`, import.meta.url),
        'utf8',
      );
      await writeFile(join(directory, migration.name), raw);
    }
  });
  afterAll(async () => {
    await pool?.end();
    if (admin) {
      await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await admin.end();
    }
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  it('applies and reapplies migrations and rejects checksum drift without changing repository SQL', async () => {
    expect(await Effect.runPromise(migrateDatabaseEffect(pool, directory))).toEqual({
      applied: 2,
      skipped: 0,
    });
    expect(await Effect.runPromise(migrateDatabaseEffect(pool, directory))).toEqual({
      applied: 0,
      skipped: 2,
    });
    const path = join(directory, '001_chain_events.sql');
    const original = await readFile(path, 'utf8');
    await writeFile(path, original.replace('COMMIT;', '-- isolated checksum drift test\nCOMMIT;'));
    await expect(Effect.runPromise(migrateDatabaseEffect(pool, directory))).rejects.toMatchObject({
      _tag: 'MigrationError',
      code: 'MIGRATION_CHECKSUM_MISMATCH',
    });
    await writeFile(path, original);
    expect(
      (await pool.query('SELECT count(*)::INT AS count FROM brim_schema_migrations')).rows[0].count,
    ).toBe(2);
  });

  it('concurrent repeated settled/pending writes yield exactly one canonical payment', async () => {
    const store = new PostgresEventStore(pool);
    const signature = '1'.repeat(88);
    await store.record(signature, { status: 'pending' });
    await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        store.record(signature, index % 2 ? payment : { status: 'pending' }),
      ),
    );
    expect(
      (
        await pool.query('SELECT status FROM brim_chain_notifications WHERE signature = $1', [
          signature,
        ])
      ).rows[0].status,
    ).toBe('settled');
    expect(
      (
        await pool.query('SELECT count(*)::INT AS count FROM brim_payments WHERE signature = $1', [
          signature,
        ])
      ).rows[0].count,
    ).toBe(1);
  });

  it('a finalized failed record cannot regress to pending or become a settled payment', async () => {
    const store = new PostgresEventStore(pool);
    const signature = '2'.repeat(88);
    await store.record(signature, { status: 'failed', slot: 123 });
    await Promise.all([
      store.record(signature, { status: 'pending' }),
      store.record(signature, payment),
    ]);
    expect(
      (
        await pool.query('SELECT status FROM brim_chain_notifications WHERE signature = $1', [
          signature,
        ])
      ).rows[0].status,
    ).toBe('failed');
    expect(
      (
        await pool.query('SELECT count(*)::INT AS count FROM brim_payments WHERE signature = $1', [
          signature,
        ])
      ).rows[0].count,
    ).toBe(0);
  });

  it('parallel pending selection rotates attempts and excludes finalized records', async () => {
    const store = new PostgresEventStore(pool);
    for (const char of ['3', '4', '5', '6', '7'])
      await store.record(char.repeat(88), { status: 'pending' });
    const selected = (await Promise.all([store.claimPending(2), store.claimPending(2)])).flat();
    expect(new Set(selected).size).toBe(4);
    expect(
      selected.every((signature) => !signature.startsWith('1') && !signature.startsWith('2')),
    ).toBe(true);
    expect(
      (
        await pool.query(
          "SELECT SUM(verification_attempts)::INT AS count FROM brim_chain_notifications WHERE status = 'pending'",
        )
      ).rows[0].count,
    ).toBe(4);
  });
});
