/** Durable receipt markers contain only a public transaction signature, never a signing key. */
import { randomUUID } from 'node:crypto';
import { mkdir, open, readdir, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { isSignature } from '@solana/kit';
import { Effect } from 'effect';
import { LocalSetupError } from '../../../scripts/local/config.ts';

const failure = () =>
  new LocalSetupError({
    message:
      'Local payment receipt could not be durably queued. Reconcile its settlement before retrying.',
  });
const io = <A>(run: () => Promise<A>) => Effect.tryPromise({ try: run, catch: failure });
const signatureValid = (signature: string) =>
  /^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(signature) && isSignature(signature);
const syncDirectory = (directory: string) =>
  Effect.acquireUseRelease(
    io(() => open(directory, 'r')),
    (file) => io(() => file.sync()),
    (file) => io(() => file.close()).pipe(Effect.ignore),
  );

export function createSettlementOutbox(directory: string) {
  return Effect.gen(function* () {
    yield* io(() => mkdir(directory, { recursive: true, mode: 0o700 }));
    return {
      enqueue: (signature: string) =>
        Effect.gen(function* () {
          if (!signatureValid(signature)) return yield* failure();
          const temporary = path.join(directory, `.${randomUUID()}.tmp`);
          yield* Effect.acquireUseRelease(
            io(() => open(temporary, 'wx', 0o600)),
            (file) => io(() => file.sync()),
            (file) => io(() => file.close()).pipe(Effect.ignore),
          );
          yield* io(() => rename(temporary, path.join(directory, `${signature}.pending`))).pipe(
            Effect.onError(() => io(() => unlink(temporary)).pipe(Effect.ignore)),
          );
          yield* syncDirectory(directory);
        }),
      pending: io(() => readdir(directory, { withFileTypes: true })).pipe(
        Effect.map((names) =>
          names
            .filter((entry) => entry.isFile() && entry.name.endsWith('.pending'))
            .map((entry) => entry.name.slice(0, -8))
            .filter(signatureValid)
            .sort()
            .slice(0, 100),
        ),
      ),
      acknowledge: (signature: string) =>
        Effect.gen(function* () {
          if (!signatureValid(signature)) return yield* failure();
          yield* io(() => unlink(path.join(directory, `${signature}.pending`)));
          yield* syncDirectory(directory);
        }),
    };
  });
}
