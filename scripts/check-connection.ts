/** Read-only client/CLI preflight. Requires no signing key and never authorizes payment. */
import { pathToFileURL } from 'node:url';
import { Effect, Result } from 'effect';
import {
  BrimPolicyViolationError,
  checkBrimConnectionEffect,
  type BrimConnectionInput,
} from '@brim/sdk';

function options(args: readonly string[], env: NodeJS.ProcessEnv) {
  return Effect.try({
    try: (): BrimConnectionInput => {
      const flags = new Map<string, string>();
      for (let index = 0; index < args.length; index += 2) {
        const flag = args[index];
        const value = args[index + 1];
        if (
          !flag ||
          !['--agent-public-key', '--resource-url'].includes(flag) ||
          !value ||
          value.startsWith('--') ||
          flags.has(flag)
        )
          throw new Error();
        flags.set(flag, value);
      }
      const agentPublicKey = flags.get('--agent-public-key');
      if (!agentPublicKey || !env.BRIM_VAULT_CONFIG) throw new Error();
      return {
        vaultConfig: env.BRIM_VAULT_CONFIG,
        agentPublicKey,
        rpcUrl: env.SOLANA_RPC_URL,
        resourceUrl: flags.get('--resource-url'),
      };
    },
    catch: () =>
      new BrimPolicyViolationError(
        'INVALID_CONFIG',
        'Set BRIM_VAULT_CONFIG and provide --agent-public-key PUBLIC_KEY. Optionally add --resource-url URL and SOLANA_RPC_URL.',
      ),
  });
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const args = process.argv.slice(2);
  if (args.length === 1 && ['--help', '-h'].includes(args[0]!)) {
    console.log(
      'Usage: node scripts/check-connection.ts --agent-public-key PUBLIC_KEY [--resource-url URL]',
    );
    console.log(
      'Set BRIM_VAULT_CONFIG; SOLANA_RPC_URL is optional. No signing key is read or accepted.',
    );
    console.log(
      'Prints a public JSON report. Exit 0: checks passed; 2: blockers; 1: failure or cancellation.',
    );
  } else {
    const controller = new AbortController();
    const stop = () => controller.abort();
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    try {
      const result = await Effect.runPromise(
        Effect.result(options(args, process.env).pipe(Effect.flatMap(checkBrimConnectionEffect))),
        { signal: controller.signal },
      );
      if (Result.isFailure(result)) {
        console.error(
          JSON.stringify({ code: result.failure.code, message: result.failure.message }),
        );
        process.exitCode = 1;
      } else {
        console.log(JSON.stringify(result.success, null, 2));
        process.exitCode = result.success.ready ? 0 : 2;
      }
    } catch {
      console.error('Connection check cancelled or failed. No payment was authorized.');
      process.exitCode = 1;
    } finally {
      process.removeListener('SIGINT', stop);
      process.removeListener('SIGTERM', stop);
    }
  }
}
