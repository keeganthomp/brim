import { open } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { Effect } from 'effect';
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
