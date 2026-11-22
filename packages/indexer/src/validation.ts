import { isAddress, isSignature } from '@solana/kit';
import { Effect, Schema } from 'effect';
import { IndexerConfigurationError, IndexerValidationError } from './errors.js';
import type { Verification } from './types.js';

export const AddressSchema = Schema.String.pipe(
  Schema.check(Schema.makeFilter((value: string) => isAddress(value))),
);
export const SignatureSchema = Schema.String.pipe(
  Schema.check(
    Schema.makeFilter(
      (value: string) => /^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(value) && isSignature(value),
    ),
  ),
);
const amount = Schema.String.pipe(
  Schema.check(
    Schema.makeFilter(
      (x: string) =>
        /^(0|[1-9]\d{0,19})$/.test(x) && BigInt(x) > 0n && BigInt(x) <= 18_446_744_073_709_551_615n,
    ),
  ),
);
const timestamp = Schema.String.pipe(
  Schema.check(
    Schema.makeFilter(
      (x: string) =>
        /^-?\d{1,19}$/.test(x) &&
        BigInt(x) >= -9_223_372_036_854_775_808n &&
        BigInt(x) <= 9_223_372_036_854_775_807n,
    ),
  ),
);
const slot = Schema.Number.pipe(
  Schema.check(Schema.makeFilter((x: number) => Number.isSafeInteger(x) && x >= 0)),
);
const payment = Schema.Struct({
  vault: AddressSchema,
  agentKey: AddressSchema,
  recipient: AddressSchema,
  amount,
  timestamp,
  eventIndex: Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 0, maximum: 63 }))),
});
const proofSchema = Schema.Union([
  Schema.Struct({ status: Schema.Literal('pending') }),
  Schema.Struct({ status: Schema.Literal('unrelated'), slot }),
  Schema.Struct({ status: Schema.Literal('failed'), slot }),
  Schema.Struct({
    status: Schema.Literal('settled'),
    slot,
    payments: Schema.Array(payment).pipe(Schema.check(Schema.isBetweenLength(1, 64))),
  }),
]);
export const NotificationsSchema = Schema.Array(Schema.Struct({ signature: SignatureSchema })).pipe(
  Schema.check(Schema.isBetweenLength(1, 50)),
);

export function trackedVaultSet(trackedVaults: readonly string[]): Set<string> {
  if (
    trackedVaults.length < 1 ||
    trackedVaults.length > 100 ||
    !trackedVaults.every(Schema.is(AddressSchema))
  )
    throw new IndexerConfigurationError({ code: 'INVALID_TRACKED_VAULTS' });
  return new Set(trackedVaults);
}

/** Shared Effect Schema boundary for all independently verified intake paths. */
export function scopeVerification(value: unknown, vaults: ReadonlySet<string>) {
  return Effect.gen(function* () {
    const proof: Verification = yield* Schema.decodeUnknownEffect(proofSchema)(value).pipe(
      Effect.mapError(() => new IndexerValidationError({ code: 'INVALID_RPC_PROOF' })),
    );
    if (proof.status !== 'settled') return proof;
    const payments = proof.payments.filter((payment) => vaults.has(payment.vault));
    if (new Set(payments.map((payment) => payment.eventIndex)).size !== payments.length)
      return yield* Effect.fail(new IndexerValidationError({ code: 'DUPLICATE_EVENT_INDEX' }));
    return payments.length
      ? { ...proof, payments }
      : { status: 'unrelated' as const, slot: proof.slot };
  });
}
