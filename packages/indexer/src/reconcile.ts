import { Effect, Schema } from 'effect';
import { IndexerConfigurationError, IndexerValidationError } from './errors.js';
import { ChainPersistence, ChainRpc, persistenceService, rpcService } from './services.js';
import type { PendingEventStore, TransactionVerifier } from './types.js';
import { SignatureSchema, trackedVaultSet } from './validation.js';
import { verifyAndRecord } from './workflow.js';

export interface ReconcileOptions {
  store: PendingEventStore;
  verifyTransaction: TransactionVerifier;
  trackedVaults: readonly string[];
  limit?: number;
  concurrency?: number;
}
export interface ReconcileSummary {
  attempted: number;
  settled: number;
  failed: number;
  unrelated: number;
  pending: number;
  errors: number;
}

/** Native workflow exposes typed failures and injected persistence/RPC services. */
export function reconcilePendingEffect(
  options: Omit<ReconcileOptions, 'store' | 'verifyTransaction'>,
) {
  return Effect.gen(function* () {
    const limit = options.limit ?? 100;
    const concurrency = options.concurrency ?? 4;
    if (!Number.isInteger(limit) || limit < 1 || limit > 500)
      return yield* Effect.fail(
        new IndexerConfigurationError({ code: 'INVALID_RECONCILIATION_LIMIT' }),
      );
    if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8)
      return yield* Effect.fail(
        new IndexerConfigurationError({ code: 'INVALID_RECONCILIATION_CONCURRENCY' }),
      );
    const vaults = yield* Effect.try({
      try: () => trackedVaultSet(options.trackedVaults),
      catch: () => new IndexerConfigurationError({ code: 'INVALID_TRACKED_VAULTS' }),
    });
    const store = yield* ChainPersistence;
    const signatures = [...new Set(yield* store.claimPending(limit))];
    if (signatures.length > limit || !signatures.every(Schema.is(SignatureSchema)))
      return yield* Effect.fail(new IndexerValidationError({ code: 'INVALID_PENDING_QUEUE' }));
    const outcomes = yield* Effect.forEach(
      signatures,
      (signature) =>
        verifyAndRecord(signature, vaults).pipe(
          Effect.map((proof) => proof.status),
          Effect.catch(() => Effect.succeed('errors' as const)),
        ),
      { concurrency },
    );
    return outcomes.reduce<ReconcileSummary>(
      (summary, outcome) => {
        summary.attempted++;
        summary[outcome]++;
        return summary;
      },
      { attempted: 0, settled: 0, failed: 0, unrelated: 0, pending: 0, errors: 0 },
    );
  });
}
/** Framework/CLI Promise boundary; overlapping deliveries remain idempotent. */
export function reconcilePending(options: ReconcileOptions): Promise<ReconcileSummary> {
  return Effect.runPromise(
    reconcilePendingEffect(options).pipe(
      Effect.provideService(ChainPersistence, persistenceService(options.store)),
      Effect.provideService(ChainRpc, rpcService(options.verifyTransaction)),
    ),
  );
}
