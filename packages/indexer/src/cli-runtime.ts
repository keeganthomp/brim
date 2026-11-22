import { Effect } from 'effect';
import { Pool } from 'pg';
import { IndexerConfigurationError } from './errors.js';

/** Server-only CLI resources. Missing configuration errors identify names, never their values. */
export const databaseUrl = Effect.suspend(() =>
  process.env.DATABASE_URL
    ? Effect.succeed(process.env.DATABASE_URL)
    : Effect.fail(new IndexerConfigurationError({ code: 'MISSING_DATABASE_URL' })),
);
export const withDatabase = <A, E, R>(use: (pool: Pool) => Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const connectionString = yield* databaseUrl;
    return yield* Effect.acquireUseRelease(
      Effect.try({
        try: () => {
          const pool = new Pool({
            connectionString,
            max: 5,
            connectionTimeoutMillis: 5000,
            idleTimeoutMillis: 30000,
          });
          pool.on('error', () => {
            /* Provider credentials never enter logs. */
          });
          return pool;
        },
        catch: () => new IndexerConfigurationError({ code: 'INVALID_DATABASE_CONFIGURATION' }),
      }),
      use,
      (pool) => Effect.tryPromise(() => pool.end()).pipe(Effect.ignore),
    );
  });
