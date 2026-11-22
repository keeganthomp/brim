import { Context, Effect } from 'effect';
import type { IndexerError } from './errors.js';
import { IndexerPersistenceError, IndexerRpcError } from './errors.js';
import type { EventStore, PendingEventStore, TransactionVerifier, Verification } from './types.js';

export interface PersistenceShape {
  record: (signature: string, proof: Verification) => Effect.Effect<void, IndexerError>;
  claimPending: (limit: number) => Effect.Effect<readonly string[], IndexerError>;
}
export interface RpcShape {
  verify: (signature: string) => Effect.Effect<Verification, IndexerError>;
}
export class ChainPersistence extends Context.Service<ChainPersistence, PersistenceShape>()(
  'brim/indexer/ChainPersistence',
) {}
export class ChainRpc extends Context.Service<ChainRpc, RpcShape>()('brim/indexer/ChainRpc') {}

/** Promise adapters are for externally supplied implementations; built-in adapters expose native effects. */
export function persistenceService(store: EventStore): PersistenceShape {
  if (store.effects) return store.effects;
  return {
    record: (signature, proof) =>
      Effect.tryPromise({
        try: () => store.record(signature, proof),
        catch: () => new IndexerPersistenceError({ code: 'PERSISTENCE_WRITE_FAILED' }),
      }),
    claimPending: (limit) =>
      Effect.tryPromise({
        try: () => (store as PendingEventStore).claimPending(limit),
        catch: () => new IndexerPersistenceError({ code: 'PENDING_QUEUE_UNAVAILABLE' }),
      }),
  };
}
export function rpcService(verify: TransactionVerifier): RpcShape {
  return {
    verify:
      verify.effect ??
      ((signature) =>
        Effect.tryPromise({
          try: () => verify(signature),
          catch: () => new IndexerRpcError({ code: 'RPC_VERIFICATION_FAILED' }),
        })),
  };
}
