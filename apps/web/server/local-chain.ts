import { createHash } from 'node:crypto';
import {
  address,
  createSolanaRpc,
  getAddressDecoder,
  getAddressEncoder,
  getProgramDerivedAddress,
} from '@solana/kit';
import { decodeAgentPolicy, findBrimPolicyAddress, findTokenAccount } from '@brim/sdk';
import { Effect } from 'effect';
import {
  DEVNET_GENESIS,
  LOCAL_USDC_MINT,
  TOKEN_PROGRAM,
  isLoopback,
  localFailure,
  type LocalMetadata,
} from './local-schema';

const io = <A>(read: (signal: AbortSignal) => Promise<A>) =>
  Effect.tryPromise({ try: read, catch: localFailure });
const attempt = <A>(read: () => A) => Effect.try({ try: read, catch: localFailure });
const decoder = getAddressDecoder();
const discriminator = (name: string) =>
  createHash('sha256').update(`account:${name}`).digest().subarray(0, 8);
const integer = (bytes: Uint8Array, offset: number, signed = false) =>
  signed ? Buffer.from(bytes).readBigInt64LE(offset) : Buffer.from(bytes).readBigUInt64LE(offset);
const readAddress = (bytes: Uint8Array, offset: number) =>
  decoder.decode(bytes.subarray(offset, offset + 32));

/** Read-only RPC access. No signer, key creation, or transaction submission enters this module. */
export const readLocalChain = (metadata: LocalMetadata) =>
  Effect.gen(function* () {
    const url = yield* attempt(() => new URL(metadata.rpcUrl));
    if (
      url.protocol !== 'http:' ||
      !isLoopback(url.hostname) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      return yield* localFailure();
    const rpc = createSolanaRpc(metadata.rpcUrl);
    const genesis = yield* io((signal) => rpc.getGenesisHash().send({ abortSignal: signal }));
    if (genesis !== DEVNET_GENESIS) return yield* localFailure();
    const policyAddress = yield* io(() =>
      findBrimPolicyAddress(metadata.programAddress, metadata.vaultAddress, metadata.agentAddress),
    );
    const ata = yield* io(() => findTokenAccount(metadata.vaultAddress, LOCAL_USDC_MINT));
    const { value: accounts } = yield* io((signal) =>
      rpc
        .getMultipleAccounts(
          [
            address(metadata.vaultAddress),
            address(policyAddress),
            address('SysvarC1ock11111111111111111111111111111111'),
            address(ata),
          ],
          { encoding: 'base64', commitment: 'confirmed' },
        )
        .send({ abortSignal: signal }),
    );
    const state = yield* attempt(() => {
      const [vault, policy, clock, token] = accounts;
      if (
        !vault ||
        !policy ||
        !clock ||
        !token ||
        vault.owner !== metadata.programAddress ||
        policy.owner !== metadata.programAddress ||
        token.owner !== TOKEN_PROGRAM ||
        vault.executable ||
        policy.executable
      )
        throw localFailure();
      const vaultData = Buffer.from(vault.data[0], 'base64');
      const policyData = Buffer.from(policy.data[0], 'base64');
      const clockData = Buffer.from(clock.data[0], 'base64');
      const tokenData = Buffer.from(token.data[0], 'base64');
      if (
        vaultData.length < 110 ||
        policyData.length < 135 ||
        clockData.length < 40 ||
        tokenData.length < 165 ||
        !vaultData.subarray(0, 8).equals(discriminator('Vault')) ||
        !policyData.subarray(0, 8).equals(discriminator('AgentPolicy'))
      )
        throw localFailure();
      const decoded = decodeAgentPolicy(policyData);
      if (
        decoded.vault !== metadata.vaultAddress ||
        decoded.agentKey !== metadata.agentAddress ||
        readAddress(vaultData, 40) !== LOCAL_USDC_MINT ||
        readAddress(vaultData, 72) !== ata ||
        readAddress(tokenData, 0) !== LOCAL_USDC_MINT ||
        readAddress(tokenData, 32) !== metadata.vaultAddress ||
        vaultData[108]! > 1 ||
        decoded.minTxInterval < 0n ||
        decoded.minTxInterval > BigInt(Number.MAX_SAFE_INTEGER)
      )
        throw localFailure();
      return {
        policy: decoded,
        owner: readAddress(vaultData, 8),
        vaultBump: vaultData[109]!,
        isPaused: vaultData[108] === 1,
        chainTimestamp: integer(clockData, 32, true).toString(),
        balanceBaseUnits: integer(tokenData, 64).toString(),
      };
    });
    const encoder = getAddressEncoder();
    const [expectedVault, bump] = yield* io(() =>
      getProgramDerivedAddress({
        programAddress: address(metadata.programAddress),
        seeds: [
          new TextEncoder().encode('vault'),
          encoder.encode(address(state.owner)),
          encoder.encode(address(LOCAL_USDC_MINT)),
        ],
      }),
    );
    if (expectedVault !== metadata.vaultAddress || bump !== state.vaultBump)
      return yield* localFailure();
    return state;
  }).pipe(Effect.timeout(10_000), Effect.mapError(localFailure));
