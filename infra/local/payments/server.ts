/** Offline local paid resource and facilitator. Never bind this demo server publicly. */
import { createServer } from 'node:http';
import { Effect } from 'effect';
import { LocalSetupError } from '../../../scripts/local/config.ts';
import { RESOURCE_URL } from './context.ts';
import { loadLocalContext } from './context-cli.ts';
import { createLocalResource } from './resource.ts';
import { handleLocalRequest } from './http.ts';
import { createLocalSettlementLedger } from './ledger.ts';

const controller = new AbortController();
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => controller.abort());

const program = Effect.scoped(
  Effect.gen(function* () {
    const context = yield* loadLocalContext;
    const ledger = yield* createLocalSettlementLedger(context);
    const resource = yield* createLocalResource(context);
    yield* Effect.acquireRelease(
      Effect.tryPromise({
        try: () =>
          new Promise<ReturnType<typeof createServer>>((resolve, reject) => {
            const server = createServer(
              { maxHeaderSize: 16 * 1024, requestTimeout: 90_000, headersTimeout: 10_000 },
              (request, response) => {
                void Effect.runPromise(
                  handleLocalRequest(resource, request, response, ledger.recordSettlement),
                ).catch(() => {
                  if (!response.headersSent)
                    response.writeHead(503, { 'content-type': 'application/json' });
                  response.end('{"code":"LOCAL_PAYMENT_UNAVAILABLE"}');
                });
              },
            );
            server.maxConnections = 32;
            server.once('error', reject);
            server.listen(4020, '127.0.0.1', () => resolve(server));
          }),
        catch: () => new LocalSetupError({ message: 'Local payment port 4020 is unavailable.' }),
      }),
      (server) =>
        Effect.promise(
          () =>
            new Promise<void>((resolve) => {
              server.closeAllConnections();
              server.close(() => resolve());
            }),
        ),
    );
    yield* Effect.sync(() =>
      console.log(`Local Brim paid API ready: ${RESOURCE_URL} ($0.04 fake USDC).`),
    );
    return yield* Effect.never;
  }),
);

try {
  await Effect.runPromise(program, { signal: controller.signal });
} catch {
  if (!controller.signal.aborted) {
    console.error('LOCAL_PAYMENT_SERVER_UNAVAILABLE: run npm run dev and check the local stack.');
    process.exitCode = 1;
  }
}
