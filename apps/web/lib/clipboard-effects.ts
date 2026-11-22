import * as Data from 'effect/Data';
import * as Effect from 'effect/Effect';

class ClipboardOperationError extends Data.TaggedError('ClipboardOperationError')<{
  operation: 'copy-template' | 'copy-signature';
}> {}

/** The browser write has already started synchronously within its user gesture. */
export function completeClipboardWrite(
  outcome: Promise<boolean>,
  operation: 'copy-template' | 'copy-signature',
): Promise<boolean> {
  return Effect.runPromise(
    Effect.promise(() => outcome).pipe(
      Effect.flatMap((success) =>
        success ? Effect.succeed(true) : Effect.fail(new ClipboardOperationError({ operation })),
      ),
      Effect.orElseSucceed(() => false),
    ),
  );
}
