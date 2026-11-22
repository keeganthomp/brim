import { Effect } from 'effect';
import { withDatabase } from './cli-runtime.js';
import { IndexerConfigurationError } from './errors.js';
import { createSolanaVerifier } from './verifier.js';
import { PostgresEventStore } from './store.js';
import { reconcilePendingEffect } from './reconcile.js';
import { ChainPersistence, ChainRpc, rpcService } from './services.js';

await Effect.runPromise(
  withDatabase((pool) =>
    Effect.gen(function* () {
      const programId = process.env.BRIM_PROGRAM_ADDRESS;
      const rpcUrl = process.env.SOLANA_RPC_URL;
      const trackedVaults = process.env.BRIM_TRACKED_VAULTS?.split(',')
        .map((v) => v.trim())
        .filter(Boolean);
      if (!programId || !rpcUrl || !trackedVaults?.length)
        return yield* Effect.fail(
          new IndexerConfigurationError({ code: 'MISSING_INDEXER_CONFIGURATION' }),
        );
      const rpc = yield* Effect.try({
        try: () => rpcService(createSolanaVerifier({ rpcUrl, programId })),
        catch: () => new IndexerConfigurationError({ code: 'INVALID_RPC_CONFIGURATION' }),
      });
      const summary = yield* reconcilePendingEffect({
        trackedVaults,
        limit: Number(process.env.BRIM_RECONCILE_LIMIT ?? 100),
        concurrency: Number(process.env.BRIM_RECONCILE_CONCURRENCY ?? 4),
      }).pipe(
        Effect.provideService(ChainPersistence, new PostgresEventStore(pool).effects),
        Effect.provideService(ChainRpc, rpc),
      );
      yield* Effect.sync(() => {
        process.stdout.write(`${JSON.stringify(summary)}\n`);
        if (summary.errors > 0) process.exitCode = 1;
      });
    }),
  ).pipe(
    Effect.catch(() =>
      Effect.sync(() => {
        process.stderr.write('{"code":"RECONCILIATION_UNAVAILABLE"}\n');
        process.exitCode = 1;
      }),
    ),
  ),
);
