/** Deterministic, offline-only Surfpool settings shared by local tools. */
import { BRIM_DEVELOPMENT_PROGRAM_ADDRESS } from '@brim/sdk';
import { address } from '@solana/kit';
import { Effect, Schema } from 'effect';
import { attempt, decode, fromPromise, LocalSurfpoolError, run } from './effects.ts';

export const SURFPOOL_VERSION = '1.7.0';
export const DEVNET_GENESIS = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
export const PROGRAM = address(BRIM_DEVELOPMENT_PROGRAM_ADDRESS);
export const MINT = address('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');
export const TOKEN = address('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
export function assertLocalRpc(rpcUrl: string): void {
  const url = new URL(rpcUrl);
  if (
    url.protocol !== 'http:' ||
    !['localhost', '127.0.0.1', '[::1]', 'surfpool'].includes(url.hostname)
  ) {
    throw new LocalSurfpoolError({
      message: 'Local Surfpool tools require a loopback or Docker surfpool HTTP URL.',
    });
  }
}
const Envelope = Schema.Struct({
  result: Schema.optional(Schema.Unknown),
  error: Schema.optional(Schema.Unknown),
});
let id = 0;
export function localRpcEffect(rpcUrl: string, method: string, params: readonly unknown[] = []) {
  return Effect.gen(function* () {
    yield* attempt(() => assertLocalRpc(rpcUrl), 'A local Surfpool HTTP URL is required.');
    const response = yield* fromPromise(
      () =>
        fetch(rpcUrl, {
          method: 'POST',
          redirect: 'error',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }),
          signal: AbortSignal.timeout(20_000),
        }),
      'Local Surfpool is unavailable.',
    );
    if (!response.ok)
      return yield* new LocalSurfpoolError({
        message: `Surfpool returned HTTP ${response.status}`,
      });
    const result = yield* decode(
      Envelope,
      yield* fromPromise(() => response.json(), 'Invalid Surfpool JSON response.'),
    );
    if (result.error !== undefined)
      return yield* new LocalSurfpoolError({ message: `${method} failed on local Surfpool.` });
    return result.result;
  });
}
export const localRpc = (rpcUrl: string, method: string, params: readonly unknown[] = []) =>
  run(localRpcEffect(rpcUrl, method, params));
