import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import { loadMigrations, migrationBody, MigrationError } from '../src/index.js';

describe('transactional migration input', () => {
  it('uses existing outer transaction as the runner transaction so ledger and schema commit together', () => {
    expect(migrationBody('BEGIN;\nCREATE TABLE brim_example (id INT);\nCOMMIT;')).toBe(
      'CREATE TABLE brim_example (id INT);',
    );
    expect(migrationBody('CREATE TABLE brim_example (id INT);')).toBe(
      'CREATE TABLE brim_example (id INT);',
    );
  });
  it('rejects embedded transaction controls that could detach schema changes from the ledger', () => {
    expect(() => migrationBody('BEGIN; CREATE TABLE example (id INT); COMMIT; COMMIT;')).toThrow(
      'MIGRATION_TRANSACTION_INVALID',
    );
    expect(() => migrationBody('SELECT 1; COMMIT;')).toThrow('MIGRATION_TRANSACTION_INVALID');
  });
  it('loads ordered source migrations with stable exact-content checksums', async () => {
    const migrations = await Effect.runPromise(loadMigrations());
    expect(migrations.map((migration) => migration.name)).toEqual([
      '001_chain_events.sql',
      '002_pending_reconciliation.sql',
    ]);
    expect(migrations.every((migration) => /^[a-f0-9]{64}$/.test(migration.checksum))).toBe(true);
    expect(
      migrations.every(
        (migration) => !migration.sql.startsWith('BEGIN;') && !migration.sql.endsWith('COMMIT;'),
      ),
    ).toBe(true);
    expect(
      (await Effect.runPromise(loadMigrations())).map((migration) => migration.checksum),
    ).toEqual(migrations.map((migration) => migration.checksum));
  });
  it('redacts inaccessible filesystem details into a tagged failure', async () => {
    await expect(
      Effect.runPromise(loadMigrations('/missing-private-directory-brim')),
    ).rejects.toMatchObject({ _tag: 'MigrationError', code: 'MIGRATION_FILES_UNAVAILABLE' });
    expect(new MigrationError({ code: 'MIGRATION_FILES_UNAVAILABLE' }).message).not.toContain(
      'private',
    );
  });
});
