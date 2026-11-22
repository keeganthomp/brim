# Brim indexer

Server-only Helius enhanced webhook intake with independent, finalized Solana RPC verification. Webhook claims about amounts, recipients, status and domains are ignored. The program is **not deployed** by this package.

```ts
import { Pool } from 'pg';
import {
  createHeliusWebhookHandler,
  createSolanaVerifier,
  PostgresEventStore,
} from '@brim/indexer';

const programId = process.env.BRIM_PROGRAM_ADDRESS!;
export const POST = createHeliusWebhookHandler({
  authorization: process.env.HELIUS_WEBHOOK_AUTHORIZATION!, // exact Helius Authorization value
  trackedVaults: process.env.BRIM_TRACKED_VAULTS!.split(','),
  store: new PostgresEventStore(new Pool({ connectionString: process.env.DATABASE_URL })),
  verifyTransaction: createSolanaVerifier({ rpcUrl: process.env.SOLANA_RPC_URL!, programId }),
});
```

Run `node packages/indexer/dist/migrate-cli.js` with `DATABASE_URL` configured before accepting requests. The runner applies the SQL files in `migrations/` in numeric order under an advisory lock with a checksum ledger; each migration and its ledger entry commit atomically. Editing an applied migration fails closed; add a new migration for changes. Use a least-privilege application database role and Cloud SQL authenticated transport (connector, TLS, or Unix socket); the package never changes database authentication settings. Keep secrets server-only, provided through Secret Manager at deployment. The Authorization value must be 32–1024 bytes; use a randomly generated token, not an example value.

Helius sends a JSON array containing `signature` fields. Only POST with JSON and exact configured authorization is accepted, with a 512 KiB streamed body limit, a ten-second body deadline, maximum 50 notifications, and deduplication within a batch. `bodyTimeoutMs` can set a shorter deployment-specific deadline (range 1–30,000 milliseconds). Unread, rejected, and timed-out bodies are closed. The complete valid batch enters durable pending storage before verification; up to four items are verified concurrently, and one unavailable item does not prevent the rest from progressing. HTTP 503 requests delivery retries. Database insertion is atomic and idempotent under concurrent deliveries via row locking and `(signature, event_index)` uniqueness. Finalized outcomes cannot regress to pending. A replay at the same finalized slot may append distinct missing events from another tracked vault; existing event contents remain immutable, and conflicting finalized slots or event contents are rejected. A signature already classified as unrelated remains terminal: changing tracked vaults does not backfill it, so scope expansion requires a separately planned verified backfill.

`createSolanaVerifier` requests `getTransaction` at `finalized` commitment with version 0 support, requires a matching JSON-RPC response envelope, checks the returned transaction signature and runtime result, and decodes only the expected program's `PaymentExecuted` events inside successful invocations. Child-program spoofed events and events rolled back by a failed enclosing invocation are excluded. Truncated invocation logs fail closed. RPC bodies are capped at 4 MiB of actual decoded bytes and a ten-second default deadline, with bounded stream cleanup on every exit; HTTP redirects are rejected. Amounts remain integer base-unit strings throughout; finalized data is retained separately from any merchant/domain enrichment.

No verifier means **pending only**, never settlement. The injected verifier is a trusted server-side adapter; do not expose an interface that lets clients provide verification results. Configure the deployed program ID and correct RPC network. Production should use an authenticated, trusted RPC provider; this adapter trusts that provider's chain response and does not independently prove consensus.

`failed` means a finalized failed transaction attempted the expected program. It does not claim a particular policy violation or debit amount. The verifier requires finalized commitment before recording immutable settlement. A missing/not-yet-finalized transaction returns HTTP 503 so Helius retries. Run the bounded reconciliation pass below to recover pending records after retry exhaustion. Unrelated or failed signatures cannot be attributed to a tracked vault from the current event alone. The failed-signature notification table is operational telemetry, not a tenant-authorized activity feed.

Client preflight denials are **not chain events** and are deliberately excluded from this endpoint. They need a separately authenticated telemetry channel and must be labeled client-reported. Events never submitted to the chain cannot be discovered by RPC or Helius. Merchant domains also require separately verified vendor metadata; on-chain policy enforcement uses recipient addresses.

