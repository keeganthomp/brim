import { readFile, stat } from 'node:fs/promises';
import { Effect, Schema } from 'effect';
import { readBrimCard, resolveBrimRpcUrl } from '@brim/sdk';
import { attempt, fail, io, McpFailure } from './errors.js';
import type { McpConfig } from './types.js';

const fields = {
  card: Schema.String.check(Schema.isBetweenLength(1, 4096)),
  agentKey: Schema.String.check(Schema.isBetweenLength(1, 1024)),
};
const RpcUrl = Schema.String.check(Schema.isBetweenLength(1, 8192));
const EnvConfig = Schema.Struct({ ...fields, rpcUrl: Schema.optionalKey(RpcUrl) });
const LocalConfig = Schema.Struct({
  kind: Schema.Literal('brim-local-only-v1'),
  ...fields,
  rpcUrl: RpcUrl,
});
export const loopback = (url: URL) => ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);

export function loadMcpConfig(args: readonly string[], env: NodeJS.ProcessEnv) {
  return Effect.gen(function* () {
    if (!args.length) {
      const config = yield* Schema.decodeUnknownEffect(EnvConfig)({
        card: env.BRIM_CARD,
        agentKey: env.BRIM_AGENT_KEY,
        ...(env.SOLANA_RPC_URL === undefined ? {} : { rpcUrl: env.SOLANA_RPC_URL }),
      }).pipe(
        Effect.mapError(
          () =>
            new McpFailure({
              code: 'SETUP_REQUIRED',
              message:
                'Set BRIM_CARD and BRIM_AGENT_KEY before starting Brim MCP. SOLANA_RPC_URL is optional.',
            }),
        ),
      );
      const card = yield* attempt(
        () => readBrimCard(config.card),
        'INVALID_CARD',
        'Card setup is invalid.',
      );
      const rpcUrl = yield* attempt(
        () => resolveBrimRpcUrl(card.network, config.rpcUrl),
        'INVALID_CONFIG',
        'The optional Solana RPC URL is invalid.',
      );
      return { ...config, rpcUrl, local: false } satisfies McpConfig;
    }
    if (args.length !== 2 || args[0] !== '--local' || !args[1])
      return yield* fail(
        'INVALID_OPTIONS',
        'Set BRIM_CARD and BRIM_AGENT_KEY, or use --local /absolute/path/.brim/local.json.',
      );
    const filename = args[1];
    const info = yield* io(
      () => stat(filename),
      'LOCAL_SETUP_REQUIRED',
      'Start the local Brim stack before using --local.',
    );
    if (!info.isFile() || info.size > 32_768)
      return yield* fail(
        'INVALID_LOCAL_SETUP',
        'The local configuration file is invalid. Recreate the local stack.',
      );
    const text = yield* io(
      () => readFile(filename, 'utf8'),
      'LOCAL_SETUP_REQUIRED',
      'Could not read the local Brim configuration.',
    );
    const config = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(LocalConfig))(text).pipe(
      Effect.mapError(
        () =>
          new McpFailure({
            code: 'INVALID_LOCAL_SETUP',
            message: 'The local configuration is invalid. Recreate the local Brim stack.',
          }),
      ),
    );
    const url = yield* attempt(
      () => new URL(config.rpcUrl),
      'INVALID_LOCAL_SETUP',
      'Local Brim requires a loopback Surfpool RPC.',
    );
    if (url.protocol !== 'http:' || !loopback(url))
      return yield* fail('INVALID_LOCAL_SETUP', 'Local Brim requires a loopback Surfpool RPC.');
    // Ignore owner/facilitator credentials in the source file; only the scoped agent key is retained.
    return {
      card: config.card,
      agentKey: config.agentKey,
      rpcUrl: config.rpcUrl,
      local: true,
    } satisfies McpConfig;
  });
}
