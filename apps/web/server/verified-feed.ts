/** Public finalized chain facts only. Never query this ledger without an explicit vault. */
import { isAddress, isSignature } from '@solana/kit';
import { Data, Effect, Schema } from 'effect';
import type { Pool } from 'pg';

export class VerifiedFeedError extends Data.TaggedError('VerifiedFeedError')<{}> {}
const unavailable = () => new VerifiedFeedError();
const Address = Schema.String.check(Schema.makeFilter(isAddress));
const Unsigned = Schema.String.check(Schema.isPattern(/^(0|[1-9]\d{0,19})$/));
const Rows = Schema.Array(
  Schema.Struct({
    signature: Schema.String.check(
      Schema.makeFilter(
        (value) => /^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(value) && isSignature(value),
      ),
    ),
    event_index: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 63 })),
    vault: Address,
    agent_key: Address,
    recipient: Address,
    amount_base_units: Unsigned.check(
      Schema.makeFilter(
        (value) => BigInt(value) > 0n && BigInt(value) <= 18_446_744_073_709_551_615n,
      ),
    ),
    chain_timestamp: Unsigned.check(
      Schema.makeFilter((value) => BigInt(value) <= 8_640_000_000_000n),
    ),
    slot: Unsigned,
  }),
).check(Schema.isMaxLength(50));

export const readVerifiedPayments = (pool: Pick<Pool, 'query'>, vaultAddress: string) =>
  Effect.gen(function* () {
    if (!isAddress(vaultAddress)) return yield* unavailable();
    const result = yield* Effect.tryPromise({
      try: () =>
        pool.query(
          `SELECT payment.signature, payment.event_index, payment.vault, payment.agent_key, payment.recipient,
    payment.amount_base_units::TEXT AS amount_base_units, payment.chain_timestamp::TEXT AS chain_timestamp, notification.slot::TEXT AS slot
    FROM brim_payments AS payment JOIN brim_chain_notifications AS notification USING (signature)
    WHERE payment.vault = $1 AND notification.status = 'settled' AND notification.verified_at IS NOT NULL
    ORDER BY payment.chain_timestamp DESC, payment.signature DESC, payment.event_index DESC LIMIT 50`,
          [vaultAddress],
        ),
      catch: unavailable,
    });
    const rows = yield* Schema.decodeUnknownEffect(Rows)(result.rows).pipe(
      Effect.mapError(unavailable),
    );
    if (rows.some((row) => row.vault !== vaultAddress)) return yield* unavailable();
    return rows.map((row) => ({
      id: `${row.signature}:${row.event_index}`,
      signature: row.signature,
      eventIndex: row.event_index,
      vaultAddress: row.vault,
      agentKey: row.agent_key,
      recipient: row.recipient,
      amountBaseUnits: row.amount_base_units,
      chainTimestamp: row.chain_timestamp,
      settledAt: new Date(Number(row.chain_timestamp) * 1000).toISOString(),
      slot: row.slot,
    }));
  });
export type VerifiedPayment = Effect.Success<ReturnType<typeof readVerifiedPayments>>[number];
