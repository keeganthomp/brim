/** Exercises the real SDK, compiled program, facilitator and PostgreSQL ledger locally. */
import { pathToFileURL } from 'node:url';
import { address, createSolanaRpc } from '@solana/kit';
import { decodePaymentResponseHeader } from '@x402/core/http';
import { createBrimFetchEffect, findTokenAccount, NETWORKS } from '@brim/sdk';
import {
  createSolanaVerifier,
  migrateDatabaseEffect,
  PostgresEventStore,
  type Verification,
} from '@brim/indexer';
import { Data, Effect } from 'effect';
import { Pool } from 'pg';
import { configuration } from '../../../scripts/local/config.ts';
import { localDatabaseUrl } from '../database.ts';
import { loadLocalContext, PAYMENT_AMOUNT, RESOURCE_URL, type LocalContext } from './context.ts';

class LocalPaymentError extends Data.TaggedError('LocalPaymentError')<{ message: string }> {}
const io = <A>(work: (signal: AbortSignal) => PromiseLike<A>, message: string) =>
  Effect.tryPromise({ try: work, catch: () => new LocalPaymentError({ message }) });
const failure = (message: string) => Effect.fail(new LocalPaymentError({ message }));
const PRICE = PAYMENT_AMOUNT;

export function finalizedProof(rpcUrl: string, programId: string, signature: string) {
  const verifier = createSolanaVerifier({ rpcUrl, programId });
  return Effect.gen(function* () {
    for (let attempt = 0; attempt < 50; attempt++) {
      const proof = yield* verifier.effect!(signature);
      if (proof.status !== 'pending') return proof;
      yield* Effect.sleep('100 millis');
    }
    return yield* failure(
      'Payment confirmation is pending. Reconcile its signature before running the paid demo again.',
    );
  });
}

export function persistProof(pool: Pool, signature: string, proof: Verification) {
  return Effect.gen(function* () {
    yield* migrateDatabaseEffect(pool);
    const store = new PostgresEventStore(pool);
    yield* store.effects.record(signature, proof);
    yield* store.effects.record(signature, proof); // Exercise duplicate delivery against the real ledger.
    const result = yield* io(
      () =>
        pool.query<{ count: string; amount: string }>(
          'SELECT COUNT(*)::text AS count, COALESCE(SUM(amount_base_units), 0)::text AS amount FROM brim_payments WHERE signature = $1',
          [signature],
        ),
      'Could not read the local payment ledger. Start PostgreSQL and check its migration status.',
    );
    if (result.rows[0]?.count !== '1' || result.rows[0]?.amount !== PRICE.toString())
      return yield* failure('The local ledger did not persist exactly one verified payment.');
    return 1;
  });
}

export function localBalancesEffect(context: LocalContext) {
  return Effect.gen(function* () {
    const rpc = createSolanaRpc(context.rpcUrl);
    const mint = NETWORKS[context.network].mint;
    const [vaultAta, merchantAta] = yield* io(
      () =>
        Promise.all([
          findTokenAccount(context.vaultAddress, mint),
          findTokenAccount(context.merchantAddress, mint),
        ]),
      'Local vault addresses are invalid. Check .brim/local.json.',
    );
    return yield* Effect.gen(function* () {
      const [vault, merchant] = yield* io(
        (signal) =>
          Promise.all([
            rpc
              .getTokenAccountBalance(address(vaultAta), { commitment: 'confirmed' })
              .send({ abortSignal: signal }),
            rpc
              .getTokenAccountBalance(address(merchantAta), { commitment: 'confirmed' })
              .send({ abortSignal: signal }),
          ]),
        'Local USDC accounts are unavailable. Start the local stack with npm run dev.',
      );
      return { vault: BigInt(vault.value.amount), merchant: BigInt(merchant.value.amount) };
    });
  });
}

export function persistLocalProof(
  defaultDatabaseUrl: string,
  signature: string,
  proof: Verification,
) {
  return Effect.gen(function* () {
    const connectionString = process.env.DATABASE_URL || defaultDatabaseUrl;
    if (!localDatabaseUrl(connectionString))
      return yield* failure(
        'The payment demo requires the local PostgreSQL started by npm run dev.',
      );
    return yield* Effect.acquireUseRelease(
      Effect.sync(() => {
        const pool = new Pool({ connectionString, max: 2, connectionTimeoutMillis: 5000 });
        pool.on('error', () => {});
        return pool;
      }),
      (pool) => persistProof(pool, signature, proof),
      (pool) => io(() => pool.end(), 'Local database cleanup failed.').pipe(Effect.ignore),
    );
  });
}

export const localPaymentDemo = Effect.gen(function* () {
  const settings = yield* configuration;
  const context = yield* loadLocalContext;
  const balances = localBalancesEffect(context);
  const before = yield* balances;
  const brimFetch = createBrimFetchEffect({
    vaultConfig: context.vaultConfig,
    agentKey: context.agentKey,
    rpcUrl: context.rpcUrl,
  });
  const response = yield* brimFetch(RESOURCE_URL);
  if (!response.ok)
    return yield* failure('The local paid resource did not succeed. Check the payment server.');
  const receipt = yield* Effect.try({
    try: () => decodePaymentResponseHeader(response.headers.get('PAYMENT-RESPONSE') ?? ''),
    catch: () =>
      new LocalPaymentError({
        message: 'The paid resource did not return a valid settlement receipt.',
      }),
  });
  if (!receipt.success || !receipt.transaction || receipt.network !== context.network)
    return yield* failure(
      'Payment was not settled. Do not create another authorization until its outcome is known.',
    );
  const after = yield* balances;
  if (before.vault - after.vault !== PRICE || after.merchant - before.merchant !== PRICE)
    return yield* failure('Actual USDC balance changes did not match the local $0.04 payment.');
  const proof = yield* finalizedProof(context.rpcUrl, context.programAddress, receipt.transaction);
  if (
    proof.status !== 'settled' ||
    proof.payments.length !== 1 ||
    !proof.payments.some(
      (payment) =>
        payment.vault === context.vaultAddress &&
        payment.agentKey === context.agentAddress &&
        payment.recipient === context.merchantAddress &&
        payment.amount === PRICE.toString(),
    )
  )
    return yield* failure('Finalized runtime events did not prove the expected local payment.');
  const ledgerRows = yield* persistLocalProof(settings.databaseUrl, receipt.transaction, proof);
  return { status: 'settled', amount: '$0.04', signature: receipt.transaction, ledgerRows };
});

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await Effect.runPromise(
    localPaymentDemo.pipe(
      Effect.tap((result) => Effect.sync(() => console.log(JSON.stringify(result)))),
      Effect.catch((error) =>
        Effect.sync(() => {
          console.error(
            error instanceof LocalPaymentError
              ? error.message
              : 'Local payment demo failed. Check the paid API at http://127.0.0.1:4020/health and its logs before retrying.',
          );
          process.exitCode = 1;
        }),
      ),
    ),
  );
}
