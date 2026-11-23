import { Effect, Exit } from 'effect';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { McpFailure, fail, failureDiagnostic } from './errors.js';
import {
  EmptyInput,
  FetchInput,
  inputJsonSchema,
  MAX_RESPONSE_BYTES,
  toolInput,
} from './schemas.js';
import type { BrimMcpService } from './types.js';

const descriptions = {
  brim_balance: 'Read the USDC balance in the configured vault.',
  brim_policy:
    'Read this agent’s on-chain spending limits, freeze status, and approved recipients.',
  brim_fetch:
    'Fetch a paid API using this agent’s vault policy. On-chain policy limits every payment. HTTPS required.',
};

export function createBrimMcpServer(service: BrimMcpService) {
  const server = new Server(
    { name: 'brim', version: '0.1.0' },
    {
      capabilities: { tools: {} },
      instructions:
        'Use brim_policy and brim_balance to inspect the configured vault and agent policy. brim_fetch pays only through its scoped on-chain policy. Never supply wallet keys or RPC credentials as tool arguments.',
    },
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'brim_balance',
        description: descriptions.brim_balance,
        inputSchema: inputJsonSchema(EmptyInput),
        annotations: { readOnlyHint: true, destructiveHint: false },
      },
      {
        name: 'brim_policy',
        description: descriptions.brim_policy,
        inputSchema: inputJsonSchema(EmptyInput),
        annotations: { readOnlyHint: true, destructiveHint: false },
      },
      {
        name: 'brim_fetch',
        description: descriptions.brim_fetch,
        inputSchema: inputJsonSchema(FetchInput),
        annotations: {
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: false,
          openWorldHint: true,
        },
      },
    ],
  }));
  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const program = Effect.gen(function* () {
      const input = request.params.arguments ?? {};
      let output: unknown;
      switch (request.params.name) {
        case 'brim_balance':
          output = yield* service.balance(yield* toolInput(EmptyInput, input), extra.signal);
          break;
        case 'brim_policy':
          output = yield* service.policy(yield* toolInput(EmptyInput, input), extra.signal);
          break;
        case 'brim_fetch':
          output = yield* service.fetch(yield* toolInput(FetchInput, input), extra.signal);
          break;
        default:
          return yield* fail('UNKNOWN_TOOL', 'Choose brim_balance, brim_policy, or brim_fetch.');
      }
      const text = yield* Effect.try({
        try: () => {
          const encoded = JSON.stringify(output);
          if (typeof encoded !== 'string') throw new Error();
          return encoded;
        },
        catch: () =>
          new McpFailure({
            code: 'INVALID_RESULT',
            message: 'The tool returned an invalid result.',
          }),
      });
      if (new TextEncoder().encode(text).length > MAX_RESPONSE_BYTES + 4096)
        return yield* fail(
          'RESPONSE_TOO_LARGE',
          'The response is too large. Request a smaller API result.',
        );
      return { content: [{ type: 'text' as const, text }] };
    });
    // Defects, cancellations and unexpected errors never disclose credential-bearing causes.
    const exit = await Effect.runPromiseExit(program, { signal: extra.signal });
    if (Exit.isSuccess(exit)) return exit.value;
    const diagnostic = failureDiagnostic(exit.cause);
    return {
      isError: true,
      content: [{ type: 'text' as const, text: JSON.stringify(diagnostic) }],
    };
  });
  return server;
}
