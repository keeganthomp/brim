import { Effect } from 'effect';
import { ChainPersistence, ChainRpc } from './services.js';
import { scopeVerification } from './validation.js';

/** Both webhook and pending recovery use the same provenance, scope, and persistence rules. */
export const verifyAndRecord = (signature: string, vaults: ReadonlySet<string>) =>
  Effect.gen(function* () {
    const store = yield* ChainPersistence;
    const rpc = yield* ChainRpc;
    const proof = yield* scopeVerification(yield* rpc.verify(signature), vaults);
    yield* store.record(signature, proof);
    return proof;
  });
