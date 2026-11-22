/** Idempotent local-only vault setup. Existing policies and balances are retained. */
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { address, getAddressEncoder } from '@solana/kit';
import { Effect, Schema } from 'effect';
import { MINT, PROGRAM, TOKEN, localRpcEffect } from './config.ts';
import { decode, fromPromise, run } from './effects.ts';
import {
  NETWORK,
  localSignerEffect,
  newIdentityEffect,
  publicCard,
  readCredentialsEffect,
  saveCredentialsEffect,
  type LocalConfig,
} from './credentials.ts';
import { seedSurfpoolEffect, type SeedOptions } from './seed.ts';
import {
  ATA,
  SYSTEM,
  createAta,
  createLocalClient,
  i64,
  ix,
  pda,
  readonly,
  signer,
  tokenAccount,
  u32,
  u64,
  writable,
  writableSigner,
} from './transactions.ts';

export interface BootstrapOptions extends SeedOptions {
  credentialsPath?: string | undefined;
}
const Presence = Schema.Struct({ value: Schema.NullOr(Schema.Struct({ owner: Schema.String })) });
const Balance = Schema.Struct({ value: Schema.Number });
export function bootstrapLocalEffect({
  rpcUrl = 'http://127.0.0.1:8899',
  credentialsPath = path.resolve('.brim/local.json'),
  programPath,
}: BootstrapOptions = {}) {
  return Effect.gen(function* () {
    yield* seedSurfpoolEffect({ rpcUrl, programPath });
    const existing = yield* readCredentialsEffect(credentialsPath);
    const ownerIdentity = existing ? null : yield* newIdentityEffect();
    const agentIdentity = existing ? null : yield* newIdentityEffect();
    const facilitatorIdentity = existing ? null : yield* newIdentityEffect();
    const merchantIdentity = existing ? null : yield* newIdentityEffect();
    const owner = existing ? yield* localSignerEffect(existing.ownerKey) : ownerIdentity!.signer;
    const agent = existing ? yield* localSignerEffect(existing.agentKey) : agentIdentity!.signer;
    const facilitator = existing
      ? yield* localSignerEffect(existing.facilitatorKey)
      : facilitatorIdentity!.signer;
    const merchant = existing
      ? address(existing.merchantAddress)
      : merchantIdentity!.signer.address;
    const encoder = getAddressEncoder();
    const vault = yield* fromPromise(
      () =>
        pda(PROGRAM, [
          new TextEncoder().encode('vault'),
          encoder.encode(owner.address),
          encoder.encode(MINT),
        ]),
      'Cannot derive a local vault.',
    );
    const config: LocalConfig = existing
      ? { ...existing, rpcUrl }
      : {
          kind: 'brim-local-only-v1',
          rpcUrl,
          network: NETWORK,
          programAddress: PROGRAM,
          vaultAddress: vault,
          ownerAddress: owner.address,
          agentAddress: agent.address,
          merchantAddress: merchant,
          facilitatorAddress: facilitator.address,
          ownerKey: ownerIdentity!.key,
          agentKey: agentIdentity!.key,
          facilitatorKey: facilitatorIdentity!.key,
          card: publicCard(vault, facilitator.address),
        };
    // Persist before sending so a partial startup can resume using the same keys.
    yield* saveCredentialsEffect(credentialsPath, config);
    const client = createLocalClient(rpcUrl);
    for (const account of [owner, agent, facilitator]) {
      const balance = yield* decode(
        Balance,
        yield* localRpcEffect(rpcUrl, 'getBalance', [account.address]),
      );
      if (balance.value === 0) {
        const signature = yield* decode(
          Schema.String,
          yield* localRpcEffect(rpcUrl, 'requestAirdrop', [account.address, 10_000_000_000]),
        );
        yield* client.confirmEffect(signature);
      }
    }
    const vaultState = yield* decode(
      Presence,
      yield* localRpcEffect(rpcUrl, 'getAccountInfo', [vault]),
    );
    const vaultAta = yield* fromPromise(
      () => tokenAccount(vault),
      'Cannot derive a local token account.',
    );
    if (!vaultState.value) {
      yield* client.sendEffect(owner, [
        ix('init_vault', [
          writableSigner(owner),
          signer(owner),
          readonly(MINT),
          writable(vault),
          writable(vaultAta),
          readonly(TOKEN),
          readonly(ATA),
          readonly(SYSTEM),
        ]),
      ]);
    }
    const policy = yield* fromPromise(
      () =>
        pda(PROGRAM, [
          new TextEncoder().encode('agent'),
          encoder.encode(vault),
          encoder.encode(agent.address),
        ]),
      'Cannot derive a local policy.',
    );
    const policyState = yield* decode(
      Presence,
      yield* localRpcEffect(rpcUrl, 'getAccountInfo', [policy]),
    );
    if (!policyState.value) {
      const limits = Buffer.concat([
        u64(1_000_000),
        u64(50_000_000),
        i64(86_400),
        i64(0),
        Buffer.from([1]),
        u32(1),
        Buffer.from(encoder.encode(merchant)),
      ]);
      yield* client.sendEffect(owner, [
        ix(
          'upsert_agent_policy',
          [
            writableSigner(owner),
            signer(owner),
            writable(vault),
            writable(policy),
            readonly(SYSTEM),
          ],
          Buffer.from(encoder.encode(agent.address)),
          limits,
        ),
      ]);
    }
    const merchantAta = yield* fromPromise(
      () => tokenAccount(merchant),
      'Cannot derive the merchant token account.',
    );
    yield* client.sendEffect(owner, [createAta(owner, merchant, merchantAta)]);
    // Only the initial creation gets fixture funds; ordinary restarts never top up the vault.
    if (!vaultState.value)
      yield* localRpcEffect(rpcUrl, 'surfnet_setTokenAccount', [
        vault,
        MINT,
        { amount: 100_000_000, state: 'initialized' },
        TOKEN,
      ]);
    return config;
  });
}
export const bootstrapLocal = (options: BootstrapOptions = {}) =>
  run(bootstrapLocalEffect(options));
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await bootstrapLocal({
    rpcUrl: process.env.BRIM_RPC_URL,
    credentialsPath: process.env.BRIM_LOCAL_CONFIG,
    programPath: process.env.BRIM_PROGRAM_PATH,
  });
  console.log('Local Brim vault ready. Scoped credentials saved with mode 0600; no keys printed.');
}
