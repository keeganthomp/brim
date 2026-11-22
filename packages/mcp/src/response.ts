import { signature } from '@solana/kit';
import { decodePaymentResponseHeader } from '@x402/core/http';
import { Effect, Schema } from 'effect';
import { boundedBody } from './body.js';
import { attempt, McpFailure } from './errors.js';
import type { McpConfig } from './types.js';

const MAX_RECEIPT_LENGTH = 8192;
const Signature = Schema.String.check(
  Schema.makeFilter((value) => {
    try {
      signature(value);
      return true;
    } catch {
      return false;
    }
  }),
);
const uncertain = () =>
  new McpFailure({
    code: 'PAYMENT_OUTCOME_UNKNOWN',
    message: 'The payment receipt is invalid. Reconcile settlement before retrying.',
  });

/** A resource receipt is reported metadata, not independent proof of chain finality. */
export function readSettlementReceipt(header: string, network: string) {
  return Effect.gen(function* () {
    if (
      !header.length ||
      header.length > MAX_RECEIPT_LENGTH ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(header)
    ) {
      return yield* uncertain();
    }
    const value: unknown = yield* attempt(
      () => decodePaymentResponseHeader(header),
      'PAYMENT_OUTCOME_UNKNOWN',
      'The payment receipt could not be read.',
    );
    const receipt = yield* Schema.decodeUnknownEffect(
      Schema.Struct({
        success: Schema.Literal(true),
        network: Schema.Literal(network),
        transaction: Signature,
      }),
    )(value).pipe(Effect.mapError(uncertain));
    return { network: receipt.network, signature: receipt.transaction };
  });
}

export function readResourceResponse(
  response: Response,
  config: Pick<McpConfig, 'agentKey' | 'rpcUrl'>,
  network: string,
) {
  return Effect.gen(function* () {
    const header = response.headers.get('PAYMENT-RESPONSE');
    const receipt = header === null ? undefined : yield* readSettlementReceipt(header, network);
    const body = yield* boundedBody(response).pipe(
      Effect.mapError((error) =>
        error.code === 'RESPONSE_TOO_LARGE'
          ? error
          : new McpFailure({
              code: 'PAYMENT_OUTCOME_UNKNOWN',
              message:
                'The resource response could not be read. Reconcile settlement before retrying.',
            }),
      ),
    );
    const safeBody = body
      .replaceAll(config.agentKey, '[redacted]')
      .replaceAll(config.rpcUrl, '[redacted]');
    return { status: response.status, body: safeBody, ...(receipt ? { receipt } : {}) };
  }).pipe(
    Effect.ensuring(
      Effect.sync(() => {
        // Do not retain an unread upstream body when receipt validation fails. Cleanup
        // must not extend the request deadline if a custom stream refuses cancellation.
        if (response.body && !response.body.locked) void response.body.cancel().catch(() => {});
      }),
    ),
  );
}
