import { Effect } from 'effect';
import { withDatabase } from './cli-runtime.js';
import { migrateDatabaseEffect, MigrationError } from './migrations.js';
import { IndexerConfigurationError } from './errors.js';

await Effect.runPromise(
  withDatabase((pool) => migrateDatabaseEffect(pool)).pipe(
    Effect.tap((summary) =>
      Effect.sync(() => process.stdout.write(`${JSON.stringify(summary)}\n`)),
    ),
    Effect.catch((error) =>
      Effect.sync(() => {
        const code =
          error instanceof IndexerConfigurationError || error instanceof MigrationError
            ? error.code
            : 'MIGRATION_UNAVAILABLE';
        const action =
          code === 'MISSING_DATABASE_URL'
            ? 'Set DATABASE_URL to the local PostgreSQL connection string.'
            : code === 'MIGRATION_CHECKSUM_MISMATCH'
              ? 'Restore the applied SQL migration; add a new migration for changes.'
              : code.startsWith('MIGRATION_FILES')
                ? 'Run the built CLI with packages/indexer/migrations available.'
                : 'Start PostgreSQL, verify DATABASE_URL, and rerun db:migrate.';
        process.stderr.write(`${JSON.stringify({ code, action })}\n`);
        process.exitCode = 1;
      }),
    ),
  ),
);
