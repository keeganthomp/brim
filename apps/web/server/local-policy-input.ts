import { address } from '@solana/kit';
import { Data, Effect, Schema } from 'effect';
import { localRequest } from './local-request';

export class LocalPolicyError extends Data.TaggedError('LocalPolicyError')<{
  signature?: string;
  code:
    | 'INVALID_POLICY'
    | 'POLICY_EXISTS'
    | 'POLICY_MISSING'
    | 'POLICY_LIMIT_REACHED'
    | 'LOCAL_POLICY_UNAVAILABLE'
    | 'POLICY_REJECTED'
    | 'CONFIRMATION_PENDING';
}> {}
export const policyFailure = () => new LocalPolicyError({ code: 'LOCAL_POLICY_UNAVAILABLE' });
export const PublicKey = Schema.String.check(
  Schema.makeFilter((value) => {
    try {
      return address(value) !== '11111111111111111111111111111111';
    } catch {
      return false;
    }
  }),
);
const PositiveUnits = Schema.String.check(
  Schema.makeFilter(
    (value) => /^[1-9]\d{0,19}$/.test(value) && BigInt(value) <= 18_446_744_073_709_551_615n,
  ),
);
export const PolicyInput = Schema.Struct({
  intent: Schema.Literals(['create', 'update']),
  agentKey: PublicKey,
  maxPerTxBaseUnits: PositiveUnits,
  windowLimitBaseUnits: PositiveUnits,
  minTxInterval: Schema.Number.check(
    Schema.isInt(),
    Schema.isBetween({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER }),
  ),
  allowlistEnabled: Schema.Boolean,
  allowlist: Schema.Array(PublicKey).check(
    Schema.isBetweenLength(0, 16),
    Schema.makeFilter((keys) => new Set(keys).size === keys.length),
  ),
}).check(
  Schema.makeFilter(
    (input) => BigInt(input.maxPerTxBaseUnits) <= BigInt(input.windowLimitBaseUnits),
  ),
);
export type PolicyInput = typeof PolicyInput.Type;
const invalid = () => new LocalPolicyError({ code: 'INVALID_POLICY' });
export const readPolicyInput = (request: Request) =>
  Effect.gen(function* () {
    yield* localRequest(request, {
      environment: process.env.NODE_ENV,
      configured: Boolean(process.env.BRIM_LOCAL_CONFIG),
      method: 'POST',
      requireOrigin: true,
    });
    const type = request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
    if (type !== 'application/json' || !request.body) return yield* invalid();
    const length = request.headers.get('content-length');
    if (length && (!/^\d+$/.test(length) || Number(length) > 16_384)) return yield* invalid();
    const text = yield* Effect.tryPromise({
      try: async () => {
        const reader = request.body!.getReader();
        const chunks: Uint8Array[] = [];
        let size = 0;
        try {
          for (;;) {
            const chunk = await reader.read();
            if (chunk.done) break;
            size += chunk.value.byteLength;
            if (size > 16_384) {
              await reader.cancel();
              throw invalid();
            }
            chunks.push(chunk.value);
          }
        } finally {
          reader.releaseLock();
        }
        return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
      },
      catch: invalid,
    });
    return yield* Effect.try({
      try: () =>
        Schema.decodeUnknownSync(PolicyInput, { onExcessProperty: 'error' })(JSON.parse(text)),
      catch: invalid,
    });
  });
