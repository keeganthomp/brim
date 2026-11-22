import * as Data from 'effect/Data';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';
import { adaptLocalWorkspace } from './adapter';
import { LocalWorkspaceSchema } from './schema';

export class LocalWorkspaceError extends Data.TaggedError('LocalWorkspaceError')<{
  reason: 'unavailable' | 'invalid-response';
}> {}

export const readLocalWorkspace = () =>
  Effect.gen(function* () {
    const response = yield* Effect.tryPromise({
      try: (signal) => fetch('/api/local/workspace', { cache: 'no-store', signal }),
      catch: () => new LocalWorkspaceError({ reason: 'unavailable' }),
    });
    if (!response.ok) return yield* Effect.fail(new LocalWorkspaceError({ reason: 'unavailable' }));
    const payload: unknown = yield* Effect.tryPromise({
      try: () => response.json(),
      catch: () => new LocalWorkspaceError({ reason: 'invalid-response' }),
    });
    const workspace = yield* Schema.decodeUnknownEffect(LocalWorkspaceSchema)(payload).pipe(
      Effect.mapError(() => new LocalWorkspaceError({ reason: 'invalid-response' })),
    );
    return adaptLocalWorkspace(workspace);
  }).pipe(Effect.timeout('8 seconds'));

/** Keep cancellation attached to the Effect runtime after the lazy import resolves. */
export function fetchLocalWorkspace(signal: AbortSignal) {
  return Effect.runPromise(readLocalWorkspace(), { signal });
}
