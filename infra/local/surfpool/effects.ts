import { Data, Effect, Result, Schema } from 'effect';

export class LocalSurfpoolError extends Data.TaggedError('LocalSurfpoolError')<{
  readonly message: string;
}> {}
export const attempt = <A>(evaluate: () => A, message: string) =>
  Effect.try({
    try: evaluate,
    catch: () => new LocalSurfpoolError({ message }),
  });
export const fromPromise = <A>(evaluate: () => PromiseLike<A>, message: string) =>
  Effect.tryPromise({
    try: evaluate,
    catch: () => new LocalSurfpoolError({ message }),
  });
export const decode = <S extends Schema.ConstraintDecoder<unknown>>(schema: S, input: unknown) =>
  attempt(
    () => Schema.decodeUnknownSync(schema)(input),
    'Invalid local Surfpool response or configuration.',
  );
export async function run<A, E>(effect: Effect.Effect<A, E>): Promise<A> {
  const result = await Effect.runPromise(Effect.result(effect));
  if (Result.isFailure(result)) throw result.failure;
  return result.success;
}
