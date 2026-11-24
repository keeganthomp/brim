import { address, getAddressDecoder, isOffCurveAddress } from '@solana/kit';
import {
  NETWORKS,
  createBrimVaultConfig,
  decodeAgentPolicy,
  findTokenAccount,
  type OwnerPolicyLimits,
} from '@brim/sdk';
import { Effect } from 'effect';
import { deriveOwnerVault, ownerRouting } from './owner-wallet-context';
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

/** Existing vault validation, or a canonical missing vault for an explicitly selected owner. */
export function ownerContext(config: OwnerWalletConfig, selectedOwner?: string) {
  return Effect.gen(function* () {
    const routing = yield* ownerRouting(config);
    const mint = NETWORKS[routing.network].mint;
    if (!routing.fixed && !selectedOwner)
      return yield* ownerFailure(
        'OWNER_REQUIRED',
        'Connect an owner account before preparing its vault.',
      );
    const derived = selectedOwner
      ? yield* deriveOwnerVault(routing.programAddress, selectedOwner, mint)
      : undefined;
    const vaultAddress = routing.fixed ? routing.vaultAddress : derived![0];
    const { value } = yield* ownerRpc(
      (signal) =>
        routing.rpc
          .getAccountInfo(address(vaultAddress), { encoding: 'base64', commitment: 'confirmed' })
          .send({ abortSignal: signal }),
      'RPC_UNAVAILABLE',
      'Could not read the configured vault.',
    );
    if (!value && (!selectedOwner || (routing.fixed && derived![0] !== vaultAddress)))
      return yield* ownerFailure(
        'VAULT_MISSING',
        'The vault is not initialized. Use deployment configuration to create a vault for your owner account.',
      );
    const decoded = value
      ? yield* ownerAttempt(
          () => {
            if (value.owner !== routing.programAddress || value.executable) throw new Error();
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
        )
      : undefined;
    const ownerAddress = decoded?.ownerAddress ?? selectedOwner!;
    const [expected, bump] = yield* deriveOwnerVault(routing.programAddress, ownerAddress, mint);
    const vaultTokenAccount = yield* ownerIo(
      () => findTokenAccount(vaultAddress, mint),
      'INVALID_CONFIG',
      'Vault token account validation failed.',
    );
    if (
      expected !== vaultAddress ||
      (selectedOwner && selectedOwner !== ownerAddress) ||
      (decoded &&
        (decoded.data[109] !== bump ||
          decoded.mint !== mint ||
          decoded.tokenAccount !== vaultTokenAccount))
    )
      return yield* ownerFailure(
        'INVALID_CONFIG',
        'The vault address, owner, or USDC account does not match its configuration.',
      );
    if (isOffCurveAddress(address(ownerAddress)))
      return yield* ownerFailure(
        'OWNER_UNSUPPORTED',
        'This vault requires a program-wallet flow. Connect a single-key owner vault.',
      );
    const vaultConfig = createBrimVaultConfig({
      programAddress: routing.programAddress,
      network: routing.network,
      vaultAddress,
      facilitatorFeePayers: routing.facilitatorFeePayers,
    });
    return {
      ...routing,
      vaultAddress,
      vaultTokenAccount,
      ownerAddress,
      vaultConfig,
      initialized: Boolean(decoded),
      isPaused: decoded?.data[108] === 1,
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
