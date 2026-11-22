import { Schema } from 'effect';
import { fail } from './errors.js';

export const MAX_PAYMENT_REQUIRED_HEADER_BYTES = 65_536;
const text = (maximum: number) => Schema.String.check(Schema.isBetweenLength(1, maximum));
// Unrelated networks retain their own address/precision formats. Selected Solana
// requirements receive the stricter mint, address, u64, timeout and sponsor checks.
const Offer = Schema.Struct({
  scheme: text(64),
  network: text(128),
  asset: text(256),
  amount: text(128).check(Schema.isPattern(/^[0-9]+$/)),
  payTo: text(256),
  maxTimeoutSeconds: Schema.Number.check(
    Schema.isInt(),
    Schema.isBetween({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER }),
  ),
  extra: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
});
const PaymentRequired = Schema.Struct({
  x402Version: Schema.Literal(2),
  resource: Schema.Struct({
    url: text(4096),
    description: Schema.optional(Schema.String),
    mimeType: Schema.optional(Schema.String),
  }),
  accepts: Schema.Array(Offer).check(Schema.isBetweenLength(1, 16)),
  error: Schema.optional(Schema.String),
  extensions: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
});

/** Bound the wire header before the official x402 decoder parses JSON. */
export function validateChallengeHeader(response: Response): void {
  const header = response.headers.get('PAYMENT-REQUIRED');
  if (!header || header.length > MAX_PAYMENT_REQUIRED_HEADER_BYTES)
    fail(
      'INVALID_PAYMENT_REQUIREMENTS',
      'Merchant sent a missing or oversized x402 payment header.',
    );
}

/** Validate the complete v2 envelope before upstream network/scheme filtering. */
export function validatePaymentRequired(value: unknown): void {
  if (
    value &&
    typeof value === 'object' &&
    'x402Version' in value &&
    typeof value.x402Version === 'number' &&
    value.x402Version !== 2
  )
    fail('UNSUPPORTED_PAYMENT', 'Only x402 version 2 is supported.');
  try {
    Schema.decodeUnknownSync(PaymentRequired)(value);
  } catch {
    fail('INVALID_PAYMENT_REQUIREMENTS', 'Merchant sent an invalid x402 v2 payment declaration.');
  }
}

/** Paid replies are parsed by x402 too, even when its receipt is optional. */
export function validatePaidHeaders(response: Response): void {
  for (const name of ['PAYMENT-RESPONSE', 'X-PAYMENT-RESPONSE', 'PAYMENT-REQUIRED']) {
    if ((response.headers.get(name)?.length ?? 0) > MAX_PAYMENT_REQUIRED_HEADER_BYTES)
      fail(
        'PAYMENT_OUTCOME_UNKNOWN',
        'Merchant sent an oversized paid response. Reconcile settlement before retrying.',
      );
  }
}