## Pending recovery job

`reconcilePending({ store, verifyTransaction, trackedVaults, limit: 100, concurrency: 4 })` executes one bounded pass against the same finalized verifier and vault scope as webhook intake. Construct `store` with `new PostgresEventStore(pool)`. It returns only `{ attempted, settled, failed, unrelated, pending, errors }` counts; per-item RPC failures leave records pending and do not stop other records. Counts describe verification outcomes in this pass, not newly inserted rows. Overlapping jobs may verify the same signature, and atomic database writes prevent double indexing.

Pending selection updates `last_attempted_at` and `verification_attempts` in one statement with `FOR UPDATE SKIP LOCKED`. Persistent errors rotate behind records never attempted, so they do not permanently starve the queue. Apply migration `002_pending_reconciliation.sql` before running it. No long-lived database lock spans an RPC call.

A server-only CLI is built with the package:

```sh
node packages/indexer/dist/reconcile-cli.js
```

It requires the same `DATABASE_URL`, `BRIM_PROGRAM_ADDRESS`, `SOLANA_RPC_URL` and comma-separated `BRIM_TRACKED_VAULTS` values as the web route. `BRIM_RECONCILE_LIMIT` defaults to 100 (range 1–500) and `BRIM_RECONCILE_CONCURRENCY` to 4 (range 1–8). Webhook authorization is unnecessary for an internal job. Output is a redacted JSON summary. Configuration/database failures emit a generic code with exit 1; per-item errors also produce exit 1 after the rest of the batch completes. The caller owns the database pool; the CLI closes its pool on exit.

For GCP, run this command as a Cloud Run Job using the server application's database/RPC secrets and Cloud SQL service identity. Invoke periodically using Cloud Scheduler with authenticated service-account invocation; do not expose it as a public HTTP endpoint. No scheduler or cloud resource is created by this package. The default RPC timeout is ten seconds per item; set the job timeout to cover the bounded batch (the default 100 records/four workers can require about 250 seconds plus database overhead). Alert on repeated job failures or a growing pending count and adjust frequency/batch size to keep up with traffic. Never log the environment or database/RPC URLs.

## Effect runtime

Core workflows use Effect 4: `ChainRpc` and `ChainPersistence` are injectable `Context.Service` dependencies; Effect Schema validates webhook and finalized-RPC boundaries. The shared verification workflow retains vault scope and event provenance across webhook and reconciliation paths. RPC fetches honor Effect cancellation and timeout. `Effect.forEach` bounds reconciliation concurrency and catches each typed failure so one unavailable signature does not halt the batch. Native PostgreSQL effects acquire/release connections and roll back failed/interrupted transactions. If rollback itself fails, the connection is discarded rather than reused. Event writes have transaction-local five-second statement/lock timeouts. Tagged errors expose only stable redacted codes.

`reconcilePendingEffect` and `migrateDatabaseEffect` expose native effects; Promise APIs and CLI/HTTP entrypoints form application boundaries. External Promise verifier/store adapters remain supported for callers and tests, while built-in adapters expose native effects without starting a nested runtime. The CLI closes its database pool through an Effect resource scope.

The migration CLI requires only server-side `DATABASE_URL`; it reports actionable configuration/error codes without printing connection strings. SQL migrations are simple transactional files: the runner accepts an outer `BEGIN; ... COMMIT;` wrapper and rejects nested transaction control. PostgreSQL statement timeout bounds database operations at 60 seconds. Local development should run the migration CLI after PostgreSQL is healthy and before starting the web server. No database connection or credentials are required for typecheck, build, or unit tests.

Optional live PostgreSQL checks use `BRIM_TEST_DATABASE_URL` when running the package test command. They create a random isolated schema, test migration apply/reapply/checksum drift and concurrent idempotent event writes, then drop only that schema. The application database role needs schema-creation privileges for this explicit local integration test. Without this variable, those four checks are skipped and unit tests run without PostgreSQL.
