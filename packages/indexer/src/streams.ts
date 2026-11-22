import { Effect } from 'effect';

type ReadFailure = 'INVALID' | 'LIMIT' | 'TIMEOUT';
interface ReadOptions<E> {
  maxBytes: number;
  timeoutMs: number;
  error: (reason: ReadFailure) => E;
}

/** Bounded cleanup even when a custom stream has an unresponsive cancel hook. */
export const cancelStream = (stream: { cancel: () => Promise<void> } | null) =>
  Effect.tryPromise(() => stream?.cancel() ?? Promise.resolve()).pipe(
    Effect.timeout(250),
    Effect.ignore,
  );

/** Bound actual decoded bytes and lifetime, including responses without Content-Length. */
export function readBoundedUtf8<E>(
  body: ReadableStream<Uint8Array> | null,
  options: ReadOptions<E>,
) {
  if (!body) return Effect.succeed('');
  return Effect.acquireUseRelease(
    Effect.try({ try: () => body.getReader(), catch: () => options.error('INVALID') }),
    (reader) =>
      Effect.gen(function* () {
        const chunks: Uint8Array[] = [];
        let size = 0;
        while (true) {
          const chunk = yield* Effect.tryPromise({
            try: () => reader.read(),
            catch: () => options.error('INVALID'),
          });
          if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > options.maxBytes) return yield* Effect.fail(options.error('LIMIT'));
          chunks.push(chunk.value);
        }
        return yield* Effect.try({
          try: () => new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)),
          catch: () => options.error('INVALID'),
        });
      }),
    (reader) =>
      cancelStream(reader).pipe(
        Effect.ensuring(Effect.try(() => reader.releaseLock()).pipe(Effect.ignore)),
      ),
  ).pipe(
    Effect.timeout(options.timeoutMs),
    Effect.mapError((error) =>
      typeof error === 'object' &&
      error !== null &&
      '_tag' in error &&
      error._tag === 'TimeoutError'
        ? options.error('TIMEOUT')
        : (error as E),
    ),
  );
}
