/** Receipt capture is durable before /report succeeds; finality is verified independently. */
import path from 'node:path';
import { isAddress, isSignature } from '@solana/kit';
import {
  ChainPersistence,
  ChainRpc,
  createSolanaVerifier,
  migrateDatabaseEffect,
  PostgresEventStore,
  reconcilePendingEffect,
  rpcService,
  type PersistenceShape,
  type TransactionVerifier,
} from '@brim/indexer';
import { Effect, Schema } from 'effect';
import { Pool } from 'pg';
import { configuration, LocalSetupError } from '../../../scripts/local/config.ts';
import { localDatabaseUrl } from '../database.ts';
import { createSettlementOutbox } from './outbox.ts';
import type { LocalContext } from './context.ts';

const failure = () =>
  new LocalSetupError({
    message: 'Local payment indexing is unavailable. Check PostgreSQL and the local receipt queue.',
  });
const io = <A>(run: () => Promise<A>) => Effect.tryPromise({ try: run, catch: failure });
type IndexingContext = Pick<LocalContext, 'rpcUrl' | 'programAddress' | 'vaultAddress' | 'network'>;
export type SettlementObserver = (receipt: unknown) => Effect.Effect<void, LocalSetupError>;

type SettlementOutbox = Effect.Success<ReturnType<typeof createSettlementOutbox>>;

/** One bounded pass: durable markers become durable DB pending before they are removed. */
export function recoverLocalSettlements(
  outbox: SettlementOutbox,
  persistence: PersistenceShape,
  verifier: TransactionVerifier,
  trackedVaults: readonly string[],
) {
  return Effect.gen(function* () {
    const signatures = yield* outbox.pending;
    yield* Effect.forEach(
      signatures,
      (signature) =>
        persistence
          .record(signature, { status: 'pending' })
          .pipe(Effect.mapError(failure), Effect.andThen(outbox.acknowledge(signature))),
      { concurrency: 4, discard: true },
    );
    return yield* reconcilePendingEffect({
      trackedVaults,
      limit: 100,
      concurrency: 4,
    }).pipe(
      Effect.provideService(ChainPersistence, persistence),
      Effect.provideService(ChainRpc, rpcService(verifier)),
      Effect.mapError(failure),
    );
  });
}

/** Local-only indexing scope is explicit; the seeded vault can never be silently dropped. */
export const readLocalTrackedVaults = (seededVault: string, configured?: string) =>
  Schema.decodeUnknownEffect(
    Schema.Array(Schema.String.check(Schema.makeFilter(isAddress))).check(
      Schema.isBetweenLength(1, 100),
      Schema.makeFilter((vaults) => vaults.includes(seededVault)),
    ),
  )(
    configured === undefined
      ? [seededVault]
      : configured
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
  ).pipe(
    Effect.map((vaults) => [...new Set(vaults)]),
    Effect.mapError(
      () =>
        new LocalSetupError({
          message:
            'BRIM_TRACKED_VAULTS must include the seeded local vault and valid public addresses (maximum100).',
        }),
    ),
  );

export function createLocalSettlementLedger(context: IndexingContext) {
  return Effect.gen(function* () {
    const defaults = yield* configuration;
    const trackedVaults = yield* readLocalTrackedVaults(
      context.vaultAddress,
      process.env.BRIM_TRACKED_VAULTS,
    );
    const connectionString = process.env.DATABASE_URL ?? defaults.databaseUrl;
    if (!localDatabaseUrl(connectionString)) return yield* failure();
    const filename = path.resolve(process.env.BRIM_LOCAL_CONFIG ?? defaults.file);
    const outbox = yield* createSettlementOutbox(
      path.join(path.dirname(filename), 'settlements', context.vaultAddress),
    );
    const pool = yield* Effect.acquireRelease(
      Effect.sync(() => {
        const pool = new Pool({
          connectionString,
          max: 4,
          connectionTimeoutMillis: 3000,
          idleTimeoutMillis: 10_000,
          statement_timeout: 5000,
        });
        pool.on('error', () => {
          /* No connection strings or provider diagnostics enter logs. */
        });
        return pool;
      }),
      (pool) => io(() => pool.end()).pipe(Effect.ignore),
    );
    yield* migrateDatabaseEffect(pool).pipe(Effect.mapError(failure));
    const store = new PostgresEventStore(pool);
    const verifier = createSolanaVerifier({
      rpcUrl: context.rpcUrl,
      programId: context.programAddress,
    });
    const receiptSchema = Schema.Struct({
      success: Schema.Literal(true),
      network: Schema.Literal(context.network),
      transaction: Schema.String.check(
        Schema.makeFilter(
          (value) => /^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(value) && isSignature(value),
        ),
      ),
    });
    const recordSettlement: SettlementObserver = (receipt) =>
      Effect.gen(function* () {
        const value = yield* Schema.decodeUnknownEffect(receiptSchema)(receipt).pipe(
          Effect.mapError(failure),
        );
        yield* outbox.enqueue(value.transaction);
      });
    const recover = recoverLocalSettlements(outbox, store.effects, verifier, trackedVaults);
    yield* recover.pipe(
      Effect.catch(() => Effect.succeed(undefined)),
      Effect.andThen(Effect.sleep('1 second')),
      Effect.forever,
      Effect.forkScoped,
    );
    return { recordSettlement };
  });
}
