import { afterEach, describe, expect, it, vi } from 'vitest';
import { Effect, Schema } from 'effect';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createBrimMcpServer } from './server.js';
import { McpFailure } from './errors.js';
import type { BrimMcpService, EmptyArgs, FetchArgs } from './types.js';

const close: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.allSettled(close.splice(0).map((dispose) => dispose()));
});

function fixture(overrides: Partial<BrimMcpService> = {}) {
  return {
    balance: vi.fn((_input: EmptyArgs, _signal: AbortSignal) =>
      Effect.succeed({ balance: '12.450000', currency: 'USDC' }),
    ),
    policy: vi.fn((_input: EmptyArgs, _signal: AbortSignal) =>
      Effect.succeed({ frozen: false, maxPerPayment: '1.000000' }),
    ),
    fetch: vi.fn((_input: FetchArgs, _signal: AbortSignal) =>
      Effect.succeed({ status: 200, body: 'paid report' }),
    ),
    ...overrides,
  } satisfies BrimMcpService;
}
async function connect(service: BrimMcpService) {
  const server = createBrimMcpServer(service);
  const client = new Client({ name: 'brim-protocol-test', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  close.push(
    () => client.close(),
    () => server.close(),
  );
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return client;
}
const ToolReply = Schema.Struct({
  content: Schema.Array(Schema.Struct({ type: Schema.Literal('text'), text: Schema.String })),
});
function text(result: unknown) {
  return Schema.decodeUnknownSync(ToolReply)(result)
    .content.map((item) => item.text)
    .join('\n');
}

// Use the official MCP client and transport to exercise initialization and tool dispatch.
describe('Brim MCP protocol', () => {
  it('initializes and advertises the three focused tools', async () => {
    const client = await connect(fixture());
    expect(client.getServerVersion()?.name.toLowerCase()).toContain('brim');
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      'brim_balance',
      'brim_fetch',
      'brim_policy',
    ]);
    for (const tool of tools) {
      expect(tool.description?.length).toBeGreaterThan(10);
      expect(tool.inputSchema.type).toBe('object');
      expect(tool.inputSchema.additionalProperties).toBe(false);
    }
    expect(tools.find((tool) => tool.name === 'brim_balance')?.annotations?.readOnlyHint).toBe(
      true,
    );
    expect(tools.find((tool) => tool.name === 'brim_fetch')?.annotations?.readOnlyHint).toBe(false);
  });

  it('reads balance and policy without invoking the paid fetch tool', async () => {
    const service = fixture();
    const client = await connect(service);
    const balance = await client.callTool({ name: 'brim_balance', arguments: {} });
    const policy = await client.callTool({ name: 'brim_policy', arguments: {} });
    expect(balance.isError).not.toBe(true);
    expect(JSON.parse(text(balance))).toMatchObject({ balance: '12.450000', currency: 'USDC' });
    expect(JSON.parse(text(policy))).toMatchObject({ frozen: false });
    expect(service.fetch).not.toHaveBeenCalled();
    expect(service.balance).toHaveBeenCalledWith({}, expect.any(AbortSignal));
  });

  it('passes a valid paid request and its cancellation signal to the service', async () => {
    const service = fixture();
    const client = await connect(service);
    const input = {
      url: 'https://merchant.example/report',
      method: 'POST',
      body: '{"query":"solana"}',
    };
    const result = await client.callTool({ name: 'brim_fetch', arguments: input });
    expect(result.isError).not.toBe(true);
    expect(JSON.parse(text(result))).toMatchObject({ status: 200, body: 'paid report' });
    expect(service.fetch).toHaveBeenCalledWith(input, expect.any(AbortSignal));
  });

  it.each([
    {},
    { url: 'not a URL' },
    { url: 'https://merchant.example', method: 'DELETE' },
    { url: 'https://merchant.example', body: 42 },
    { url: 'https://merchant.example', amount: '999999999' },
    { url: 'https://merchant.example', ownerKey: 'NEVER_ACCEPT_TREASURY_KEYS' },
    { url: 'https://merchant.example', vaultConfig: 'UNEXPECTED_VAULT_CONFIG' },
    { url: 'https://merchant.example', card: 'UNEXPECTED_LEGACY_CONFIG' },
  ])('rejects invalid or authority-changing input before service invocation: %j', async (input) => {
    const service = fixture();
    const client = await connect(service);
    const result = await client.callTool({ name: 'brim_fetch', arguments: input });
    expect(result.isError).toBe(true);
    expect(service.fetch).not.toHaveBeenCalled();
    expect(text(result)).not.toContain('NEVER_ACCEPT_TREASURY_KEYS');
  });

  it('refuses unknown tools and unexpected arguments on read tools', async () => {
    const service = fixture();
    const client = await connect(service);
    const unknown = await client.callTool({ name: 'brim_withdraw', arguments: {} });
    const invalidRead = await client.callTool({
      name: 'brim_balance',
      arguments: { vault: 'another vault' },
    });
    expect(unknown.isError).toBe(true);
    expect(invalidRead.isError).toBe(true);
    expect(service.balance).not.toHaveBeenCalled();
    expect(service.fetch).not.toHaveBeenCalled();
  });

  it('redacts typed and unexpected failures instead of exposing secret-bearing causes', async () => {
    const secret = 'SECRET_AGENT_KEY_OR_RPC_TOKEN';
    const service = fixture({
      balance: () => Effect.fail(new McpFailure({ code: 'RPC_UNAVAILABLE', message: secret })),
      policy: () => Effect.die(new Error(`provider failed: ${secret}`)),
    });
    const client = await connect(service);
    for (const name of ['brim_balance', 'brim_policy']) {
      const result = await client.callTool({ name, arguments: {} });
      expect(result.isError).toBe(true);
      expect(text(result)).not.toContain(secret);
      expect(text(result).length).toBeLessThan(1024);
    }
  });

  it('bounds tool output before returning it to an agent', async () => {
    const client = await connect(
      fixture({ fetch: () => Effect.succeed({ body: 'x'.repeat(70 * 1024) }) }),
    );
    const result = await client.callTool({
      name: 'brim_fetch',
      arguments: { url: 'https://merchant.example/report' },
    });
    expect(result.isError).toBe(true);
    expect(text(result).length).toBeLessThan(1024);
  });

  it('returns a typed tool error for a value that cannot be serialized as JSON', async () => {
    const client = await connect(fixture({ balance: () => Effect.succeed(undefined) }));
    const result = await client.callTool({ name: 'brim_balance', arguments: {} });
    expect(result.isError).toBe(true);
    expect(JSON.parse(text(result))).toMatchObject({ code: 'INVALID_RESULT' });
  });

  it('interrupts the Effect service when an MCP client cancels a request', async () => {
    let markStarted!: () => void;
    let markInterrupted!: () => void;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const interrupted = new Promise<void>((resolve) => {
      markInterrupted = resolve;
    });
    const client = await connect(
      fixture({
        fetch: () =>
          Effect.gen(function* () {
            yield* Effect.sync(markStarted);
            return yield* Effect.never;
          }).pipe(Effect.onInterrupt(() => Effect.sync(markInterrupted))),
      }),
    );
    const abort = new AbortController();
    const pending = client.callTool(
      { name: 'brim_fetch', arguments: { url: 'https://merchant.example/report' } },
      undefined,
      { signal: abort.signal },
    );
    await started;
    abort.abort();
    await expect(pending).rejects.toThrow();
    await interrupted;
  });
});
