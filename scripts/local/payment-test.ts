import { Effect, Schedule } from 'effect';
import { command } from '../chain/process.ts';
import { LocalSetupError, root } from './config.ts';

/** Use the actual resource/facilitator, SDK, Surfpool program and Postgres ledger. */
export const testLocalPayment = (env: NodeJS.ProcessEnv) =>
  Effect.gen(function* () {
    const resource = command('node', ['infra/local/payments/server.ts'], { cwd: root, env }).pipe(
      Effect.andThen(
        Effect.fail(
          new LocalSetupError({
            message: 'The local paid API stopped before the payment test completed.',
          }),
        ),
      ),
    );
    const healthy = Effect.tryPromise({
      try: async (signal) => {
        const response = await fetch('http://127.0.0.1:4020/health', {
          signal: AbortSignal.any([signal, AbortSignal.timeout(1000)]),
        });
        if (!response.ok) throw new Error('Not ready');
        const body = await response.json();
        if (body.status !== 'ok' || body.mode !== 'local-only') throw new Error('Not Brim');
      },
      catch: () =>
        new LocalSetupError({ message: 'The local paid API did not become healthy on port 4020.' }),
    });
    const running = yield* healthy.pipe(
      Effect.match({ onSuccess: () => true, onFailure: () => false }),
    );
    const ready = healthy.pipe(
      Effect.retry({ times: 50, schedule: Schedule.spaced('100 millis') }),
    );
    const client = ready.pipe(
      Effect.andThen(command('node', ['infra/local/payments/client.ts'], { cwd: root, env })),
      Effect.andThen(command('node', ['infra/local/payments/mcp-client.ts'], { cwd: root, env })),
    );
    if (running) {
      console.log(
        'Using the running local paid API; its process will stay running after the tests.',
      );
      return yield* client;
    }
    return yield* Effect.raceFirst(resource, client);
  });
