/** Exercises the built MCP CLI over real stdio against the offline paid report. */
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Data, Effect, Schema } from 'effect';
import { configuration, root } from '../../../scripts/local/config.ts';
import { loadLocalContext, PAYMENT_AMOUNT, RESOURCE_URL } from './context.ts';
import { finalizedProof, localBalancesEffect, persistLocalProof } from './client.ts';

class LocalMcpError extends Data.TaggedError('LocalMcpError')<{ message: string }> {}
const io = <A>(work: (signal: AbortSignal) => PromiseLike<A>, message: string) =>
  Effect.tryPromise({ try: work, catch: () => new LocalMcpError({ message }) });
const failure = (message: string) => Effect.fail(new LocalMcpError({ message }));

const ToolReply = Schema.Struct({
  content: Schema.Array(Schema.Struct({ type: Schema.Literal('text'), text: Schema.String })),
  isError: Schema.optionalKey(Schema.Boolean),
});
function resultValue(input: unknown) {
  return Effect.gen(function* () {
    const result = yield* Schema.decodeUnknownEffect(ToolReply)(input).pipe(
      Effect.mapError(() => new LocalMcpError({ message: 'MCP returned an invalid tool result.' })),
    );
    if (result.isError)
      return yield* failure(
        'A local MCP tool failed. Check the local card policy and service status.',
      );
    const text = result.content
      .filter((item) => item.type === 'text')
      .map((item) => item.text)
      .join('\n');
    return yield* Effect.try({
      try: () => JSON.parse(text) as unknown,
      catch: () => new LocalMcpError({ message: 'MCP returned an invalid tool result.' }),
    });
  });
}

export const localMcpDemo = Effect.gen(function* () {
  const settings = yield* configuration;
  const context = yield* loadLocalContext;
  const filename = path.resolve(process.env.BRIM_LOCAL_CONFIG ?? settings.file);
  return yield* Effect.acquireUseRelease(
    Effect.sync(() => {
      const client = new Client({ name: 'brim-local-agent', version: '0.1.0' });
      const transport = new StdioClientTransport({
        command: process.execPath,
        args: [path.join(root, 'packages/mcp/dist/cli.js'), '--local', filename],
        cwd: root,
        stderr: 'pipe',
      });
      // Drain diagnostics without forwarding child errors or configuration to logs.
      transport.stderr?.on('data', () => {});
      return { client, transport };
    }),
    ({ client, transport }) =>
      Effect.gen(function* () {
        yield* io(
          (signal) => client.connect(transport, { signal }),
          'Cannot connect to Brim MCP. Build packages and start the local stack.',
        );
        const { tools } = yield* io(
          (signal) => client.listTools(undefined, { signal }),
          'MCP tool discovery failed.',
        );
        const names = tools.map((tool) => tool.name).sort();
        if (names.join(',') !== 'brim_balance,brim_fetch,brim_policy')
          return yield* failure('The local MCP server did not expose the expected tools.');
        for (const name of ['brim_balance', 'brim_policy']) {
          yield* resultValue(
            yield* io(
              (signal) => client.callTool({ name, arguments: {} }, undefined, { signal }),
              'A local MCP read tool failed.',
            ),
          );
        }
        const before = yield* localBalancesEffect(context);
        const result = yield* resultValue(
          yield* io(
            (signal) =>
              client.callTool(
                {
                  name: 'brim_fetch',
                  arguments: { url: RESOURCE_URL },
                },
                undefined,
                { signal },
              ),
            'The paid MCP call failed. Check settlement before attempting it again.',
          ),
        );
        const receipt = yield* Schema.decodeUnknownEffect(
          Schema.Struct({
            status: Schema.Literal(200),
            receipt: Schema.Struct({
              network: Schema.Literal(context.network),
              signature: Schema.String.check(Schema.isPattern(/^[1-9A-HJ-NP-Za-km-z]{64,88}$/)),
            }),
          }),
        )(result).pipe(
          Effect.mapError(
            () =>
              new LocalMcpError({
                message: 'The paid MCP tool did not return a valid settlement receipt.',
              }),
          ),
        );
        const signature = receipt.receipt.signature;
        const after = yield* localBalancesEffect(context);
        if (
          before.vault - after.vault !== PAYMENT_AMOUNT ||
          after.merchant - before.merchant !== PAYMENT_AMOUNT
        ) {
          return yield* failure(
            'Actual USDC changes did not match the MCP payment. Reconcile before trying again.',
          );
        }
        const proof = yield* finalizedProof(context.rpcUrl, context.programAddress, signature);
        if (
          proof.status !== 'settled' ||
          proof.payments.length !== 1 ||
          !proof.payments.some(
            (payment) =>
              payment.vault === context.vaultAddress &&
              payment.agentKey === context.agentAddress &&
              payment.recipient === context.merchantAddress &&
              payment.amount === PAYMENT_AMOUNT.toString(),
          )
        ) {
          return yield* failure('Finalized runtime events did not prove the MCP payment.');
        }
        const ledgerRows = yield* persistLocalProof(settings.databaseUrl, signature, proof);
        return {
          status: 'settled',
          via: 'mcp',
          amount: '$0.04',
          tools: names,
          signature,
          ledgerRows,
        };
      }),
    ({ client }) => io(() => client.close(), 'MCP cleanup failed.').pipe(Effect.ignore),
  );
});

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await Effect.runPromise(
    localMcpDemo.pipe(
      Effect.tap((result) => Effect.sync(() => console.log(JSON.stringify(result)))),
      Effect.catch((error) =>
        Effect.sync(() => {
          console.error(
            error instanceof LocalMcpError
              ? error.message
              : 'Local MCP demo failed. Start the local stack and build its packages.',
          );
          process.exitCode = 1;
        }),
      ),
    ),
  );
}
