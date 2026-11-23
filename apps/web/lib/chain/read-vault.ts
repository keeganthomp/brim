import {
  address,
  createSolanaRpc,
  getAddressDecoder,
  getAddressEncoder,
  getBase64Encoder,
  getBase64Decoder,
  getProgramDerivedAddress,
  type Base64EncodedBytes,
} from '@solana/kit';
import { decodeAgentPolicy, findTokenAccount } from '@brim/sdk';
import { Data, Effect } from 'effect';
export const POLICY_ACCOUNT_BYTES = 135 + 16 * 32;
export const MAX_LOCAL_AGENTS = 100;
const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const VAULT_DISCRIMINATOR = new Uint8Array([211, 8, 232, 43, 2, 152, 117, 119]);
const POLICY_DISCRIMINATOR = new Uint8Array([148, 193, 218, 129, 21, 96, 195, 77]);
export interface ReadVaultConfig {
  rpcUrl: string;
  programAddress: string;
  vaultAddress: string;
  mint: string;
  /** SDK's 32-character network prefix, or a full hash for an exact match. */
  genesisHash: string;
  seededAgentAddress?: string;
}
export class VaultReadError extends Data.TaggedError('VaultReadError')<{
  code: 'VAULT_READ_UNAVAILABLE';
}> {}
const unavailable = () => new VaultReadError({ code: 'VAULT_READ_UNAVAILABLE' });
const loopback = (host: string) => ['localhost', '127.0.0.1', '[::1]'].includes(host);
const io = <A>(read: (signal: AbortSignal) => Promise<A>) =>
  Effect.tryPromise({ try: read, catch: unavailable });
const attempt = <A>(read: () => A) => Effect.try({ try: read, catch: unavailable });
const decoder = getAddressDecoder();
const encoder = getAddressEncoder();
const sameBytes = (left: Uint8Array, right: Uint8Array) =>
  left.length === right.length && left.every((byte, index) => byte === right[index]);
const decoded = (data: string) => Uint8Array.from(getBase64Encoder().encode(data));
const view = (data: Uint8Array) => new DataView(data.buffer, data.byteOffset, data.byteLength);
const readAddress = (data: Uint8Array, offset: number) =>
  decoder.decode(data.subarray(offset, offset + 32));
const encoded = (data: ArrayLike<number>) =>
  getBase64Decoder().decode(Uint8Array.from(data)) as Base64EncodedBytes;

const memcmp = (offset: bigint, bytes: ArrayLike<number>) => ({
  memcmp: { offset, encoding: 'base64' as const, bytes: encoded(bytes) },
});

const derivePda = (
  config: ReadVaultConfig,
  kind: 'agent' | 'vault',
  keys: readonly [string, string],
) =>
  io(() =>
    getProgramDerivedAddress({
      programAddress: address(config.programAddress),
      seeds: [new TextEncoder().encode(kind), ...keys.map((key) => encoder.encode(address(key)))],
    }),
  );

function readPolicies(
  rpc: ReturnType<typeof createSolanaRpc>,
  metadata: ReadVaultConfig,
  minContextSlot: bigint,
) {
  return Effect.gen(function* () {
    const { value: accounts } = yield* io((signal) =>
      rpc
        .getProgramAccounts(address(metadata.programAddress), {
          encoding: 'base64',
          commitment: 'confirmed',
          withContext: true,
          minContextSlot,
          filters: [
            { dataSize: BigInt(POLICY_ACCOUNT_BYTES) },
            memcmp(0n, POLICY_DISCRIMINATOR),
            memcmp(8n, encoder.encode(address(metadata.vaultAddress))),
          ],
        })
        .send({ abortSignal: signal }),
    );
    if (
      accounts.length > MAX_LOCAL_AGENTS ||
      new Set(accounts.map((entry) => entry.pubkey)).size !== accounts.length
    )
      return yield* unavailable();
    const policies = yield* Effect.forEach(
      accounts,
      (entry) =>
        Effect.gen(function* () {
          const { policy, storedBump } = yield* attempt(() => {
            if (entry.account.owner !== metadata.programAddress || entry.account.executable)
              throw unavailable();
            const data = decoded(entry.account.data[0]);
            if (
              data.length !== POLICY_ACCOUNT_BYTES ||
              !sameBytes(data.subarray(0, 8), POLICY_DISCRIMINATOR)
            )
              throw unavailable();
            const policy = decodeAgentPolicy(data);
            if (
              policy.vault !== metadata.vaultAddress ||
              policy.maxPerTx <= 0n ||
              policy.windowLimit < policy.maxPerTx ||
              policy.windowDuration <= 0n ||
              policy.minTxInterval < 0n ||
              policy.minTxInterval > BigInt(Number.MAX_SAFE_INTEGER)
            )
              throw unavailable();
            return { policy, storedBump: data[134 + policy.allowlist.length * 32] };
          });
          const [expected, bump] = yield* derivePda(metadata, 'agent', [
            metadata.vaultAddress,
            policy.agentKey,
          ]);
          if (entry.pubkey !== expected || storedBump !== bump) return yield* unavailable();
          return { ...policy, policyAddress: entry.pubkey };
        }),
      { concurrency: 8 },
    );
    return policies.sort((left, right) =>
      left.agentKey === right.agentKey
        ? 0
        : left.agentKey === metadata.seededAgentAddress
          ? -1
          : right.agentKey === metadata.seededAgentAddress
            ? 1
            : left.agentKey < right.agentKey
              ? -1
              : 1,
    );
  });
}

