import { afterEach, describe, expect, it, vi } from 'vitest';
import { Effect } from 'effect';
import { createBrimVaultConfig, resolveBrimRpcUrl, type BrimNetwork } from '@brim/sdk';
import { loadMcpConfig } from './config.js';

const vaultConfig = (network: BrimNetwork) =>
  createBrimVaultConfig({
    vaultAddress: '11111111111111111111111111111111',
    programAddress: 'AekkJRGenJd9bgXoYo88xnAGpen9DMqSjkBRZZMMskpo',
    network,
    facilitatorFeePayers: ['ComputeBudget111111111111111111111111111111'],
  });
const agentKey = 'scoped-key-placeholder';
afterEach(() => vi.restoreAllMocks());

describe('MCP vault connection setup', () => {
  it.each([
    ['solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1', 'https://api.devnet.solana.com'],
    ['solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp', 'https://api.mainnet-beta.solana.com'],
  ] as const)(
    'uses the SDK network default without RPC env or setup networking: %s',
    async (network, expected) => {
      const fetcher = vi.spyOn(globalThis, 'fetch');
      const config = await Effect.runPromise(
        loadMcpConfig([], { BRIM_VAULT_CONFIG: vaultConfig(network), BRIM_AGENT_KEY: agentKey }),
      );
      expect(config).toMatchObject({ rpcUrl: expected, local: false, agentKey });
      expect(config.rpcUrl).toBe(resolveBrimRpcUrl(network));
      expect(fetcher).not.toHaveBeenCalled();
    },
  );

  it('normalizes the legacy environment alias only when canonical configuration is unset', async () => {
    const legacy = vaultConfig('solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1');
    const config = await Effect.runPromise(
      loadMcpConfig([], { BRIM_CARD: legacy, BRIM_AGENT_KEY: agentKey }),
    );
    expect(config.vaultConfig).toBe(legacy);
    expect(config).not.toHaveProperty('card');
  });

  it('prefers canonical environment configuration over a different legacy value', async () => {
    const canonical = vaultConfig('solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1');
    const config = await Effect.runPromise(
      loadMcpConfig([], {
        BRIM_VAULT_CONFIG: canonical,
        BRIM_CARD: vaultConfig('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'),
        BRIM_AGENT_KEY: agentKey,
      }),
    );
    expect(config.vaultConfig).toBe(canonical);
    expect(config.rpcUrl).toBe('https://api.devnet.solana.com');
  });

  it.each(['', 'invalid-canonical-vault-config'])(
    'does not fall back from an invalid canonical environment value: %s',
    async (canonical) => {
      const result = await Effect.runPromise(
        Effect.result(
          loadMcpConfig([], {
            BRIM_VAULT_CONFIG: canonical,
            BRIM_CARD: vaultConfig('solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1'),
            BRIM_AGENT_KEY: agentKey,
          }),
        ),
      );
      expect(result._tag).toBe('Failure');
      if (result._tag === 'Failure') {
        expect(result.failure.code).toBe(canonical ? 'INVALID_CARD' : 'SETUP_REQUIRED');
        expect(result.failure.message).not.toContain('invalid-canonical-vault-config');
        expect(result.failure.message.toLowerCase()).not.toContain('card');
      }
    },
  );

  it('keeps the explicit provider connection for the shared read/payment config', async () => {
    const rpcUrl = 'https://rpc.example/private-token';
    const config = await Effect.runPromise(
      loadMcpConfig([], {
        BRIM_VAULT_CONFIG: vaultConfig('solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1'),
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
            BRIM_VAULT_CONFIG: vaultConfig('solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1'),
            BRIM_AGENT_KEY: agentKey,
            SOLANA_RPC_URL: rpcUrl,
          }),
        ),
      ).rejects.toMatchObject({ _tag: 'McpFailure' });
    },
  );
});
