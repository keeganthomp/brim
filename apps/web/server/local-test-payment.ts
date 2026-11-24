import { Effect, Option, Semaphore } from 'effect';
import { localPaymentFlow } from './local-test-payment-flow';
import { localFixtureVault } from './local-policy-owner';
import { localRequest } from './local-request';
import { LocalWorkspaceError } from './local-schema';

const gate = Semaphore.makeUnsafe(1);
const headers = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
const reply = (code: string, status: number) => Response.json({ code }, { headers, status });

function hasEmptyBody(request: Request) {
  return Effect.tryPromise(async () => {
    const reader = request.body?.getReader();
    if (!reader) return true;
    try {
      return (await reader.read()).done;
    } finally {
      reader.releaseLock();
    }
  }).pipe(
    Effect.timeout(1_000),
    Effect.orElseSucceed(() => false),
  );
}

export function localTestPayment(request: Request) {
  return Effect.gen(function* () {
    const filename = process.env.BRIM_LOCAL_CONFIG;
    yield* localRequest(request, {
      environment: process.env.NODE_ENV,
      configured: Boolean(filename),
      method: 'POST',
      requireOrigin: true,
    });
    if (!filename) return reply('LOCAL_ONLY', 404);
    if (!(yield* hasEmptyBody(request))) return reply('INVALID_TEST_REQUEST', 400);
    const result = yield* gate.withPermitsIfAvailable(1)(
      Effect.gen(function* () {
        const { config } = yield* localFixtureVault;
        const override = process.env.BRIM_RPC_URL;
        if (override && override !== config.rpcUrl) return reply('LOCAL_ONLY', 404);
        const proof = yield* localPaymentFlow(filename, config.rpcUrl).pipe(
          Effect.timeout(25_000),
          Effect.match({
            onFailure: () => reply('TEST_PAYMENT_OUTCOME_UNKNOWN', 409),
            onSuccess: (result) => Response.json(result, { headers }),
          }),
        );
        return proof;
      }),
    );
    return Option.getOrElse(result, () => reply('TEST_PAYMENT_IN_PROGRESS', 409));
  }).pipe(
    Effect.catch((error) =>
      Effect.succeed(
        error instanceof LocalWorkspaceError && error.code === 'LOCAL_ONLY'
          ? reply('LOCAL_ONLY', 404)
          : reply('LOCAL_PAYMENT_UNAVAILABLE', 503),
      ),
    ),
  );
}
