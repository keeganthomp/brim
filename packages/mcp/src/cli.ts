#!/usr/bin/env node
import { Effect, Exit } from 'effect';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadMcpConfig } from './config.js';
import { createBrimMcpService } from './service.js';
import { createBrimMcpServer } from './server.js';
import { failureDiagnostic, publicDiagnostic } from './errors.js';

// stdout belongs exclusively to MCP. Setup diagnostics never contain provider causes or input values.
const program = Effect.gen(function* () {
  const config = yield* loadMcpConfig(process.argv.slice(2), process.env);
  const service = yield* createBrimMcpService(config);
  const server = createBrimMcpServer(service);
  server.onerror = () => {
    process.stderr.write('Brim MCP protocol request failed.\n');
  };
  yield* Effect.tryPromise({
    try: () => server.connect(new StdioServerTransport()),
    catch: () => publicDiagnostic('TOOL_FAILED'),
  });
  const close = () => {
    void server.close().finally(() => process.exit(0));
  };
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
});
const exit = await Effect.runPromiseExit(program);
if (Exit.isFailure(exit)) {
  const diagnostic = failureDiagnostic(exit.cause);
  process.stderr.write(`Brim MCP: ${diagnostic.code}: ${diagnostic.message}\n`);
  process.exitCode = 1;
}
