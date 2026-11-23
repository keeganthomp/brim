import { NETWORKS, readBrimVaultConfig, resolveBrimRpcUrl } from '@brim/sdk';
import { Effect, Schema } from 'effect';
import { readVaultState } from '../chain/read-vault';
import { toWorkspaceAgents } from '../chain/workspace-agents';
import { adaptLocalWorkspace } from '../local/adapter';
import { LocalWorkspaceSchema } from '../local/schema';
import { liveVault } from './config';

const readLiveWorkspace = Effect.gen(function* () {
  const connection = liveVault;
  if (!connection) return yield* Effect.fail(new Error('Configure a live vault first.'));
  const config = yield* Effect.try(() => readBrimVaultConfig(connection.vaultConfig));
  const { genesisHash, mint } = NETWORKS[config.network];
  const rpcUrl = yield* Effect.try(() => resolveBrimRpcUrl(config.network, connection.rpcUrl));
  const chain = yield* readVaultState({ ...config, genesisHash, mint, rpcUrl });
  const workspace = yield* Schema.decodeUnknownEffect(LocalWorkspaceSchema)({
    status: 'ready',
    vaultConfig: connection.vaultConfig,
    balanceBaseUnits: chain.balanceBaseUnits,
    chainTimestamp: chain.chainTimestamp,
    isPaused: chain.isPaused,
    ownerAddress: chain.owner,
    agents: toWorkspaceAgents(chain.policies),
    payments: [],
  });
  return adaptLocalWorkspace(workspace);
});

export function fetchLiveWorkspace(signal: AbortSignal) {
  return Effect.runPromise(readLiveWorkspace, { signal });
}
