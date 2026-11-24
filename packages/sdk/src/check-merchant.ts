import { Effect } from 'effect';
import { decodePaymentRequiredHeader } from '@x402/core/http';
import type { PaymentRequirements } from '@x402/core/types';
import { attempt, fromPromise } from './effects.js';
import { fail } from './errors.js';
import { validateChallengeHeader, validatePaymentRequired } from './payment-required.js';
import { validatePaymentRequirements } from './validation.js';
import type { BrimVaultConfigDetails, ValidatedPayment } from './types.js';
import type { BrimMerchantCheck } from './check-connection-types.js';

function cancelBody(response: Response | undefined) {
  try {
    void response?.body?.cancel().catch(() => undefined);
  } catch {
    /* The abort also terminates a locked stream. */
  }
}

/** Never reads the resource body or submits authorization. Intended for a trusted client/CLI URL. */
export function probeMerchant(
  config: BrimVaultConfigDetails,
  resourceUrl: string,
  transport: typeof globalThis.fetch,
) {
  return Effect.acquireUseRelease(
    Effect.sync(() => ({
      controller: new AbortController(),
      response: undefined as Response | undefined,
      request: undefined as Request | undefined,
      signal: undefined as AbortSignal | undefined,
    })),
    (state) =>
      Effect.gen(function* () {
        const response = yield* fromPromise(
          (signal) => {
            // Retain intermediate dependent signals until cleanup. Some runtimes
            // otherwise collect them before a stalled injected transport aborts.
            state.signal = AbortSignal.any([signal, state.controller.signal]);
            state.request = new Request(resourceUrl, {
              method: 'GET',
              redirect: 'error',
              credentials: 'omit',
              cache: 'no-store',
              referrerPolicy: 'no-referrer',
              signal: state.signal,
            });
            return transport(state.request).then((reply) => {
              state.response = reply;
              if (state.controller.signal.aborted) cancelBody(reply);
              return reply;
            });
          },
          'REQUEST_FAILED',
          'The resource could not be checked. Check its URL, availability, and browser CORS settings.',
        );
        return yield* attempt(
          (): { merchant: BrimMerchantCheck; payment?: ValidatedPayment } => {
            if (response.redirected || (response.status >= 300 && response.status < 400))
              fail(
                'REQUEST_FAILED',
                'Resource redirects are not allowed during connection checks.',
              );
            if (response.ok)
              return {
                merchant: {
                  status: 'free',
                  httpStatus: response.status,
                  facilitatorAcceptance: 'unverified',
                },
              };
            if (response.status !== 402)
              fail(
                'REQUEST_FAILED',
                'The resource returned neither a successful response nor an x402 quote.',
              );
            validateChallengeHeader(response);
            const required = decodePaymentRequiredHeader(response.headers.get('PAYMENT-REQUIRED')!);
            validatePaymentRequired(required);
            const offers = required.accepts.filter(
              (offer) => offer.scheme === 'exact' && offer.network === config.network,
            );
            if (offers.length === 0)
              fail(
                'UNSUPPORTED_PAYMENT',
                'The resource did not advertise exact payments on the configured network.',
              );
            if (offers.length !== 1)
              fail(
                'INVALID_PAYMENT_REQUIREMENTS',
                'The resource must advertise one compatible Solana payment option.',
              );
            const payment = validatePaymentRequirements(
              {
                network: config.network,
                facilitator: { mode: 'smart-wallet-exact', feePayers: config.facilitatorFeePayers },
                maxPaymentAmount: 0xffff_ffff_ffff_ffffn,
              },
              offers[0] as PaymentRequirements,
            );
            return {
              merchant: {
                status: 'quote',
                httpStatus: 402,
                amountBaseUnits: payment.amount.toString(),
                recipient: payment.recipient,
                feePayer: payment.feePayer,
                facilitatorAcceptance: 'unverified',
              },
              payment,
            };
          },
          'INVALID_PAYMENT_REQUIREMENTS',
          'The resource sent an invalid x402 quote.',
        );
      }),
    (state) =>
      Effect.sync(() => {
        state.controller.abort();
        cancelBody(state.response);
      }),
  );
}
