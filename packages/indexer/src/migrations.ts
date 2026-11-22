import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { Data, Effect } from 'effect';
import type { Pool } from 'pg';

export class MigrationError extends Data.TaggedError('MigrationError')<{ code: string }> {
  override get message() {
    return this.code;
  }
}
export interface Migration {
  name: string;
  checksum: string;
  sql: string;
}
const io = <A>(read: () => Promise<A>) =>
  Effect.tryPromise({
    try: read,
    catch: () => new MigrationError({ code: 'MIGRATION_FILES_UNAVAILABLE' }),
  });
const db = <A>(query: () => Promise<A>) =>
  Effect.tryPromise({
    try: query,
    catch: () => new MigrationError({ code: 'MIGRATION_DATABASE_UNAVAILABLE' }),
  });

/** SQL and ledger must share the runner's transaction, including files with existing wrappers. */
export function migrationBody(sql: string): string {
  const trimmed = sql.trim();
  const wrapped = /^BEGIN\s*;([\s\S]*)COMMIT\s*;$/i.exec(trimmed);
  const body = wrapped ? wrapped[1]!.trim() : trimmed;
  if (!body || /(?:^|;)\s*(BEGIN|COMMIT|ROLLBACK)\b/im.test(body))
    throw new MigrationError({ code: 'MIGRATION_TRANSACTION_INVALID' });
  return body;
}

export function loadMigrations(
  directory = fileURLToPath(new URL('../migrations/', import.meta.url)),
) {
  return Effect.gen(function* () {
    const names = (yield* io(() => readdir(directory)))
      .filter((name) => /^\d+[a-zA-Z0-9_-]*\.sql$/.test(name))
      .sort();
    if (!names.length)
      return yield* Effect.fail(new MigrationError({ code: 'MIGRATION_FILES_MISSING' }));
    return yield* Effect.forEach(names, (name) =>
      Effect.gen(function* () {
        const raw = yield* io(() => readFile(join(directory, name), 'utf8'));
        const sql = yield* Effect.try({
          try: () => migrationBody(raw),
          catch: () => new MigrationError({ code: 'MIGRATION_TRANSACTION_INVALID' }),
        });
        return { name, sql, checksum: createHash('sha256').update(raw).digest('hex') };
      }),
    );
  });
}

/** One connection owns the advisory lock through schema changes and checksum ledger updates. */
export function migrateDatabaseEffect(pool: Pool, directory?: string) {
  return Effect.gen(function* () {
    const migrations = yield* loadMigrations(directory);
    return yield* Effect.acquireUseRelease(
      db(() => pool.connect()),
      (client) =>
        Effect.gen(function* () {
          yield* db(() => client.query("SET statement_timeout = '60s'"));
          yield* db(() =>
            client.query("SELECT pg_advisory_lock(hashtext('brim.schema.migrations'))"),
          );
          yield* db(() =>
            client.query(
              'CREATE TABLE IF NOT EXISTS brim_schema_migrations (name TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())',
            ),
          );
          const ledger = yield* db(() =>
            client.query<{ name: string; checksum: string }>(
              'SELECT name, checksum FROM brim_schema_migrations',
            ),
          );
          const applied = new Map(ledger.rows.map((row) => [row.name, row.checksum]));
          if (
            [...applied.keys()].some(
              (name) => !migrations.some((migration) => migration.name === name),
            )
          )
            return yield* Effect.fail(new MigrationError({ code: 'MIGRATION_HISTORY_MISSING' }));
          const summary = { applied: 0, skipped: 0 };
          for (const migration of migrations) {
            const existing = applied.get(migration.name);
            if (existing !== undefined) {
              if (existing !== migration.checksum)
                return yield* Effect.fail(
                  new MigrationError({ code: 'MIGRATION_CHECKSUM_MISMATCH' }),
                );
              summary.skipped++;
              continue;
            }
            yield* Effect.gen(function* () {
              yield* db(() => client.query('BEGIN'));
              yield* db(() => client.query(migration.sql));
              yield* db(() =>
                client.query(
                  'INSERT INTO brim_schema_migrations (name, checksum) VALUES ($1, $2)',
                  [migration.name, migration.checksum],
                ),
              );
              yield* db(() => client.query('COMMIT'));
            }).pipe(Effect.onError(() => db(() => client.query('ROLLBACK')).pipe(Effect.ignore)));
            summary.applied++;
          }
          return summary;
        }),
      (client) =>
        db(() =>
          client.query("SELECT pg_advisory_unlock(hashtext('brim.schema.migrations'))"),
        ).pipe(Effect.ignore, Effect.ensuring(Effect.sync(() => client.release()))),
    );
  });
}
