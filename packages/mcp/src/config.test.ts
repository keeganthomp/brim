import { afterEach, describe, expect, it, vi } from 'vitest';
import { Effect } from 'effect';
import { createBrimCard, resolveBrimRpcUrl, type BrimNetwork } from '@brim/sdk';
import { loadMcpConfig } from './config.js';

const card = (network: BrimNetwork) =>
  createBrimCard({
    vaultAddress: '11111111111111111111111111111111',
    programAddress: 'AekkJRGenJd9bgXoYo88xnAGpen9DMqSjkBRZZMMskpo',
    network,
    facilitatorFeePayers: ['ComputeBudget111111111111111111111111111111'],
  });
const agentKey = 'scoped-key-placeholder';
afterEach(() => vi.restoreAllMocks());

describe('MCP card connection setup', () => {
  it.each([
    ['solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1', 'https://api.devnet.solana.com'],
    ['solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp', 'https://api.mainnet-beta.solana.com'],
  ] as const)(
    'uses the SDK network default without RPC env or setup networking: %s',
    async (network, expected) => {
      const fetcher = vi.spyOn(globalThis, 'fetch');
      const config = await Effect.runPromise(
        loadMcpConfig([], { BRIM_CARD: card(network), BRIM_AGENT_KEY: agentKey }),
      );
      expect(config).toMatchObject({ rpcUrl: expected, local: false, agentKey });
      expect(config.rpcUrl).toBe(resolveBrimRpcUrl(network));
      expect(fetcher).not.toHaveBeenCalled();
    },
  );

  it('keeps the explicit provider connection for the shared read/payment config', async () => {
    const rpcUrl = 'https://rpc.example/private-token';
    const config = await Effect.runPromise(
      loadMcpConfig([], {
        BRIM_CARD: card('solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1'),
        BRIM_AGENT_KEY: agentKey,
        SOLANA_RPC_URL: rpcUrl,
      }),
    );
    expect(config.rpcUrl).toBe(rpcUrl);
  });

  it.each(['', 'not-a-url', 'http://rpc.example', 'file:///private-token'])(
    'rejects an invalid explicit RPC instead of silently choosing a default: %s',
    async (rpcUrl) => {
      await expect(
        Effect.runPromise(
          loadMcpConfig([], {
            BRIM_CARD: card('solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1'),
            BRIM_AGENT_KEY: agentKey,
            SOLANA_RPC_URL: rpcUrl,
          }),
        ),
      ).rejects.toMatchObject({ _tag: 'McpFailure' });
    },
  );
});