/** Browser-safe confirmed account reads with mint, network, owner, discriminator and canonical PDA checks. */
export const readVaultState = (metadata: ReadVaultConfig) =>
  Effect.gen(function* () {
    const url = yield* attempt(() => new URL(metadata.rpcUrl));
    if (
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback(url.hostname))) ||
      url.username ||
      url.password ||
      url.hash
    )
      return yield* unavailable();
    const rpc = createSolanaRpc(metadata.rpcUrl);
    const genesisHash = yield* io((signal) => rpc.getGenesisHash().send({ abortSignal: signal }));
    if (
      !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(metadata.genesisHash) ||
      (metadata.genesisHash.length === 32
        ? genesisHash.slice(0, 32) !== metadata.genesisHash
        : genesisHash !== metadata.genesisHash)
    )
      return yield* unavailable();
    const ata = yield* io(() => findTokenAccount(metadata.vaultAddress, metadata.mint));
    const { context, value: accounts } = yield* io((signal) =>
      rpc
        .getMultipleAccounts(
          [
            address(metadata.vaultAddress),
            address('SysvarC1ock11111111111111111111111111111111'),
            address(ata),
          ],
          { encoding: 'base64', commitment: 'confirmed' },
        )
        .send({ abortSignal: signal }),
    );
    const state = yield* attempt(() => {
      const [vault, clock, token] = accounts;
      if (
        !vault ||
        !clock ||
        !token ||
        vault.owner !== metadata.programAddress ||
        token.owner !== TOKEN_PROGRAM ||
        vault.executable ||
        clock.executable ||
        token.executable
      )
        throw unavailable();
      const vaultData = decoded(vault.data[0]);
      const clockData = decoded(clock.data[0]);
      const tokenData = decoded(token.data[0]);
      if (
        vaultData.length < 110 ||
        clockData.length < 40 ||
        tokenData.length < 165 ||
        !sameBytes(vaultData.subarray(0, 8), VAULT_DISCRIMINATOR)
      )
        throw unavailable();
      if (
        readAddress(vaultData, 40) !== metadata.mint ||
        readAddress(vaultData, 72) !== ata ||
        readAddress(tokenData, 0) !== metadata.mint ||
        readAddress(tokenData, 32) !== metadata.vaultAddress ||
        vaultData[108]! > 1
      )
        throw unavailable();
      return {
        owner: readAddress(vaultData, 8),
        vaultBump: vaultData[109]!,
        isPaused: vaultData[108] === 1,
        chainTimestamp: view(clockData).getBigInt64(32, true).toString(),
        balanceBaseUnits: view(tokenData).getBigUint64(64, true).toString(),
      };
    });
    const [expectedVault, bump] = yield* derivePda(metadata, 'vault', [state.owner, metadata.mint]);
    if (expectedVault !== metadata.vaultAddress || bump !== state.vaultBump)
      return yield* unavailable();
    return { ...state, genesisHash, policies: yield* readPolicies(rpc, metadata, context.slot) };
  }).pipe(Effect.timeout(10_000), Effect.mapError(unavailable));

export type VaultState = import('effect').Effect.Success<ReturnType<typeof readVaultState>>;
export type RegisteredAgentPolicy = VaultState['policies'][number];
