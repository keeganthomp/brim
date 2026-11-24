import { address, createSolanaRpc, getAddressEncoder, getProgramDerivedAddress } from '@solana/kit';
import {
  BRIM_NETWORK_IDS,
  NETWORKS,
  createBrimVaultConfig,
  readBrimVaultConfig,
  resolveBrimRpcUrl,
} from '@brim/sdk';
import { Effect } from 'effect';
import {
  ownerAttempt,
  ownerFailure,
  ownerIo,
  ownerRpc,
  type OwnerWalletConfig,
} from './owner-wallet-types';

/** Validate operator-owned routing independently of an existing vault or wallet. */
export function ownerRouting(config: OwnerWalletConfig) {
  return Effect.gen(function* () {
    const details = yield* ownerAttempt(
      () => {
        if ('vaultConfig' in config)
          return { ...readBrimVaultConfig(config.vaultConfig), fixed: true };
        const validated = readBrimVaultConfig(
          createBrimVaultConfig({
            programAddress: config.programAddress,
            network: config.network,
            // This temporary address validates metadata only; selected-owner derivation follows.
            vaultAddress: config.programAddress,
            facilitatorFeePayers: [...config.facilitatorFeePayers],
          }),
        );
        return { ...validated, fixed: false };
      },
      'INVALID_CONFIG',
      'Use valid public deployment or vault configuration.',
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
        'The RPC network does not match the deployment configuration.',
      );
    return {
      ...details,
      rpc,
      rpcUrl,
      chain:
        details.network === BRIM_NETWORK_IDS.devnet
          ? ('solana:devnet' as const)
          : ('solana:mainnet' as const),
    };
  });
}
export type OwnerRouting = Effect.Success<ReturnType<typeof ownerRouting>>;
export function deriveOwnerVault(
  programAddress: string,
  ownerAddress: string,
  mintAddress: string,
) {
  const encoder = getAddressEncoder();
  return ownerIo(
    () =>
      getProgramDerivedAddress({
        programAddress: address(programAddress),
        seeds: [
          new TextEncoder().encode('vault'),
          encoder.encode(address(ownerAddress)),
          encoder.encode(address(mintAddress)),
        ],
      }),
    'INVALID_CONFIG',
    'Could not derive the owner vault address.',
  );
}
