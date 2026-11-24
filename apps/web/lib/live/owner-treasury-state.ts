import { address, getAddressDecoder } from '@solana/kit';
import { NETWORKS, findTokenAccount } from '@brim/sdk';
import { Effect } from 'effect';
import { ownerContext, type OwnerContext } from './owner-policy-state';
import { assertOwnerConnection } from './owner-signing';
import {
  ownerAttempt,
  ownerFailure,
  ownerIo,
  ownerRpc,
  type OwnerWalletConfig,
  type OwnerWalletConnection,
} from './owner-wallet-types';

/** Read only the canonical legacy USDC account. Missing wallet ATAs have a zero balance. */
export function ownerTokenBalance(context: OwnerContext, authority: string) {
  return Effect.gen(function* () {
    const mint = NETWORKS[context.network].mint;
    const tokenAddress = yield* ownerIo(
      () => findTokenAccount(authority, mint),
      'INVALID_ACCOUNT',
      'Could not derive the USDC account.',
    );
    const { value } = yield* ownerRpc(
      (signal) =>
        context.rpc
          .getAccountInfo(address(tokenAddress), { encoding: 'base64', commitment: 'confirmed' })
          .send({ abortSignal: signal }),
      'RPC_UNAVAILABLE',
      'Could not read the USDC account.',
    );
    if (!value) return 0n;
    return yield* ownerAttempt(
      () => {
        const bytes = Uint8Array.from(atob(value.data[0]), (char) => char.charCodeAt(0));
        const decoder = getAddressDecoder();
        if (
          value.owner !== 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' ||
          value.executable ||
          bytes.length !== 165 ||
          decoder.decode(bytes.subarray(0, 32)) !== mint ||
          decoder.decode(bytes.subarray(32, 64)) !== authority ||
          bytes[108] !== 1
        )
          throw new Error();
        return new DataView(bytes.buffer).getBigUint64(64, true);
      },
      'INVALID_ACCOUNT',
      'The USDC account is unavailable or frozen.',
    );
  });
}

export function readOwnerWalletReadiness(
  connection: OwnerWalletConnection,
  config: OwnerWalletConfig,
) {
  return Effect.gen(function* () {
    const context = yield* ownerContext(config, connection.ownerAddress);
    yield* assertOwnerConnection(connection, context);
    const sol = yield* ownerRpc(
      (signal) =>
        context.rpc
          .getBalance(address(context.ownerAddress), { commitment: 'confirmed' })
          .send({ abortSignal: signal }),
      'RPC_UNAVAILABLE',
      'Could not read the wallet SOL balance.',
    );
    const usdcBalance = yield* ownerTokenBalance(context, context.ownerAddress);
    return {
      vaultConfig: context.vaultConfig,
      vaultAddress: context.vaultAddress,
      initialized: context.initialized,
      solBalance: sol.value,
      usdcBalance,
    };
  });
}

export function initializedOwnerContext(
  connection: OwnerWalletConnection,
  config: OwnerWalletConfig,
) {
  return Effect.gen(function* () {
    const context = yield* ownerContext(config, connection.ownerAddress);
    yield* assertOwnerConnection(connection, context);
    if (!context.initialized)
      return yield* ownerFailure(
        'VAULT_MISSING',
        'Create your vault before funding or managing agents.',
      );
    return context;
  });
}

export const treasuryResult = (context: OwnerContext, signature: string) => ({
  signature,
  vaultAddress: context.vaultAddress,
  vaultConfig: context.vaultConfig,
});
