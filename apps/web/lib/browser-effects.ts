import * as Data from 'effect/Data';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';
import { DEMO_STORAGE_KEY } from './demo';
import { DemoStateJson, type DemoState } from './demo-model';

export class BrowserOperationError extends Data.TaggedError('BrowserOperationError')<{
  operation: 'read-demo' | 'write-demo';
  cause: unknown;
}> {}

/** Storage is read by the cheap hook first; empty storage never loads this module. */
export const decodeDemoState = (saved: string): Promise<DemoState | null> =>
  Effect.runPromise(
    Schema.decodeUnknownEffect(DemoStateJson)(saved).pipe(Effect.orElseSucceed(() => null)),
  );

/** Recheck ownership immediately before writing so stale async work cannot win. */
export const persistDemoState = (state: DemoState, canPersist: () => boolean): Promise<void> =>
  Effect.runPromise(
    Effect.gen(function* () {
      const encoded = yield* Schema.encodeEffect(DemoStateJson)(state);
      yield* Effect.try({
        try: () => {
          if (canPersist()) localStorage.setItem(DEMO_STORAGE_KEY, encoded);
        },
        catch: (cause) => new BrowserOperationError({ operation: 'write-demo', cause }),
      });
    }).pipe(Effect.ignore),
  );
