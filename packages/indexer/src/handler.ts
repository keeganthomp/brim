import { createHash, timingSafeEqual } from 'node:crypto';
import { Effect, Schema } from 'effect';
import { IndexerConfigurationError, WebhookRequestError } from './errors.js';
import { ChainPersistence, ChainRpc, persistenceService, rpcService } from './services.js';
import type { EventStore, TransactionVerifier } from './types.js';
import { NotificationsSchema, trackedVaultSet } from './validation.js';
import { verifyAndRecord } from './workflow.js';

const MAX_BYTES = 512 * 1024;
export interface WebhookOptions {
  authorization: string;
  trackedVaults: readonly string[];
  store: EventStore;
  verifyTransaction?: TransactionVerifier;
}
const response = (status: number, code: string) =>
  Response.json({ code }, { status, headers: { 'cache-control': 'no-store' } });
const requestError = (status: number, code: string) =>
  Effect.fail(new WebhookRequestError({ status, code }));

function readBody(request: Request) {
  return Effect.gen(function* () {
    const length = request.headers.get('content-length');
    if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_BYTES))
      return yield* requestError(413, 'PAYLOAD_TOO_LARGE');
    if (!request.body) return '';
    return yield* Effect.acquireUseRelease(
      Effect.try({
        try: () => request.body!.getReader(),
        catch: () => new WebhookRequestError({ status: 400, code: 'INVALID_BODY' }),
      }),
      (reader) =>
        Effect.gen(function* () {
          const chunks: Uint8Array[] = [];
          let size = 0;
          while (true) {
            const chunk = yield* Effect.tryPromise({
              try: () => reader.read(),
              catch: () => new WebhookRequestError({ status: 400, code: 'INVALID_BODY' }),
            });
            if (chunk.done) break;
            size += chunk.value.byteLength;
            if (size > MAX_BYTES) {
              yield* Effect.tryPromise(() => reader.cancel()).pipe(Effect.ignore);
              return yield* requestError(413, 'PAYLOAD_TOO_LARGE');
            }
            chunks.push(chunk.value);
          }
          return Buffer.concat(chunks).toString('utf8');
        }),
      (reader) =>
        Effect.tryPromise(() => reader.cancel()).pipe(
          Effect.ignore,
          Effect.ensuring(Effect.try(() => reader.releaseLock()).pipe(Effect.ignore)),
        ),
    );
  });
}

/** Authenticated enhanced webhook. Domain workflow uses services; Request/Response is the boundary. */
export function createHeliusWebhookHandler(
  options: WebhookOptions,
): (request: Request) => Promise<Response> {
  if (
    Buffer.byteLength(options.authorization) < 32 ||
    Buffer.byteLength(options.authorization) > 1024
  )
    throw new IndexerConfigurationError({ code: 'WEBHOOK_AUTH_MUST_BE_32_TO_1024_BYTES' });
  const authDigest = createHash('sha256').update(options.authorization).digest();
  const vaults = trackedVaultSet(options.trackedVaults);
  return (request) =>
    Effect.runPromise(
      Effect.gen(function* () {
        if (request.method !== 'POST') return yield* requestError(405, 'METHOD_NOT_ALLOWED');
        const auth = request.headers.get('authorization') ?? '';
        if (
          auth.length > 1024 ||
          !timingSafeEqual(authDigest, createHash('sha256').update(auth).digest())
        )
          return yield* requestError(401, 'UNAUTHORIZED');
        if (
          request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !==
          'application/json'
        )
          return yield* requestError(415, 'JSON_REQUIRED');
        const raw = yield* readBody(request);
        const input: unknown = yield* Effect.try({
          try: () => JSON.parse(raw),
          catch: () => new WebhookRequestError({ status: 400, code: 'INVALID_JSON' }),
        });
        const notifications = yield* Schema.decodeUnknownEffect(NotificationsSchema)(input).pipe(
          Effect.mapError(
            () => new WebhookRequestError({ status: 400, code: 'INVALID_NOTIFICATION' }),
          ),
        );
        const store = yield* ChainPersistence;
        const proofs = yield* Effect.forEach(
          new Set(notifications.map((item) => item.signature)),
          (signature) =>
            Effect.gen(function* () {
              yield* store.record(signature, { status: 'pending' });
              return options.verifyTransaction
                ? yield* verifyAndRecord(signature, vaults)
                : { status: 'pending' as const };
            }),
        );
        return options.verifyTransaction && proofs.some((proof) => proof.status === 'pending')
          ? response(503, 'AWAITING_FINALITY')
          : response(200, 'ACCEPTED');
      }).pipe(
        Effect.provideService(ChainPersistence, persistenceService(options.store)),
        Effect.provideService(
          ChainRpc,
          options.verifyTransaction
            ? rpcService(options.verifyTransaction)
            : { verify: () => Effect.succeed({ status: 'pending' as const }) },
        ),
        Effect.catch((error) =>
          Effect.succeed(
            error instanceof WebhookRequestError
              ? response(error.status, error.code)
              : response(503, 'VERIFICATION_UNAVAILABLE'),
          ),
        ),
      ),
    );
}
