import { readFile } from 'node:fs/promises';
import { Effect, Schema } from 'effect';
import { command } from './chain/process.ts';
import { configuration, LocalVaultMetadata, LocalSetupError, root } from './local/config.ts';
import { testLocalPayment } from './local/payment-test.ts';

const args = new Set(process.argv.slice(2));
const run = (executable: string, argv: readonly string[], env = process.env) =>
  command(executable, argv, { cwd: root, env });

const doctor = Effect.gen(function* () {
  yield* command('docker', ['info', '--format', '{{.ServerVersion}}'], {
    cwd: root,
    capture: true,
  }).pipe(
    Effect.mapError(
      () =>
        new LocalSetupError({
          message: 'Start Docker Desktop (or Docker Engine), then rerun npm run dev.',
        }),
    ),
  );
  yield* command('docker', ['compose', 'version'], { cwd: root, capture: true }).pipe(
    Effect.mapError(
      () =>
        new LocalSetupError({
          message: 'Docker Compose v2 is required. Install Docker Desktop or the compose plugin.',
        }),
    ),
  );
});

const program = Effect.gen(function* () {
  const supported = [
    '--doctor',
    '--down',
    '--services-only',
    '--test-chain',
    '--test-db',
    '--test-local',
    '--migrate-only',
  ];
  if ([...args].some((arg) => !supported.includes(arg)) || args.size > 1) {
    return yield* Effect.fail(
      new LocalSetupError({
        message: 'Use npm run dev, local:up, local:down, doctor, test:chain, or db:migrate.',
      }),
    );
  }
  yield* doctor;
  if (args.has('--doctor')) {
    console.log(
      'Node 24 + Docker + Compose ready. Rust and Solana tools are optional; chain builds have a Docker fallback.',
    );
    return;
  }
  if (args.has('--down')) {
    yield* run('docker', ['compose', '--profile', 'test', 'down']);
    console.log('Brim services stopped. Database data is preserved.');
    return;
  }

  const config = yield* configuration;
  const env = {
    ...process.env,
    BRIM_RPC_PORT: String(config.rpcPort),
    BRIM_DB_PORT: String(config.dbPort),
    BRIM_SITE_PORT: String(config.sitePort),
    BRIM_TEST_RPC_PORT: String(config.testRpcPort),
    DATABASE_URL: config.databaseUrl,
    BRIM_RPC_URL: config.rpcUrl,
    BRIM_LOCAL_CONFIG: config.file,
  };
  console.log('Preparing Brim locally. All chain funds and keys created here are test-only.');
  yield* run('npm', ['run', 'build:packages']);
  const databaseOnly = args.has('--migrate-only') || args.has('--test-db');
  if (!databaseOnly) yield* run('node', ['scripts/chain/build.ts']);
  if (args.has('--test-chain')) {
    yield* run(
      'docker',
      ['compose', '--profile', 'test', 'up', '-d', '--wait', 'surfpool-test'],
      env,
    );
    yield* run(
      'node',
      ['programs/brim/tests/surfpool.mjs', '--rpc-url', `http://127.0.0.1:${config.testRpcPort}`],
      env,
    ).pipe(
      Effect.ensuring(
        run('docker', ['compose', '--profile', 'test', 'stop', 'surfpool-test'], env).pipe(
          Effect.ignore,
        ),
      ),
    );
    return;
  }
  yield* run(
    'docker',
    ['compose', 'up', '-d', '--wait', ...(databaseOnly ? ['postgres'] : [])],
    env,
  );
  yield* run('node', ['packages/indexer/dist/migrate-cli.js'], env);
  if (args.has('--test-db')) {
    yield* run(
      'npm',
      ['exec', '--', 'vitest', 'run', 'packages/indexer/tests/postgres.integration.test.ts'],
      {
        ...env,
        BRIM_TEST_DATABASE_URL: config.databaseUrl,
      },
    );
    return;
  }
  if (args.has('--migrate-only')) return;

  yield* run('node', ['infra/local/surfpool/bootstrap.ts'], env);
  if (args.has('--services-only')) {
    console.log('Local services are ready. Run npm run dev for the dashboard and paid API.');
    return;
  }
  const text = yield* Effect.tryPromise({
    try: () => readFile(config.file, 'utf8'),
    catch: () =>
      new LocalSetupError({
        message: 'Local vault config is missing. Run npm run local:up again.',
      }),
  });
  const vault = yield* Effect.try({
    try: () => Schema.decodeUnknownSync(LocalVaultMetadata)(JSON.parse(text)),
    catch: () =>
      new LocalSetupError({
        message: 'Local vault config is invalid. Check the test values in .brim/local.json.',
      }),
  });
  const serverEnv = {
    ...env,
    BRIM_PROGRAM_ADDRESS: vault.programAddress,
    BRIM_TRACKED_VAULTS: vault.vaultAddress,
    SOLANA_RPC_URL: config.rpcUrl,
    HELIUS_WEBHOOK_AUTHORIZATION: 'Bearer brim-local-only-webhook-not-a-production-secret',
    NEXT_PUBLIC_BRIM_MODE: 'local',
  };
  if (args.has('--test-local')) {
    yield* testLocalPayment(serverEnv);
    return;
  }
  console.log(
    `\nDashboard: http://localhost:${config.webPort} (local test funds; verified payments)`,
  );
  console.log(`Solana RPC: ${config.rpcUrl}\nLocal paid API: http://127.0.0.1:4020`);
  console.log(`SDK docs: http://localhost:${config.webPort}/docs/sdk/`);
  console.log(
    'Choose Make test payment in the dashboard or run npm run demo:payment. Ctrl-C stops web/API/docs; npm run local:down stops Surfpool/Postgres.\n',
  );
  yield* Effect.all(
    [
      run('node', ['infra/local/payments/server.ts'], serverEnv),
      run(
        'node',
        ['scripts/dev.mjs', '--site', '--hostname', '127.0.0.1', '--port', String(config.sitePort)],
        { ...process.env, BRIM_LOCAL_DOCS_ASSET_PREFIX: '/brim-docs-assets' },
      ),
      run(
        'node',
        ['scripts/dev.mjs', '--hostname', '127.0.0.1', '--port', String(config.webPort)],
        serverEnv,
      ),
    ],
    { concurrency: 'unbounded' },
  );
});

const abort = new AbortController();
process.once('SIGINT', () => abort.abort());
process.once('SIGTERM', () => abort.abort());
await Effect.runPromise(program, { signal: abort.signal }).catch((error: unknown) => {
  if (!abort.signal.aborted) {
    console.error(
      error instanceof Error ? error.message : 'Local startup failed. Run npm run doctor.',
    );
    process.exitCode = 1;
  }
});
