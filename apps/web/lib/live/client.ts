import { NETWORKS, readBrimVaultConfig, resolveBrimRpcUrl } from '@brim/sdk';
import { Effect, Schema } from 'effect';
import { readVaultState } from '../chain/read-vault';
import { toWorkspaceAgents } from '../chain/workspace-agents';
import { adaptLocalWorkspace } from '../local/adapter';
import { LocalWorkspaceSchema } from '../local/schema';

export interface LiveWorkspaceConnection {
  vaultConfig: string;
  rpcUrl?: string | undefined;
}

export function fetchLiveWorkspace(connection: LiveWorkspaceConnection, signal: AbortSignal) {
  return Effect.runPromise(
    Effect.gen(function* () {
      const config = yield* Effect.try(() => readBrimVaultConfig(connection.vaultConfig));
      const { genesisHash, mint } = NETWORKS[config.network];
      const rpcUrl = yield* Effect.try(() => resolveBrimRpcUrl(config.network, connection.rpcUrl));
      const chain = yield* readVaultState({ ...config, genesisHash, mint, rpcUrl });
      const workspace = yield* Schema.decodeUnknownEffect(LocalWorkspaceSchema)({
        status: 'ready',
        vaultConfig: connection.vaultConfig,
        vaultAddress: config.vaultAddress,
        balanceBaseUnits: chain.balanceBaseUnits,
        chainTimestamp: chain.chainTimestamp,
        isPaused: chain.isPaused,
        ownerAddress: chain.owner,
        agents: toWorkspaceAgents(chain.policies),
        activityAvailable: false,
        payments: [],
      });
      return adaptLocalWorkspace(workspace);
    }),
    { signal },
  );
}
