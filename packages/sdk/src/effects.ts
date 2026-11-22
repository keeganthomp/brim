import { Effect, Result } from 'effect';
import { BrimPolicyViolationError, type BrimErrorCode } from './errors.js';

const safeError = (error: unknown, code: BrimErrorCode, message: string) =>
  error instanceof BrimPolicyViolationError ? error : new BrimPolicyViolationError(code, message);

/** Translate SDK/JSON boundaries into typed failures without retaining credential-bearing causes. */
export const attempt = <A>(evaluate: () => A, code: BrimErrorCode, message: string) =>
  Effect.try({ try: evaluate, catch: (error) => safeError(error, code, message) });

/** Promise interop only at an actual RPC, signing, or HTTP boundary. */
export const fromPromise = <A>(
  evaluate: (signal: AbortSignal) => PromiseLike<A>,
  code: BrimErrorCode,
  message: string,
) => Effect.tryPromise({ try: evaluate, catch: (error) => safeError(error, code, message) });

/** Preserve the tagged domain error itself for ordinary async/await callers. */
export async function run<A>(
  effect: Effect.Effect<A, BrimPolicyViolationError>,
  options?: { signal?: AbortSignal },
): Promise<A> {
  const result = await Effect.runPromise(Effect.result(effect), options);
  if (Result.isFailure(result)) throw result.failure;
  return result.success;
}
