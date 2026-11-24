import { Effect, Schema } from 'effect';
import { workspaceAgentName } from '../chain/workspace-agents';
import { adaptPayment } from '../local/adapter';

const Amount = Schema.String.check(
  Schema.isPattern(/^[1-9]\d{0,15}$/),
  Schema.makeFilter((value) => Number.isSafeInteger(Number(value))),
);
const Reply = Schema.Struct({
  status: Schema.Literal('ready'),
  commitment: Schema.Literal('finalized'),
  vaultAddress: Schema.String,
  payments: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      vaultAddress: Schema.String,
      agentKey: Schema.String,
      recipient: Schema.String,
      signature: Schema.String.check(Schema.isPattern(/^[1-9A-HJ-NP-Za-km-z]{64,88}$/)),
      amountBaseUnits: Amount,
      settledAt: Schema.String.check(
        Schema.makeFilter((value) => Number.isFinite(Date.parse(value))),
      ),
    }),
  ).check(Schema.isMaxLength(50)),
});

export function fetchLiveActivity(vault: string, signal: AbortSignal) {
  return Effect.runPromise(
    Effect.gen(function* () {
      const response = yield* Effect.tryPromise({
        try: (requestSignal) =>
          fetch(`/api/activity?${new URLSearchParams({ vault })}`, {
            cache: 'no-store',
            signal: requestSignal,
          }),
        catch: () => new Error('Activity is unavailable.'),
      });
      if (response.status === 404) return null;
      if (!response.ok) return yield* Effect.fail(new Error('Activity is unavailable.'));
      const body = yield* Effect.tryPromise({
        try: () => response.json(),
        catch: () => new Error('Invalid activity.'),
      });
      const feed = yield* Schema.decodeUnknownEffect(Reply)(body);
      if (feed.vaultAddress !== vault || feed.payments.some((item) => item.vaultAddress !== vault))
        return yield* Effect.fail(new Error('Activity vault mismatch.'));
      return feed.payments.map((payment) =>
        adaptPayment({
          ...payment,
          agentName: workspaceAgentName(payment.agentKey),
          merchant: `Recipient ${payment.recipient.slice(0, 4)}…${payment.recipient.slice(-4)}`,
        }),
      );
    }).pipe(
      Effect.timeout(4_000),
      Effect.orElseSucceed(() => undefined),
    ),
    { signal },
  );
}
