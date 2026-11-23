import { readFile, stat } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { createBrimVaultConfig } from '@brim/sdk';
import { Effect, Schema } from 'effect';
import { Pool } from 'pg';
import { localDatabaseUrl } from '../../../infra/local/database';
import { readLocalChain } from './local-chain';
import { toWorkspaceAgents, workspaceAgentName } from '../lib/chain/workspace-agents';
import { localRequest } from './local-request';
import {
  LocalWorkspaceError,
  localFailure,
  PaymentRows,
  PublicLocalMetadata,
} from './local-schema';

const attempt = <A>(read: () => A) => Effect.try({ try: read, catch: localFailure });
const io = <A>(read: () => Promise<A>) => Effect.tryPromise({ try: read, catch: localFailure });
const headers = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
let cachedPool: { url: string; pool: Pool } | undefined;

const readMetadata = Effect.gen(function* () {
  const filename = process.env.BRIM_LOCAL_CONFIG;
  if (!filename || !isAbsolute(filename)) return yield* localFailure();
  if ((yield* io(() => stat(filename))).size > 64 * 1024) return yield* localFailure();
  const raw = yield* io(() => readFile(filename, 'utf8'));
  if (Buffer.byteLength(raw) > 64 * 1024) return yield* localFailure();
  const value: unknown = yield* attempt(() => JSON.parse(raw));
  return yield* Schema.decodeUnknownEffect(PublicLocalMetadata)(value).pipe(
    Effect.mapError(localFailure),
  );
});

const databasePool = Effect.gen(function* () {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString || !localDatabaseUrl(connectionString)) return yield* localFailure();
  if (cachedPool?.url === connectionString) return cachedPool.pool;
  if (cachedPool) yield* io(() => cachedPool!.pool.end());
  const pool = yield* attempt(
    () =>
      new Pool({
        connectionString,
        max: 2,
        connectionTimeoutMillis: 3000,
        idleTimeoutMillis: 10000,
        statement_timeout: 5000,
      }),
  );
  pool.on('error', () => {
    /* Redacted: no local credentials or provider errors enter logs. */
  });
  cachedPool = { url: connectionString, pool };
  return pool;
});

/** Public metadata, confirmed chain state, and finalized indexed spend only. */
export const localWorkspace = (request: Request) =>
  Effect.gen(function* () {
    yield* localRequest(request);
    const metadata = yield* readMetadata;
    const chain = yield* readLocalChain(metadata);
    const { facilitatorAddress, programAddress, vaultAddress } = metadata;
    const vaultConfig =
      typeof facilitatorAddress === 'string'
        ? yield* attempt(() =>
            createBrimVaultConfig({
              programAddress,
              vaultAddress,
              network: 'devnet',
              facilitatorFeePayers: [facilitatorAddress],
            }),
          ).pipe(Effect.catch(() => Effect.succeed(undefined)))
        : undefined;
    const pool = yield* databasePool;
    const result = yield* io(() =>
      pool.query(
        `SELECT payment.signature, payment.event_index, payment.agent_key,
    payment.amount_base_units::TEXT AS amount_base_units, payment.chain_timestamp::TEXT AS chain_timestamp
    FROM brim_payments AS payment JOIN brim_chain_notifications AS notification USING (signature)
    WHERE payment.vault = $1 AND notification.status = 'settled'
    ORDER BY payment.chain_timestamp DESC, payment.signature DESC, payment.event_index DESC LIMIT 50`,
        [metadata.vaultAddress],
      ),
    );
    const rows = yield* Schema.decodeUnknownEffect(PaymentRows)(result.rows).pipe(
      Effect.mapError(localFailure),
    );
    const agents = toWorkspaceAgents(chain.policies, metadata.agentAddress);
    const payments = yield* attempt(() =>
      rows.map((row) => ({
        id: `${row.signature}:${row.event_index}`,
        merchant: 'Local paid API',
        agentName: workspaceAgentName(row.agent_key, metadata.agentAddress),
        agentKey: row.agent_key,
        amountBaseUnits: row.amount_base_units,
        signature: row.signature,
        settledAt: new Date(Number(BigInt(row.chain_timestamp)) * 1000).toISOString(),
      })),
    );
    return Response.json(
      {
        status: 'ready',
        balanceBaseUnits: chain.balanceBaseUnits,
        chainTimestamp: chain.chainTimestamp,
        isPaused: chain.isPaused,
        ownerActionsEnabled: false,
        ...(vaultConfig ? { vaultConfig } : {}),
        ownerAddress: chain.owner,
        vaultAddress: metadata.vaultAddress,
        programAddress: metadata.programAddress,
        policyWritesEnabled: true,
        agents,
        payments,
      },
      { headers },
    );
  }).pipe(
    Effect.catch((error) =>
      Effect.succeed(
        Response.json(
          {
            code: error instanceof LocalWorkspaceError ? error.code : 'LOCAL_WORKSPACE_UNAVAILABLE',
          },
          {
            status: error instanceof LocalWorkspaceError && error.code === 'LOCAL_ONLY' ? 404 : 503,
            headers,
          },
        ),
      ),
    ),
  );
