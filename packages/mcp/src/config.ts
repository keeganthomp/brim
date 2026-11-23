import { Effect, Schema } from 'effect';
import { readBrimVaultConfig, resolveBrimRpcUrl } from '@brim/sdk';
import { attempt, fail, McpFailure } from './errors.js';
import type { McpConfig } from './types.js';
import { readLocalConfiguration } from './local-config.js';

const fields = {
  vaultConfig: Schema.String.check(Schema.isBetweenLength(1, 4096)),
  agentKey: Schema.String.check(Schema.isBetweenLength(1, 1024)),
};
const RpcUrl = Schema.String.check(Schema.isBetweenLength(1, 8192));
const EnvConfig = Schema.Struct({ ...fields, rpcUrl: Schema.optionalKey(RpcUrl) });
const LocalSource = Schema.Struct({
  kind: Schema.Literal('brim-local-only-v1'),
  vaultConfig: Schema.optionalKey(Schema.Unknown),
  card: Schema.optionalKey(Schema.Unknown),
  agentKey: fields.agentKey,
  rpcUrl: RpcUrl,
});
const LocalConfig = Schema.Struct({ ...fields, rpcUrl: RpcUrl });
const invalidLocalSetup = () =>
  new McpFailure({
    code: 'INVALID_LOCAL_SETUP',
    message: 'The local vault configuration is invalid. Recreate the local Brim stack.',
  });
export const loopback = (url: URL) => ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);

export function loadMcpConfig(args: readonly string[], env: NodeJS.ProcessEnv) {
  return Effect.gen(function* () {
    if (!args.length) {
      const config = yield* Schema.decodeUnknownEffect(EnvConfig)({
        vaultConfig: env.BRIM_VAULT_CONFIG === undefined ? env.BRIM_CARD : env.BRIM_VAULT_CONFIG,
        agentKey: env.BRIM_AGENT_KEY,
        ...(env.SOLANA_RPC_URL === undefined ? {} : { rpcUrl: env.SOLANA_RPC_URL }),
      }).pipe(
        Effect.mapError(
          () =>
            new McpFailure({
              code: 'SETUP_REQUIRED',
              message:
                'Set BRIM_VAULT_CONFIG and BRIM_AGENT_KEY before starting Brim MCP. SOLANA_RPC_URL is optional.',
            }),
        ),
      );
      const details = yield* attempt(
        () => readBrimVaultConfig(config.vaultConfig),
        'INVALID_CARD',
        'Vault configuration is invalid.',
      );
      const rpcUrl = yield* attempt(
        () => resolveBrimRpcUrl(details.network, config.rpcUrl),
        'INVALID_CONFIG',
        'The optional Solana RPC URL is invalid.',
      );
      return { ...config, rpcUrl, local: false } satisfies McpConfig;
    }
    if (args.length !== 2 || args[0] !== '--local' || !args[1])
      return yield* fail(
        'INVALID_OPTIONS',
        'Set BRIM_VAULT_CONFIG and BRIM_AGENT_KEY, or use --local /absolute/path/.brim/local.json.',
      );
    const text = yield* readLocalConfiguration(args[1]);
    const source = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(LocalSource))(text).pipe(
      Effect.mapError(invalidLocalSetup),
    );
    // A present canonical value must validate; an invalid new field never falls back silently.
    const config = yield* Schema.decodeUnknownEffect(LocalConfig)({
      vaultConfig: Object.hasOwn(source, 'vaultConfig') ? source.vaultConfig : source.card,
      agentKey: source.agentKey,
      rpcUrl: source.rpcUrl,
    }).pipe(Effect.mapError(invalidLocalSetup));
    const url = yield* attempt(
      () => new URL(config.rpcUrl),
      'INVALID_LOCAL_SETUP',
      'Local Brim requires a loopback Surfpool RPC.',
    );
    if (url.protocol !== 'http:' || !loopback(url))
      return yield* fail('INVALID_LOCAL_SETUP', 'Local Brim requires a loopback Surfpool RPC.');
    // Only public vault metadata and the scoped agent key survive the projection.
    return { ...config, local: true } satisfies McpConfig;
  });
}
