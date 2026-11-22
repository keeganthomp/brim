import type { Effect } from 'effect';
import type { IndexerError } from './errors.js';
import type { PersistenceShape } from './services.js';

export type NotificationStatus = 'pending' | 'settled' | 'failed' | 'unrelated';

/** Values originate from a finalized RPC transaction, never the webhook body. */
export interface CanonicalPayment {
  vault: string;
  agentKey: string;
  recipient: string;
  amount: string; // integer USDC base units; never floating point
  timestamp: string; // signed Unix seconds, as decimal text
  eventIndex: number;
}
export type Verification =
  | { status: 'pending' }
  | { status: 'unrelated'; slot: number }
  | { status: 'failed'; slot: number }
  | { status: 'settled'; slot: number; payments: readonly CanonicalPayment[] };

export interface EventStore {
  readonly effects?: PersistenceShape;
  /** Atomic, idempotent write keyed by signature/eventIndex. Final states cannot regress to pending. */
  record(signature: string, verification: Verification): Promise<void>;
}
export type TransactionVerifier = ((signature: string) => Promise<Verification>) & {
  readonly effect?: (signature: string) => Effect.Effect<Verification, IndexerError>;
};

export interface PendingEventStore extends EventStore {
  /** Select pending records, atomically updating attempt time so persistent failures do not starve the queue. */
  claimPending(limit: number): Promise<readonly string[]>;
}
