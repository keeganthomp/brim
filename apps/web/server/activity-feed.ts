/** Opt-in public chain-only feed. It is not an authenticated tenant or merchant-metadata API. */
import { isAddress } from '@solana/kit';
import { Data, Effect, Schema } from 'effect';
import { Pool } from 'pg';
import { readVerifiedPayments } from './verified-feed';

class ActivityFeedError extends Data.TaggedError('ActivityFeedError')<{
  code:
    'ACTIVITY_DISABLED' | 'ACTIVITY_NOT_FOUND' | 'INVALID_ACTIVITY_QUERY' | 'ACTIVITY_UNAVAILABLE';
  status: 400 | 404 | 503;
}> {}
const failure = (code: ActivityFeedError['code'], status: ActivityFeedError['status']) =>
  new ActivityFeedError({ code, status });
const headers = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
const TrackedVaults = Schema.Array(Schema.String.check(Schema.makeFilter(isAddress))).check(
  Schema.isBetweenLength(1, 100),
);
let cached: { connectionString: string; pool: Pool } | undefined;
const database = (connectionString: string) =>
  Effect.try({
    try: () => {
      if (cached?.connectionString === connectionString) return cached.pool;
      const old = cached;
      const pool = new Pool({
        connectionString,
        max: 3,
        connectionTimeoutMillis: 3000,
        idleTimeoutMillis: 10000,
        statement_timeout: 5000,
        options: '-c default_transaction_read_only=on',
      });
      pool.on('error', () => {
        /* Never include credentials or provider causes in public errors/logs. */
      });
      cached = { connectionString, pool };
      if (old) void old.pool.end().catch(() => {});
      return pool;
    },
    catch: () => failure('ACTIVITY_UNAVAILABLE', 503),
  });

export const activityFeed = (
  request: Request,
  env: Readonly<Record<string, string | undefined>> = process.env,
  connect = database,
) =>
  Effect.gen(function* () {
    if (env.BRIM_PUBLIC_ACTIVITY_ENABLED !== 'true')
      return yield* failure('ACTIVITY_DISABLED', 404);
    if (request.method !== 'GET') return yield* failure('ACTIVITY_NOT_FOUND', 404);
    const url = yield* Effect.try({
      try: () => new URL(request.url),
      catch: () => failure('INVALID_ACTIVITY_QUERY', 400),
    });
    const values = url.searchParams.getAll('vault');
    if (
      values.length !== 1 ||
      !isAddress(values[0]!) ||
      [...url.searchParams.keys()].some((key) => key !== 'vault')
    )
      return yield* failure('INVALID_ACTIVITY_QUERY', 400);
    const vaultAddress = values[0]!;
    const tracked = yield* Schema.decodeUnknownEffect(TrackedVaults)(
      env.BRIM_TRACKED_VAULTS?.split(',')
        .map((value) => value.trim())
        .filter(Boolean),
    ).pipe(Effect.mapError(() => failure('ACTIVITY_NOT_FOUND', 404)));
    if (!tracked.includes(vaultAddress)) return yield* failure('ACTIVITY_NOT_FOUND', 404);
    if (!env.DATABASE_URL) return yield* failure('ACTIVITY_UNAVAILABLE', 503);
    const payments = yield* readVerifiedPayments(
      yield* connect(env.DATABASE_URL),
      vaultAddress,
    ).pipe(Effect.mapError(() => failure('ACTIVITY_UNAVAILABLE', 503)));
    return Response.json(
      { status: 'ready', commitment: 'finalized', vaultAddress, payments },
      { headers },
    );
  }).pipe(
    Effect.catch((error) =>
      Effect.succeed(Response.json({ code: error.code }, { status: error.status, headers })),
    ),
  );
