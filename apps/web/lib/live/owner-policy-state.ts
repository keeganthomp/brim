import {
  address,
  createSolanaRpc,
  getAddressDecoder,
  getAddressEncoder,
  getProgramDerivedAddress,
  isOffCurveAddress,
} from '@solana/kit';
import {
  BRIM_NETWORK_IDS,
  NETWORKS,
  decodeAgentPolicy,
  findTokenAccount,
  readBrimVaultConfig,
  resolveBrimRpcUrl,
  type OwnerPolicyLimits,
} from '@brim/sdk';
import { Effect } from 'effect';
import {
  ownerAttempt,
  ownerFailure,
  ownerIo,
  ownerRpc,
  type OwnerWalletConfig,
} from './owner-wallet-types';

const VAULT_DISCRIMINATOR = new Uint8Array([211, 8, 232, 43, 2, 152, 117, 119]);
const bytes = (value: readonly [string, string]) =>
  Uint8Array.from(atob(value[0]), (char) => char.charCodeAt(0));
const same = <T>(a: ArrayLike<T>, b: ArrayLike<T>) =>
  a.length === b.length && Array.from(a).every((value, index) => value === b[index]);
export function ownerContext(config: OwnerWalletConfig) {
  return Effect.gen(function* () {
    const details = yield* ownerAttempt(
      () => readBrimVaultConfig(config.vaultConfig),
      'INVALID_CONFIG',
      'Use valid public vault configuration.',
    );
    const rpcUrl = yield* ownerAttempt(
      () => resolveBrimRpcUrl(details.network, config.rpcUrl),
      'INVALID_CONFIG',
      'Use a valid Solana RPC connection.',
    );
    const rpc = createSolanaRpc(rpcUrl);
    const genesis = yield* ownerRpc(
      (signal) => rpc.getGenesisHash().send({ abortSignal: signal }),
      'RPC_UNAVAILABLE',
      'Could not read the configured Solana network.',
    );
    if (genesis.slice(0, 32) !== NETWORKS[details.network].genesisHash)
      return yield* ownerFailure(
        'INVALID_CONFIG',
        'The RPC network does not match the vault configuration.',
      );
    const { value } = yield* ownerRpc(
      (signal) =>
        rpc
          .getAccountInfo(address(details.vaultAddress), {
            encoding: 'base64',
            commitment: 'confirmed',
          })
          .send({ abortSignal: signal }),
      'RPC_UNAVAILABLE',
      'Could not read the configured vault.',
    );
    if (!value || value.owner !== details.programAddress || value.executable)
      return yield* ownerFailure(
        'INVALID_CONFIG',
        'The configured vault is unavailable. Initialize it before adding policies.',
      );
    const decoded = yield* ownerAttempt(
      () => {
        const data = bytes(value.data);
        if (
          data.length !== 110 ||
          !same(data.subarray(0, 8), VAULT_DISCRIMINATOR) ||
          data[108]! > 1
        )
          throw new Error();
        const decoder = getAddressDecoder();
        return {
          data,
          ownerAddress: decoder.decode(data.subarray(8, 40)),
          mint: decoder.decode(data.subarray(40, 72)),
          tokenAccount: decoder.decode(data.subarray(72, 104)),
        };
      },
      'INVALID_CONFIG',
      'The configured account is not a supported Brim vault.',
    );
    const encoder = getAddressEncoder();
    const [expected, bump] = yield* ownerIo(
      () =>
        getProgramDerivedAddress({
          programAddress: address(details.programAddress),
          seeds: [
            new TextEncoder().encode('vault'),
            encoder.encode(decoded.ownerAddress),
            encoder.encode(decoded.mint),
          ],
        }),
      'INVALID_CONFIG',
      'Vault address validation failed.',
    );
    const expectedAta = yield* ownerIo(
      () => findTokenAccount(details.vaultAddress, decoded.mint),
      'INVALID_CONFIG',
      'Vault token account validation failed.',
    );
    if (
      expected !== details.vaultAddress ||
      decoded.data[109] !== bump ||
      decoded.mint !== NETWORKS[details.network].mint ||
      decoded.tokenAccount !== expectedAta
    )
      return yield* ownerFailure(
        'INVALID_CONFIG',
        'The vault address or USDC account does not match its configuration.',
      );
    if (isOffCurveAddress(decoded.ownerAddress))
      return yield* ownerFailure(
        'OWNER_UNSUPPORTED',
        'This vault requires a program-wallet flow. Connect a single-key owner vault.',
      );
    return {
      ...details,
      ownerAddress: decoded.ownerAddress,
      rpc,
      chain:
        details.network === BRIM_NETWORK_IDS.devnet
          ? ('solana:devnet' as const)
          : ('solana:mainnet' as const),
    };
  });
}
export type OwnerContext = Effect.Success<ReturnType<typeof ownerContext>>;
export function readOwnerPolicy(
  context: OwnerContext,
  policyAddress: string,
  uncertainSignature?: string,
) {
  return Effect.gen(function* () {
    const { value } = yield* ownerRpc(
      (signal) =>
        context.rpc
          .getAccountInfo(address(policyAddress), { encoding: 'base64', commitment: 'confirmed' })
          .send({ abortSignal: signal }),
      uncertainSignature ? 'POLICY_OUTCOME_UNKNOWN' : 'RPC_UNAVAILABLE',
      uncertainSignature
        ? 'Policy outcome is uncertain. Reconcile the transaction before another write.'
        : 'Could not read the agent policy.',
      uncertainSignature,
    );
    if (!value) return null;
    if (value.owner !== context.programAddress || value.executable)
      return yield* ownerFailure(
        'INVALID_POLICY',
        'The policy account is owned by another program.',
        uncertainSignature,
      );
    return yield* ownerAttempt(
      () => decodeAgentPolicy(bytes(value.data)),
      'INVALID_POLICY',
      'The policy account is invalid.',
    );
  });
}
export function policyMatches(
  value: NonNullable<Effect.Success<ReturnType<typeof readOwnerPolicy>>>,
  agentKey: string,
  context: OwnerContext,
  limits: OwnerPolicyLimits,
) {
  return (
    value.agentKey === agentKey &&
    value.vault === context.vaultAddress &&
    value.maxPerTx === limits.maxPerTx &&
    value.windowLimit === limits.windowLimit &&
    value.windowDuration === limits.windowDuration &&
    value.minTxInterval === limits.minTxInterval &&
    value.allowlistEnabled === limits.allowlistEnabled &&
    same(value.allowlist, limits.allowlist)
  );
}
