import { Effect } from 'effect';
import { McpFailure } from './errors.js';
import { MAX_RESPONSE_BYTES } from './schemas.js';

/** Consume at most 64 KiB and cancel the upstream stream on overflow or interruption. */
export function boundedBody(response: Response) {
  return Effect.tryPromise({
    try: async (signal) => {
      const reader = response.body?.getReader();
      if (!reader) return '';
      const chunks: Uint8Array[] = [];
      let length = 0;
      const cancel = () => {
        void reader.cancel().catch(() => {});
      };
      signal.addEventListener('abort', cancel, { once: true });
      try {
        for (;;) {
          signal.throwIfAborted();
          const next = await reader.read();
          if (next.done) break;
          length += next.value.byteLength;
          if (length > MAX_RESPONSE_BYTES) {
            cancel();
            throw new McpFailure({
              code: 'RESPONSE_TOO_LARGE',
              message: 'API response exceeds 64 KiB.',
            });
          }
          chunks.push(next.value);
        }
        const bytes = new Uint8Array(length);
        let offset = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, offset);
          offset += chunk.byteLength;
        }
        return new TextDecoder().decode(bytes);
      } finally {
        signal.removeEventListener('abort', cancel);
        reader.releaseLock();
      }
    },
    catch: (error) =>
      error instanceof McpFailure
        ? error
        : new McpFailure({ code: 'REQUEST_FAILED', message: 'API response could not be read.' }),
  });
}
