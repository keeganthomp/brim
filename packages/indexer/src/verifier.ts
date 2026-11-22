import { Effect, Schema } from 'effect';
import { IndexerConfigurationError, IndexerRpcError } from './errors.js';
import { INVOKE, parsePaymentLogs } from './logs.js';
import { cancelStream, readBoundedUtf8 } from './streams.js';
import { AddressSchema, SignatureSchema } from './validation.js';
import type { TransactionVerifier, Verification } from './types.js';
export { parsePaymentLogs } from './logs.js';

const MAX_RPC_BYTES = 4 * 1024 * 1024;
const transactionSchema = Schema.Struct({
  slot: Schema.Number.check(Schema.makeFilter((n: number) => Number.isSafeInteger(n) && n >= 0)),
  transaction: Schema.Struct({
    signatures: Schema.Array(SignatureSchema).check(Schema.isBetweenLength(1, 64)),
  }),
  meta: Schema.Struct({
    err: Schema.Union([Schema.Null, Schema.String, Schema.Record(Schema.String, Schema.Unknown)]),
    logMessages: Schema.Array(Schema.String).check(Schema.isMaxLength(10_000)),
  }),
});
export interface SolanaVerifierOptions {
  rpcUrl: string;
  programId: string;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
}

/** Finalized-only verification; transport and body reads remain bounded and cancellable. */
export function createSolanaVerifier(options: SolanaVerifierOptions): TransactionVerifier {
  const url = new URL(options.rpcUrl);
  if (
    url.protocol !== 'https:' &&
    !(url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname))
  )
    throw new IndexerConfigurationError({ code: 'RPC_REQUIRES_HTTPS' });
  if (!Schema.is(AddressSchema)(options.programId))
    throw new IndexerConfigurationError({ code: 'INVALID_PROGRAM_ID' });
  const timeoutMs = options.timeoutMs ?? 10_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000)
    throw new IndexerConfigurationError({ code: 'INVALID_RPC_TIMEOUT' });
  const fetcher = options.fetch ?? globalThis.fetch;
  const verify = (signature: string) =>
    Effect.gen(function* () {
      if (!Schema.is(SignatureSchema)(signature))
        return yield* Effect.fail(new IndexerRpcError({ code: 'RPC_INVALID_SIGNATURE' }));
      const response = yield* Effect.tryPromise({
        try: (signal) =>
          fetcher(url, {
            method: 'POST',
            redirect: 'error',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              method: 'getTransaction',
              params: [
                signature,
                { commitment: 'finalized', encoding: 'json', maxSupportedTransactionVersion: 0 },
              ],
            }),
            signal,
          }),
        catch: () => new IndexerRpcError({ code: 'RPC_UNAVAILABLE' }),
      });
      // Keep the response stream in the same fiber; the bounded reader cancels it on every exit.
      if (!response.ok) {
        yield* cancelStream(response.body);
        return yield* Effect.fail(new IndexerRpcError({ code: 'RPC_UNAVAILABLE' }));
      }
      const length = response.headers.get('content-length');
      if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_RPC_BYTES)) {
        yield* cancelStream(response.body);
        return yield* Effect.fail(new IndexerRpcError({ code: 'RPC_RESPONSE_LIMIT' }));
      }
      const raw = yield* readBoundedUtf8(response.body, {
        maxBytes: MAX_RPC_BYTES,
        timeoutMs,
        error: (reason) =>
          new IndexerRpcError({
            code:
              reason === 'LIMIT'
                ? 'RPC_RESPONSE_LIMIT'
                : reason === 'TIMEOUT'
                  ? 'RPC_TIMEOUT'
                  : 'RPC_INVALID_RESPONSE',
          }),
      });
      const body: unknown = yield* Effect.try({
        try: () => JSON.parse(raw),
        catch: () => new IndexerRpcError({ code: 'RPC_INVALID_RESPONSE' }),
      });
      if (
        !body ||
        typeof body !== 'object' ||
        !('result' in body) ||
        !('jsonrpc' in body) ||
        body.jsonrpc !== '2.0' ||
        !('id' in body) ||
        body.id !== 1 ||
        Object.hasOwn(body, 'error')
      )
        return yield* Effect.fail(new IndexerRpcError({ code: 'RPC_INVALID_RESPONSE' }));
      if (body.result === null) return { status: 'pending' } as const;
      const tx = yield* Schema.decodeUnknownEffect(transactionSchema)(body.result).pipe(
        Effect.mapError(() => new IndexerRpcError({ code: 'RPC_INVALID_TRANSACTION' })),
      );
      if (tx.transaction.signatures[0] !== signature || !Object.hasOwn(tx.meta, 'err'))
        return yield* Effect.fail(new IndexerRpcError({ code: 'RPC_INVALID_TRANSACTION' }));
      if (!tx.meta.logMessages.some((log) => INVOKE.exec(log)?.[1] === options.programId))
        return { status: 'unrelated', slot: tx.slot } as const;
      if (tx.meta.err !== null) return { status: 'failed', slot: tx.slot } as const;
      const payments = yield* Effect.try({
        try: () => parsePaymentLogs(tx.meta.logMessages, options.programId),
        catch: (error) =>
          error instanceof IndexerRpcError
            ? error
            : new IndexerRpcError({ code: 'RPC_INVALID_LOGS' }),
      });
      return payments.length
        ? ({ status: 'settled', slot: tx.slot, payments } as const)
        : ({ status: 'unrelated', slot: tx.slot } as const);
    }).pipe(
      Effect.timeout(timeoutMs),
      Effect.mapError((error) =>
        error._tag === 'TimeoutError' ? new IndexerRpcError({ code: 'RPC_TIMEOUT' }) : error,
      ),
    );
  return Object.assign(
    (signature: string): Promise<Verification> => Effect.runPromise(verify(signature)),
    { effect: verify },
  );
}
