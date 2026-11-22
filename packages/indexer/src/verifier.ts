import { Effect, Schema } from 'effect';
import { IndexerConfigurationError, IndexerRpcError } from './errors.js';
import { INVOKE, parsePaymentLogs } from './logs.js';
import type { TransactionVerifier, Verification } from './types.js';
export { parsePaymentLogs } from './logs.js';

const transactionSchema = Schema.Struct({
  slot: Schema.Number.pipe(
    Schema.check(Schema.makeFilter((n: number) => Number.isSafeInteger(n) && n >= 0)),
  ),
  transaction: Schema.Struct({ signatures: Schema.Array(Schema.String) }),
  meta: Schema.Struct({ err: Schema.Unknown, logMessages: Schema.Array(Schema.String) }),
});
export interface SolanaVerifierOptions {
  rpcUrl: string;
  programId: string;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
}

/** The native effect is cancellable; only finalized successful runtime events can settle. */
export function createSolanaVerifier(options: SolanaVerifierOptions): TransactionVerifier {
  const url = new URL(options.rpcUrl);
  if (
    url.protocol !== 'https:' &&
    !(url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname))
  )
    throw new IndexerConfigurationError({ code: 'RPC_REQUIRES_HTTPS' });
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(options.programId))
    throw new IndexerConfigurationError({ code: 'INVALID_PROGRAM_ID' });
  const fetcher = options.fetch ?? globalThis.fetch;
  const verify = (signature: string) =>
    Effect.gen(function* () {
      const response = yield* Effect.tryPromise({
        try: (signal) =>
          fetcher(url, {
            method: 'POST',
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
      if (!response.ok) return yield* Effect.fail(new IndexerRpcError({ code: 'RPC_UNAVAILABLE' }));
      const body: unknown = yield* Effect.tryPromise({
        try: () => response.json(),
        catch: () => new IndexerRpcError({ code: 'RPC_INVALID_RESPONSE' }),
      });
      if (
        !body ||
        typeof body !== 'object' ||
        !('result' in body) ||
        ('error' in body && body.error)
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
      Effect.timeout(options.timeoutMs ?? 10_000),
      Effect.mapError((error) =>
        error._tag === 'TimeoutError' ? new IndexerRpcError({ code: 'RPC_TIMEOUT' }) : error,
      ),
    );
  return Object.assign(
    (signature: string): Promise<Verification> => Effect.runPromise(verify(signature)),
    { effect: verify },
  );
}
