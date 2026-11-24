/** Shared local-only configuration. Fake keys never leave the offline Surfpool stack. */
import { Effect } from 'effect';
import { DEVNET_GENESIS, localRpcEffect } from '../surfpool/config.ts';
import { LocalSurfpoolError } from '../surfpool/effects.ts';
import {
  localSignerEffect,
  localVaultConfig,
  readCredentialsEffect,
} from '../surfpool/credentials.ts';

export const RESOURCE_URL = 'http://127.0.0.1:4020/report';
export const PAYMENT_AMOUNT = 40_000n;

export function readLocalContext(filename: string, rpcOverride?: string) {
  return Effect.gen(function* () {
    const config = yield* readCredentialsEffect(filename);
    if (!config)
      return yield* new LocalSurfpoolError({
        message: 'Run npm run dev first to create the local Brim vault.',
      });
    const rpcUrl = rpcOverride ?? config.rpcUrl;
    const url = yield* Effect.try({
      try: () => new URL(rpcUrl),
      catch: () =>
        new LocalSurfpoolError({ message: 'Local payments require a loopback Surfpool RPC URL.' }),
    });
    if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
      return yield* new LocalSurfpoolError({
        message: 'Local payments require a loopback Surfpool RPC URL.',
      });
    }
    if ((yield* localRpcEffect(rpcUrl, 'getGenesisHash')) !== DEVNET_GENESIS) {
      return yield* new LocalSurfpoolError({
        message: 'Local Surfpool genesis does not match the configured devnet simulation.',
      });
    }
    const facilitatorSigner = yield* localSignerEffect(config.facilitatorKey);
    if (
      facilitatorSigner.address !== config.facilitatorAddress ||
      config.vaultConfig !== localVaultConfig(config.vaultAddress, facilitatorSigner.address)
    ) {
      return yield* new LocalSurfpoolError({
        message: 'Local vault config is inconsistent. Check the local stack configuration.',
      });
    }
    return { ...config, rpcUrl, facilitatorSigner };
  });
}
export type LocalContext = Effect.Success<ReturnType<typeof readLocalContext>>;
