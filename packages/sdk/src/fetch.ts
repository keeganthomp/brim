import { Effect, Result } from 'effect';
import { x402Client, x402HTTPClient } from '@x402/core/client';
import type { SchemeNetworkClient } from '@x402/core/types';
import { wrapFetchWithPayment, ResponseBodyTooLargeError } from '@x402/fetch';
import { BrimPolicyViolationError, fail } from './errors.js';
import { attempt, fromPromise, run } from './effects.js';
import { resolveBrimConfig } from './vault-config.js';
import { validatePaymentRequired } from './payment-required.js';
import { paymentTransport } from './transport.js';
import { createSolanaPaymentAdapter } from './solana.js';
import { validateConfig, validatePaymentRequirements } from './validation.js';
import type {
  BrimConfig,
  BrimVaultConfig,
  BrimCardConfig,
  BrimEffectFetch,
  BrimEvent,
  ResolvedBrimConfig,
} from './types.js';

function snapshot(input: BrimConfig | BrimVaultConfig | BrimCardConfig): ResolvedBrimConfig {
  const config = resolveBrimConfig(input);
  validateConfig(config);
  return {
    ...config,
    facilitator: { ...config.facilitator, feePayers: [...config.facilitator.feePayers] },
    agentSecretKey:
      typeof config.agentSecretKey === 'string'
        ? config.agentSecretKey
        : config.agentSecretKey.slice(),
  };
}

/** Same API as fetch. Configuration errors are immediate; payments use the Effect runtime. */
export function createBrimFetch(config: BrimVaultConfig): typeof globalThis.fetch;
export function createBrimFetch(config: BrimCardConfig): typeof globalThis.fetch;
export function createBrimFetch(config: BrimConfig): typeof globalThis.fetch;
export function createBrimFetch(
  input: BrimConfig | BrimVaultConfig | BrimCardConfig,
): typeof globalThis.fetch {
  const perform = makeFetchEffect(snapshot(input));
  return (resource, init) => run(perform(resource, init));
}

/** Lazy, typed, interruptible API for applications already using Effect. */
export function createBrimFetchEffect(
  input: BrimVaultConfig | BrimCardConfig | BrimConfig,
): BrimEffectFetch {
  // Capture mutable key/trust arrays now; validation and all I/O remain lazy.
  const captured = { ...input };
  if ('agentKey' in captured && captured.agentKey instanceof Uint8Array)
    captured.agentKey = captured.agentKey.slice();
  if ('agentSecretKey' in captured && captured.agentSecretKey instanceof Uint8Array)
    captured.agentSecretKey = captured.agentSecretKey.slice();
  if (
    'facilitator' in captured &&
    captured.facilitator &&
    Array.isArray(captured.facilitator.feePayers)
  )
    captured.facilitator = {
      ...captured.facilitator,
      feePayers: [...captured.facilitator.feePayers],
    };
  return (resource, init) =>
    Effect.gen(function* () {
      const config = yield* attempt(
        () => snapshot(captured),
        'INVALID_CONFIG',
        'Provide your public vault config and scoped agent key.',
      );
      return yield* makeFetchEffect(config)(resource, init);
    });
}

