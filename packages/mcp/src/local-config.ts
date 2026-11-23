import { open } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { Effect, Schema } from 'effect';
import { createKeyPairSignerFromBytes } from '@solana/kit';
import { fail, io, McpFailure } from './errors.js';

const MAX_LOCAL_BYTES = 32_768;

/** Bound the actual read, not just a prior pathname stat that can become stale. */
export function readLocalConfiguration(filename: string) {
  if (!isAbsolute(filename))
    return fail('INVALID_LOCAL_SETUP', 'Use an absolute local configuration path.');
  return Effect.acquireUseRelease(
    io(
      () => open(filename, 'r'),
      'LOCAL_SETUP_REQUIRED',
      'Start the local Brim stack before using --local.',
    ),
    (file) =>
      io(
        async (signal) => {
          const info = await file.stat();
          if (!info.isFile() || info.size > MAX_LOCAL_BYTES)
            throw new McpFailure({
              code: 'INVALID_LOCAL_SETUP',
              message: 'The local configuration file is invalid.',
            });
          const bytes = Buffer.alloc(MAX_LOCAL_BYTES + 1);
          let length = 0;
          while (length < bytes.length) {
            signal.throwIfAborted();
            const next = await file.read(bytes, length, bytes.length - length, length);
            if (!next.bytesRead) break;
            length += next.bytesRead;
          }
          if (length > MAX_LOCAL_BYTES)
            throw new McpFailure({
              code: 'INVALID_LOCAL_SETUP',
              message: 'The local configuration file is too large.',
            });
          return bytes.subarray(0, length).toString('utf8');
        },
        'INVALID_LOCAL_SETUP',
        'The local configuration could not be read.',
      ),
    (file) =>
      io(() => file.close(), 'INVALID_LOCAL_SETUP', 'Local configuration cleanup failed.').pipe(
        Effect.ignore,
      ),
  );
}

const AgentKeyBytes = Schema.Array(
  Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 0, maximum: 255 })),
).check(Schema.isBetweenLength(64, 64));

/** An explicit local-only identity override. Private bytes never enter diagnostics. */
export function readLocalAgentKey(filename: string) {
  if (!isAbsolute(filename))
    return fail('INVALID_LOCAL_SETUP', 'Use an absolute private agent key file path.');
  return Effect.acquireUseRelease(
    io(
      () => open(filename, 'r'),
      'INVALID_LOCAL_SETUP',
      'The private agent key file could not be opened.',
    ),
    (file) =>
      Effect.gen(function* () {
        const text = yield* io(
          async (signal) => {
            const info = await file.stat();
            if (!info.isFile() || info.size > 1024 || (info.mode & 0o777) !== 0o600)
              throw new Error('INVALID_PRIVATE_KEY_FILE');
            const bytes = Buffer.alloc(1025);
            let length = 0;
            while (length < bytes.length) {
              signal.throwIfAborted();
              const next = await file.read(bytes, length, bytes.length - length, length);
              if (!next.bytesRead) break;
              length += next.bytesRead;
            }
            if (length > 1024) throw new Error('INVALID_PRIVATE_KEY_FILE');
            return bytes.subarray(0, length).toString('utf8');
          },
          'INVALID_LOCAL_SETUP',
          'Use a mode-0600 private JSON keypair file with 64 bytes.',
        );
        const key = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(AgentKeyBytes))(
          text,
        ).pipe(
          Effect.mapError(
            () =>
              new McpFailure({
                code: 'INVALID_LOCAL_SETUP',
                message: 'The private agent key file must contain a valid 64-byte JSON keypair.',
              }),
          ),
        );
        yield* io(
          () => createKeyPairSignerFromBytes(new Uint8Array(key)),
          'INVALID_LOCAL_SETUP',
          'The private agent keypair is invalid.',
        );
        return JSON.stringify(key);
      }),
    (file) =>
      io(() => file.close(), 'INVALID_LOCAL_SETUP', 'Private key file cleanup failed.').pipe(
        Effect.ignore,
      ),
  );
}
