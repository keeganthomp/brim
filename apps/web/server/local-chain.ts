import { Effect } from 'effect';
import { readVaultState } from '../lib/chain/read-vault';
import {
  DEVNET_GENESIS,
  LOCAL_USDC_MINT,
  isLoopback,
  localFailure,
  type LocalMetadata,
} from './local-schema';

/** Local mode stays pinned to loopback and the complete offline-devnet genesis hash. */
export const readLocalChain = (metadata: LocalMetadata) =>
  Effect.gen(function* () {
    const url = yield* Effect.try({ try: () => new URL(metadata.rpcUrl), catch: localFailure });
    if (
      url.protocol !== 'http:' ||
      !isLoopback(url.hostname) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      return yield* localFailure();
    return yield* readVaultState({
      rpcUrl: metadata.rpcUrl,
      programAddress: metadata.programAddress,
      vaultAddress: metadata.vaultAddress,
      mint: LOCAL_USDC_MINT,
      genesisHash: DEVNET_GENESIS,
      seededAgentAddress: metadata.agentAddress,
    });
  }).pipe(Effect.mapError(localFailure));
