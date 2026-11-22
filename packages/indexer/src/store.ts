import { Effect } from 'effect';
import type { Pool } from 'pg';
import { IndexerConfigurationError, IndexerPersistenceError } from './errors.js';
import type { PersistenceShape } from './services.js';
import type { PendingEventStore, Verification } from './types.js';

const database = <A>(run: () => Promise<A>) =>
  Effect.tryPromise({
    try: run,
    catch: () => new IndexerPersistenceError({ code: 'DATABASE_UNAVAILABLE' }),
  });

/** Native Effect resource lifecycle; Promise methods are application framework boundaries. */
export class PostgresEventStore implements PendingEventStore {
  readonly effects: PersistenceShape;
  constructor(pool: Pool) {
    this.effects = {
      claimPending: (limit) =>
        Effect.gen(function* () {
          if (!Number.isInteger(limit) || limit < 1 || limit > 500)
            return yield* Effect.fail(
              new IndexerConfigurationError({ code: 'INVALID_RECONCILIATION_LIMIT' }),
            );
          const result = yield* database(() =>
            pool.query<{ signature: string }>(
              `WITH candidates AS (
          SELECT signature FROM brim_chain_notifications WHERE status = 'pending'
          ORDER BY last_attempted_at NULLS FIRST, received_at, signature LIMIT $1 FOR UPDATE SKIP LOCKED
        ) UPDATE brim_chain_notifications AS notification SET last_attempted_at = NOW(), verification_attempts = verification_attempts + 1
          FROM candidates WHERE notification.signature = candidates.signature RETURNING notification.signature`,
              [limit],
            ),
          );
          return result.rows.map((row) => row.signature);
        }),
      record: (signature, proof) =>
        Effect.acquireUseRelease(
          database(() => pool.connect()).pipe(Effect.map((client) => ({ client, discard: false }))),
          (resource) =>
            Effect.gen(function* () {
              const { client } = resource;
              yield* database(() => client.query('BEGIN'));
              yield* database(() =>
                client.query("SET LOCAL statement_timeout = '5s'; SET LOCAL lock_timeout = '5s'"),
              );
              yield* database(() =>
                client.query(
                  'INSERT INTO brim_chain_notifications (signature) VALUES ($1) ON CONFLICT DO NOTHING',
                  [signature],
                ),
              );
              const locked = yield* database(() =>
                client.query<{ status: string; slot: string | null }>(
                  'SELECT status, slot FROM brim_chain_notifications WHERE signature = $1 FOR UPDATE',
                  [signature],
                ),
              );
              const current = locked.rows[0];
              if (!current)
                return yield* Effect.fail(
                  new IndexerPersistenceError({ code: 'PERSISTENCE_ROW_UNAVAILABLE' }),
                );
              if (current?.status === 'pending' && proof.status !== 'pending') {
                yield* database(() =>
                  client.query(
                    'UPDATE brim_chain_notifications SET status = $2, slot = $3, verified_at = NOW() WHERE signature = $1',
                    [signature, proof.status, proof.slot],
                  ),
                );
              }
              // Different tracked vaults can discover distinct events in one finalized tx.
              // A same-slot replay may append missing events, never replace stored facts.
              if (
                proof.status === 'settled' &&
                (current?.status === 'pending' || current?.status === 'settled')
              ) {
                if (current.status === 'settled' && String(current.slot) !== String(proof.slot))
                  return yield* Effect.fail(
                    new IndexerPersistenceError({ code: 'FINALIZED_SLOT_CONFLICT' }),
                  );
                yield* Effect.forEach(
                  proof.payments,
                  (payment) =>
                    Effect.gen(function* () {
                      const values = [
                        signature,
                        payment.eventIndex,
                        payment.vault,
                        payment.agentKey,
                        payment.recipient,
                        payment.amount,
                        payment.timestamp,
                      ];
                      const inserted = yield* database(() =>
                        client.query(
                          `INSERT INTO brim_payments
                    (signature, event_index, vault, agent_key, recipient, amount_base_units, chain_timestamp)
                    VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (signature, event_index) DO NOTHING RETURNING signature`,
                          values,
                        ),
                      );
                      if (inserted.rowCount === 0) {
                        const matches = yield* database(() =>
                          client.query(
                            `SELECT 1 FROM brim_payments
                      WHERE signature = $1 AND event_index = $2 AND vault = $3 AND agent_key = $4 AND recipient = $5
                        AND amount_base_units = $6 AND chain_timestamp = $7`,
                            values,
                          ),
                        );
                        if (matches.rowCount !== 1)
                          return yield* Effect.fail(
                            new IndexerPersistenceError({ code: 'FINALIZED_EVENT_CONFLICT' }),
                          );
                      }
                    }),
                  { discard: true },
                );
              }
              yield* database(() => client.query('COMMIT'));
            }).pipe(
              Effect.onError(() =>
                database(() => resource.client.query('ROLLBACK')).pipe(
                  Effect.catch(() =>
                    Effect.sync(() => {
                      resource.discard = true;
                    }),
                  ),
                ),
              ),
            ),
          (resource) => Effect.sync(() => resource.client.release(resource.discard)),
        ),
    };
  }
  record(signature: string, proof: Verification): Promise<void> {
    return Effect.runPromise(this.effects.record(signature, proof));
  }
  claimPending(limit: number): Promise<readonly string[]> {
    return Effect.runPromise(this.effects.claimPending(limit));
  }
}
