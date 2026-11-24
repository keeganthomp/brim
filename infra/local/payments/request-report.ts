import { createBrimFetchEffect } from '@brim/sdk';
import { decodePaymentResponseHeader } from '@x402/core/http';
import { Data, Effect } from 'effect';
import { RESOURCE_URL, type LocalContext } from './context.ts';

export class LocalPaymentError extends Data.TaggedError('LocalPaymentError')<{ message: string }> {}
export const paymentFailure = (message: string) => Effect.fail(new LocalPaymentError({ message }));

/** Pay the fixture report once. A facilitator receipt remains provisional. */
export function requestLocalReport(context: LocalContext) {
  return Effect.gen(function* () {
    const brimFetch = createBrimFetchEffect({
      vaultConfig: context.vaultConfig,
      agentKey: context.agentKey,
      rpcUrl: context.rpcUrl,
    });
    const response = yield* brimFetch(RESOURCE_URL);
    if (!response.ok) return yield* paymentFailure('The local paid resource did not succeed.');
    const receipt = yield* Effect.try({
      try: () => decodePaymentResponseHeader(response.headers.get('PAYMENT-RESPONSE') ?? ''),
      catch: () =>
        new LocalPaymentError({
          message: 'The paid resource did not return a valid settlement receipt.',
        }),
    });
    if (!receipt.success || !receipt.transaction || receipt.network !== context.network)
      return yield* paymentFailure('Settlement needs to be checked before another payment.');
    return receipt.transaction;
  });
}
