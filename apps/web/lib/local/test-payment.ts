import { Effect, Schema } from 'effect';

const Reply = Schema.Struct({
  status: Schema.Literal('settled'),
  amount: Schema.Literal('$0.04'),
  signature: Schema.String.check(Schema.isPattern(/^[1-9A-HJ-NP-Za-km-z]{64,88}$/)),
});

const messages = {
  LOCAL_ONLY: 'Start the local stack with npm run dev to try a test payment.',
  LOCAL_PAYMENT_UNAVAILABLE: 'The local test chain is unavailable.',
  TEST_PAYMENT_IN_PROGRESS: 'A test payment is already in progress. Check Activity shortly.',
  TEST_PAYMENT_OUTCOME_UNKNOWN: 'Check Activity for the original test payment before retrying.',
};

const unsure = () => new Error(messages.TEST_PAYMENT_OUTCOME_UNKNOWN);

export function runLocalTestPayment() {
  return Effect.runPromise(
    Effect.gen(function* () {
      const response = yield* Effect.tryPromise({
        try: (signal) => fetch('/api/local/test-payment', { method: 'POST', signal }),
        catch: unsure,
      });
      const body: unknown = yield* Effect.tryPromise({ try: () => response.json(), catch: unsure });
      if (!response.ok) {
        const code = body && typeof body === 'object' && 'code' in body ? body.code : null;
        return yield* Effect.fail(
          typeof code === 'string' && Object.hasOwn(messages, code)
            ? new Error(messages[code as keyof typeof messages])
            : unsure(),
        );
      }
      return yield* Schema.decodeUnknownEffect(Reply)(body).pipe(Effect.mapError(unsure));
    }).pipe(
      Effect.timeout(38_000),
      Effect.match({
        onSuccess: (result) => ({ ok: true as const, result }),
        onFailure: (error) => ({
          ok: false as const,
          message:
            '_tag' in error && error._tag === 'TimeoutError' ? unsure().message : error.message,
        }),
      }),
    ),
  );
}
