/** Shared local-only configuration. Fake keys never leave the offline Surfpool stack. */
import path from 'node:path';
import { Effect } from 'effect';
import { configuration, LocalSetupError } from '../../../scripts/local/config.ts';
import { DEVNET_GENESIS, localRpcEffect } from '../surfpool/config.ts';
import {
  localSignerEffect,
  localVaultConfig,
  readCredentialsEffect,
} from '../surfpool/credentials.ts';

export const RESOURCE_URL = 'http://127.0.0.1:4020/report';
export const PAYMENT_AMOUNT = 40_000n;

export const loadLocalContext = Effect.gen(function* () {
  const defaults = yield* configuration;
  const filename = path.resolve(process.env.BRIM_LOCAL_CONFIG ?? defaults.file);
  const config = yield* readCredentialsEffect(filename);
  if (!config)
    return yield* new LocalSetupError({
      message: 'Run npm run dev first to create the local Brim vault.',
    });
  const rpcUrl = process.env.BRIM_RPC_URL ?? config.rpcUrl;
  const url = yield* Effect.try({
    try: () => new URL(rpcUrl),
    catch: () =>
      new LocalSetupError({ message: 'Local payments require a loopback Surfpool RPC URL.' }),
  });
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
    return yield* new LocalSetupError({
      message: 'Local payments require a loopback Surfpool RPC URL.',
    });
  }
  if ((yield* localRpcEffect(rpcUrl, 'getGenesisHash')) !== DEVNET_GENESIS) {
    return yield* new LocalSetupError({
      message: 'Local Surfpool genesis does not match the configured devnet simulation.',
    });
  }
  const facilitatorSigner = yield* localSignerEffect(config.facilitatorKey);
  if (
    facilitatorSigner.address !== config.facilitatorAddress ||
    config.vaultConfig !== localVaultConfig(config.vaultAddress, facilitatorSigner.address)
  ) {
    return yield* new LocalSetupError({
      message: 'Local vault config is inconsistent. Check the local stack configuration.',
    });
  }
  return { ...config, rpcUrl, facilitatorSigner };
});
export type LocalContext = Effect.Success<typeof loadLocalContext>;