function makeFetchEffect(config: ResolvedBrimConfig): BrimEffectFetch {
  const adapter = createSolanaPaymentAdapter(config);
  const transport = config.fetch ?? globalThis.fetch;
  return (input, init) =>
    Effect.gen(function* () {
      const request = yield* attempt(
        () => {
          const original = new Request(input, init);
          const url = new URL(original.url);
          if (
            url.protocol !== 'https:' &&
            !(
              url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
            )
          )
            fail('INVALID_CONFIG', 'Paid resources must use HTTPS or localhost.');
          if (original.headers.has('PAYMENT-SIGNATURE') || original.headers.has('X-PAYMENT'))
            fail(
              'INVALID_PAYMENT_REQUIREMENTS',
              'Remove existing payment headers before using Brim fetch.',
            );
          return new Request(original, { redirect: 'error' });
        },
        'INVALID_CONFIG',
        'Use a valid HTTPS resource URL and fetch options.',
      );
      const merchant = new URL(request.url).hostname;
      let failure: BrimPolicyViolationError | undefined;
      let amount: string | undefined;
      const handoff = { signal: request.signal, dispatched: false };
      const emit = (event: Omit<BrimEvent, 'merchant'>) =>
        fromPromise(
          () => Promise.resolve(config.onEvent?.({ ...event, merchant })),
          'REQUEST_FAILED',
          'Telemetry failed.',
        ).pipe(Effect.ignore);
      const capture = (error: unknown): never => {
        if (error instanceof BrimPolicyViolationError) failure = error;
        throw error;
      };
      const scheme: SchemeNetworkClient = {
        scheme: 'exact',
        createPaymentPayload: async (version, requirements) => {
          try {
            return await run(
              Effect.gen(function* () {
                const payment = yield* attempt(
                  () => {
                    if (version !== 2)
                      fail('UNSUPPORTED_PAYMENT', 'Only x402 version 2 is supported.');
                    return validatePaymentRequirements(config, requirements);
                  },
                  'INVALID_PAYMENT_REQUIREMENTS',
                  'Merchant payment details are invalid.',
                );
                amount = payment.amount.toString();
                const transaction = yield* adapter.createTransactionEffect(payment);
                yield* emit({ status: 'payment_signed', amount });
                return { x402Version: 2, payload: { transaction } };
              }),
              { signal: handoff.signal },
            );
          } catch (error) {
            return capture(error);
          }
        },
      };
      const client = new x402Client((version, requirements) => {
        try {
          if (version !== 2) fail('UNSUPPORTED_PAYMENT', 'Only x402 version 2 is supported.');
          if (requirements.length !== 1)
            fail(
              'INVALID_PAYMENT_REQUIREMENTS',
              'Merchant must provide one compatible USDC payment option.',
            );
          validatePaymentRequirements(config, requirements[0]);
          return requirements[0];
        } catch (error) {
          return capture(error);
        }
      })
        .register(config.network, scheme)
        .setSpendControls(false); // Local typed checks + on-chain policy enforce the bounds.
      const httpClient = new x402HTTPClient(client);
      httpClient.onPaymentRequired(async ({ paymentRequired }) =>
        validatePaymentRequired(paymentRequired),
      );
      const result = yield* Effect.result(
        Effect.tryPromise({
          try: (signal) => {
            handoff.signal = AbortSignal.any([signal, request.signal]);
            const guardedTransport = paymentTransport(transport, handoff);
            return wrapFetchWithPayment(
              guardedTransport,
              httpClient,
            )(new Request(request, { signal: handoff.signal }));
          },
          catch: (error) => {
            // Once authorization reaches the transport, exception text/types cannot
            // establish whether settlement happened. Never downgrade that outcome.
            if (handoff.dispatched)
              return new BrimPolicyViolationError(
                'PAYMENT_OUTCOME_UNKNOWN',
                'Payment outcome is unknown. Check settlement before making another paid request.',
              );
            if (error instanceof ResponseBodyTooLargeError)
              return new BrimPolicyViolationError(
                'INVALID_PAYMENT_REQUIREMENTS',
                'Merchant sent an oversized x402 payment declaration.',
              );
            if (failure) return failure;
            if (error instanceof BrimPolicyViolationError) return error;
            if (
              error instanceof Error &&
              error.message.startsWith('Failed to parse payment requirements:')
            )
              return new BrimPolicyViolationError(
                'INVALID_PAYMENT_REQUIREMENTS',
                'Merchant sent an invalid x402 payment header.',
              );
            if (
              error instanceof Error &&
              error.message.startsWith('Failed to create payment payload:')
            )
              return new BrimPolicyViolationError(
                'UNSUPPORTED_PAYMENT',
                'No compatible payment option could be created. Ask the merchant about Brim support.',
              );
            return new BrimPolicyViolationError(
              'REQUEST_FAILED',
              'Request failed before payment was sent. Check the connection and try again.',
            );
          },
        }),
      );
      if (Result.isFailure(result)) {
        if (result.failure.code !== 'PAYMENT_OUTCOME_UNKNOWN')
          yield* emit({ status: 'blocked', amount, code: result.failure.code });
        return yield* result.failure;
      }
      if (result.success.status === 402) {
        yield* emit({ status: 'payment_rejected', amount, code: 'PAYMENT_REJECTED' });
        return yield* new BrimPolicyViolationError(
          'PAYMENT_REJECTED',
          'Resource rejected the paid retry. Settlement may have happened; reconcile before another payment.',
        );
      }
      return result.success;
    });
}
