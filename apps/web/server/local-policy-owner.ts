/** Generated fixture owner access. Never used by live-wallet routes. */
import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import {
  address,
  getAddressDecoder,
  getAddressEncoder,
  getProgramDerivedAddress,
} from '@solana/kit';
import { BRIM_DEVELOPMENT_PROGRAM_ADDRESS, BRIM_NETWORK_IDS, findTokenAccount } from '@brim/sdk';
import { Effect, Schema } from 'effect';
import { createLocalClient } from '../../../infra/local/surfpool/transactions';
import { DEVNET_GENESIS, MINT, TOKEN } from '../../../infra/local/surfpool/config';
import { localSignerEffect } from '../../../infra/local/surfpool/credentials';
import { PublicKey, policyFailure } from './local-policy-input';
import { isLoopback } from './local-schema';

export const policyAttempt = <A>(run: () => A) => Effect.try({ try: run, catch: policyFailure });
export const policyIo = <A>(run: () => PromiseLike<A>) =>
  Effect.tryPromise({ try: run, catch: policyFailure });
export const policyDecode = <S extends Schema.ConstraintDecoder<unknown>>(
  schema: S,
  value: unknown,
) => policyAttempt(() => Schema.decodeUnknownSync(schema)(value));
const OwnerFile = Schema.Struct({
  kind: Schema.Literal('brim-local-only-v1'),
  network: Schema.Literal(BRIM_NETWORK_IDS.devnet),
  programAddress: Schema.Literal(BRIM_DEVELOPMENT_PROGRAM_ADDRESS),
  rpcUrl: Schema.String,
  vaultAddress: PublicKey,
  ownerAddress: PublicKey,
  ownerKey: Schema.String,
});
export const LocalAccount = Schema.Struct({
  owner: Schema.String,
  executable: Schema.Boolean,
  data: Schema.Tuple([Schema.String, Schema.Literal('base64')]),
});
export const AccountResult = Schema.Struct({ value: Schema.NullOr(LocalAccount) });
const SurfnetInfo = Schema.Struct({
  value: Schema.Struct({ startup: Schema.Struct({ phase: Schema.Literal('ready') }) }),
});
const readOwnerFile = Effect.gen(function* () {
  const filename = process.env.BRIM_LOCAL_CONFIG;
  if (!filename || !isAbsolute(filename)) return yield* policyFailure();
  return yield* Effect.acquireUseRelease(
    policyIo(() => open(filename, constants.O_RDONLY | constants.O_NOFOLLOW)),
    (file) =>
      Effect.gen(function* () {
        const stat = yield* policyIo(() => file.stat());
        if (!stat.isFile() || stat.size > 65_536 || (stat.mode & 0o777) !== 0o600)
          return yield* policyFailure();
        const text = yield* policyIo(() => file.readFile('utf8'));
        if (Buffer.byteLength(text) > 65_536) return yield* policyFailure();
        return yield* policyDecode(Schema.fromJsonString(OwnerFile), text);
      }),
    (file) => Effect.promise(() => file.close()),
  );
});
const readKey = (bytes: Uint8Array, offset: number) =>
  getAddressDecoder().decode(bytes.subarray(offset, offset + 32));

export const localFixtureVault = Effect.gen(function* () {
  if (process.env.NODE_ENV !== 'development') return yield* policyFailure();
  const config = yield* readOwnerFile;
  yield* policyAttempt(() => {
    const url = new URL(config.rpcUrl);
    if (
      url.protocol !== 'http:' ||
      !isLoopback(url.hostname) ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    )
      throw policyFailure();
  });
  const client = createLocalClient(config.rpcUrl);
  if ((yield* client.rpcEffect('getGenesisHash')) !== DEVNET_GENESIS) return yield* policyFailure();
  yield* policyDecode(SurfnetInfo, yield* client.rpcEffect('surfnet_getSurfnetInfo'));
  const accounts = yield* policyDecode(
    Schema.Struct({ value: Schema.Array(Schema.NullOr(LocalAccount)) }),
    yield* client.rpcEffect('getMultipleAccounts', [
      [config.vaultAddress, MINT, config.programAddress],
      { encoding: 'base64', commitment: 'confirmed' },
    ]),
  );
  const [vault, mint, program] = accounts.value;
  const bytes = yield* policyAttempt(() => {
    if (
      !vault ||
      !mint ||
      !program ||
      vault.owner !== config.programAddress ||
      mint.owner !== TOKEN ||
      !program.executable ||
      vault.executable ||
      mint.executable
    )
      throw policyFailure();
    const v = Buffer.from(vault.data[0], 'base64');
    const m = Buffer.from(mint.data[0], 'base64');
    if (
      v.length < 110 ||
      m.length !== 82 ||
      !v
        .subarray(0, 8)
        .equals(createHash('sha256').update('account:Vault').digest().subarray(0, 8)) ||
      readKey(v, 8) !== config.ownerAddress ||
      readKey(v, 40) !== MINT
    )
      throw policyFailure();
    // A real devnet USDC mint does not have this openly documented fixture authority.
    if (
      m.readUInt32LE(0) !== 1 ||
      readKey(m, 4) !== 'GmaDrppBC7P5ARKV8g3djiwP89vz1jLK23V2GBjuAEGB' ||
      m[44] !== 6 ||
      m[45] !== 1
    )
      throw policyFailure();
    return v;
  });
  const encoder = getAddressEncoder();
  const [expected, bump] = yield* policyIo(() =>
    getProgramDerivedAddress({
      programAddress: address(config.programAddress),
      seeds: [
        new TextEncoder().encode('vault'),
        encoder.encode(address(config.ownerAddress)),
        encoder.encode(MINT),
      ],
    }),
  );
  const tokenAccount = yield* policyIo(() => findTokenAccount(config.vaultAddress, MINT));
  if (
    expected !== config.vaultAddress ||
    bytes[109] !== bump ||
    readKey(bytes, 72) !== tokenAccount
  )
    return yield* policyFailure();
  return { config, client };
}).pipe(Effect.timeout(10_000), Effect.mapError(policyFailure));

export const localPolicyOwner = Effect.gen(function* () {
  const { config, client } = yield* localFixtureVault;
  const owner = yield* localSignerEffect(config.ownerKey).pipe(Effect.mapError(policyFailure));
  if (owner.address !== config.ownerAddress) return yield* policyFailure();
  return { config, client, owner };
});
