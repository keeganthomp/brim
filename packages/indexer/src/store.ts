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
          database(() => pool.connect()),
          (client) =>
            Effect.gen(function* () {
              yield* database(() => client.query('BEGIN'));
              yield* database(() =>
                client.query(
                  'INSERT INTO brim_chain_notifications (signature) VALUES ($1) ON CONFLICT DO NOTHING',
                  [signature],
                ),
              );
              const locked = yield* database(() =>
                client.query<{ status: string }>(
                  'SELECT status FROM brim_chain_notifications WHERE signature = $1 FOR UPDATE',
                  [signature],
                ),
              );
              if (locked.rows[0]?.status === 'pending' && proof.status !== 'pending') {
                yield* database(() =>
                  client.query(
                    'UPDATE brim_chain_notifications SET status = $2, slot = $3, verified_at = NOW() WHERE signature = $1',
                    [signature, proof.status, proof.slot],
                  ),
                );
                if (proof.status === 'settled')
                  yield* Effect.forEach(
                    proof.payments,
                    (payment) =>
                      database(() =>
                        client.query(
                          `INSERT INTO brim_payments
              (signature, event_index, vault, agent_key, recipient, amount_base_units, chain_timestamp)
              VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (signature, event_index) DO NOTHING`,
                          [
                            signature,
                            payment.eventIndex,
                            payment.vault,
                            payment.agentKey,
                            payment.recipient,
                            payment.amount,
                            payment.timestamp,
                          ],
                        ),
                      ),
                    { discard: true },
                  );
              }
              yield* database(() => client.query('COMMIT'));
            }).pipe(
              Effect.onError(() => database(() => client.query('ROLLBACK')).pipe(Effect.ignore)),
            ),
          (client) => Effect.sync(() => client.release()),
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
