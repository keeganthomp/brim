import {
  createHeliusWebhookHandler,
  createSolanaVerifier,
  PostgresEventStore,
} from '@brim/indexer/webhook';
import { Data, Effect, Schema } from 'effect';
import { Pool } from 'pg';

class IngestionUnavailable extends Data.TaggedError('IngestionUnavailable')<{}> {}

const Configuration = Schema.Struct({
  authorization: Schema.String.check(Schema.isMinLength(32), Schema.isMaxLength(1024)),
  programId: Schema.String,
  rpcUrl: Schema.String,
  connectionString: Schema.String.check(Schema.isMinLength(1)),
  trackedVaults: Schema.NonEmptyArray(Schema.String),
});

type Handler = (request: Request) => Promise<Response>;
let handler: Handler | undefined;

const configuredHandler = Effect.gen(function* () {
  if (handler) return handler;
  const config = yield* Schema.decodeUnknownEffect(Configuration)({
    authorization: process.env.HELIUS_WEBHOOK_AUTHORIZATION,
    programId: process.env.BRIM_PROGRAM_ADDRESS,
    rpcUrl: process.env.SOLANA_RPC_URL,
    connectionString: process.env.DATABASE_URL,
    trackedVaults: process.env.BRIM_TRACKED_VAULTS?.split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  }).pipe(Effect.mapError(() => new IngestionUnavailable()));

  return yield* Effect.try({
    try: () => {
      const verifyTransaction = createSolanaVerifier({
        rpcUrl: config.rpcUrl,
        programId: config.programId,
      });
      const pool = new Pool({
        connectionString: config.connectionString,
        max: 5,
        connectionTimeoutMillis: 5000,
        idleTimeoutMillis: 30000,
        statement_timeout: 10000,
      });
      pool.on('error', () => {
        /* Never log credentials from connection failures. */
      });
      try {
        handler = createHeliusWebhookHandler({
          ...config,
          store: new PostgresEventStore(pool),
          verifyTransaction,
        });
        return handler;
      } catch (error) {
        void pool.end();
        throw error;
      }
    },
    catch: () => new IngestionUnavailable(),
  });
});

export const ingestWebhook = (request: Request) =>
  configuredHandler.pipe(
    Effect.flatMap((handle) =>
      Effect.tryPromise({ try: () => handle(request), catch: () => new IngestionUnavailable() }),
    ),
    Effect.match({
      onSuccess: (response) => response,
      onFailure: () =>
        Response.json(
          { code: 'INGESTION_UNAVAILABLE' },
          {
            status: 503,
            headers: { 'cache-control': 'no-store' },
          },
        ),
    }),
  );
