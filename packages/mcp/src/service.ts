import { Effect } from 'effect';
import { BrimPolicyViolationError, createBrimFetchEffect } from '@brim/sdk';
import { decodePaymentResponseHeader } from '@x402/core/http';
import { accountReader } from './accounts.js';
import { boundedBody } from './body.js';
import { loopback } from './config.js';
import { attempt, fail, McpFailure } from './errors.js';
import type { BrimMcpService, FetchArgs, McpConfig } from './types.js';

const TIMEOUT_MS = 15_000;
export function createBrimMcpService(config: McpConfig) {
  return Effect.gen(function* () {
    const reader = yield* accountReader(config);
    const paidFetch = createBrimFetchEffect({
      card: config.card,
      agentKey: config.agentKey,
      rpcUrl: config.rpcUrl,
    });
    const fetch = (input: FetchArgs) =>
      Effect.gen(function* () {
        const url = yield* attempt(
          () => new URL(input.url),
          'INVALID_ARGUMENTS',
          'Use a valid HTTPS resource URL.',
        );
        const allowed = config.local
          ? url.protocol === 'http:' &&
            loopback(url) &&
            url.port === '4020' &&
            url.pathname === '/report'
          : url.protocol === 'https:';
        if (
          !allowed ||
          url.username ||
          url.password ||
          (input.body !== undefined && (input.method ?? 'GET') !== 'POST') ||
          new TextEncoder().encode(input.body ?? '').length > 16_384
        )
          return yield* fail('INVALID_ARGUMENTS', 'Use a supported URL, method, and request body.');
        const response = yield* paidFetch(url, {
          method: input.method ?? 'GET',
          ...(input.body === undefined
            ? {}
            : { body: input.body, headers: { 'content-type': 'application/json' } }),
        }).pipe(
          Effect.mapError(
            (error) =>
              new McpFailure({
                code: error instanceof BrimPolicyViolationError ? error.code : 'REQUEST_FAILED',
                message: 'Paid request could not complete.',
              }),
          ),
        );
        const body = yield* boundedBody(response);
        let receipt: { network: string; signature: string } | undefined;
        const header = response.headers.get('PAYMENT-RESPONSE');
        if (header) {
          const settled = yield* attempt(
            () => decodePaymentResponseHeader(header),
            'PAYMENT_OUTCOME_UNKNOWN',
            'Could not validate settlement receipt.',
          );
          if (!settled.success) return yield* fail('PAYMENT_REJECTED', 'Payment was not settled.');
          receipt = { network: settled.network, signature: settled.transaction };
        }
        // Never return provider/RPC URLs, arbitrary headers, or configured secrets.
        const safeBody = body
          .replaceAll(config.agentKey, '[redacted]')
          .replaceAll(config.rpcUrl, '[redacted]');
        return { status: response.status, body: safeBody, ...(receipt ? { receipt } : {}) };
      }).pipe(
        Effect.timeout(TIMEOUT_MS),
        Effect.mapError((error) =>
          error._tag === 'TimeoutError'
            ? new McpFailure({
                code: 'PAYMENT_OUTCOME_UNKNOWN',
                message: 'Request timed out; reconcile settlement before retrying.',
              })
            : error,
        ),
      );
    const service: BrimMcpService = {
      balance: () =>
        reader.balance.pipe(
          Effect.timeout(TIMEOUT_MS),
          Effect.mapError((error) =>
            error._tag === 'TimeoutError'
              ? new McpFailure({ code: 'RPC_UNAVAILABLE', message: 'RPC timed out.' })
              : error,
          ),
        ),
      policy: () =>
        reader.policy.pipe(
          Effect.timeout(TIMEOUT_MS),
          Effect.mapError((error) =>
            error._tag === 'TimeoutError'
              ? new McpFailure({ code: 'RPC_UNAVAILABLE', message: 'RPC timed out.' })
              : error,
          ),
        ),
      fetch: (input) => fetch(input),
    };
    return service;
  });
}
