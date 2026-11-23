import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import {
  createBrimVaultConfig,
  readBrimVaultConfig,
  createBrimCard,
  readBrimCard,
  createBrimFetch,
  createBrimFetchEffect,
  type BrimVaultConfig,
  type BrimVaultConfigDetails,
  type BrimCardConfig,
  type BrimCardDetails,
} from '../src/index.js';
import { Effect } from 'effect';
import { vaultConfigDetails } from './sharedfixtures.js';

const exec = promisify(execFile);
const root = fileURLToPath(new URL('../../../', import.meta.url));
const vaultConfig = createBrimVaultConfig(vaultConfigDetails);

describe('vault config naming compatibility', () => {
  it('retains identical v1 bytes, aliases, and cross-readable metadata', () => {
    const legacyDetails: BrimCardDetails = vaultConfigDetails;
    const details: BrimVaultConfigDetails = legacyDetails;
    const expected =
      'brim:v1:' +
      btoa(JSON.stringify({ version: 1, ...details }))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
    expect(createBrimVaultConfig(details)).toBe(expected);
    expect(createBrimCard(legacyDetails)).toBe(expected);
    expect(createBrimCard).toBe(createBrimVaultConfig);
    expect(readBrimCard).toBe(readBrimVaultConfig);
    expect(readBrimVaultConfig(createBrimCard(legacyDetails))).toEqual(details);
    expect(readBrimCard(createBrimVaultConfig(details))).toEqual(legacyDetails);
  });

  it('accepts canonical and legacy inputs through the same payment engine', async () => {
    const transport = vi.fn(async () => new Response('free'));
    const canonical: BrimVaultConfig = { vaultConfig, agentKey: '[]', fetch: transport };
    const legacy: BrimCardConfig = { card: vaultConfig, agentKey: '[]', fetch: transport };
    expect(await (await createBrimFetch(canonical)('https://merchant.test/free')).text()).toBe(
      'free',
    );
    expect(await (await createBrimFetch(legacy)('https://merchant.test/free')).text()).toBe('free');
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it.each([vaultConfig, 'different-config', undefined])(
    'rejects both input properties even when their values match or one is undefined',
    async (card) => {
      const mixed = { vaultConfig, card, agentKey: '[]' } as never;
      expect(() => createBrimFetch(mixed)).toThrow(
        expect.objectContaining({
          code: 'INVALID_CONFIG',
          message: 'Provide exactly one vault config input.',
        }),
      );
      await expect(
        Effect.runPromise(createBrimFetchEffect(mixed)('https://merchant.test/free')),
      ).rejects.toMatchObject({ code: 'INVALID_CONFIG' });
    },
  );

  it('retains stable error codes with vault config diagnostics', () => {
    expect(() => readBrimVaultConfig('invalid')).toThrow(
      expect.objectContaining({
        code: 'INVALID_CARD',
        message: expect.stringContaining('Vault config'),
      }),
    );
    expect(() => readBrimCard(vaultConfig.replace('brim:v1:', 'brim:v2:'))).toThrow(
      expect.objectContaining({
        code: 'UNSUPPORTED_CARD_VERSION',
        message: expect.stringContaining('vault config'),
      }),
    );
  });
});

describe('example CLI environment compatibility', () => {
  const invoke = (canonical: string | undefined, legacy: string) => {
    const env = { ...process.env, BRIM_AGENT_KEY: '[]', BRIM_CARD: legacy };
    delete env.SOLANA_RPC_URL;
    if (canonical === undefined) delete env.BRIM_VAULT_CONFIG;
    else env.BRIM_VAULT_CONFIG = canonical;
    return exec(
      process.execPath,
      [
        '--import',
        'data:text/javascript,globalThis.fetch=async()=>new Response("free")',
        'packages/sdk/examples/agent.ts',
        'https://merchant.test/free',
      ],
      { cwd: root, env },
    );
  };

  it('prefers the canonical variable and falls back only when it is unset', async () => {
    expect((await invoke(vaultConfig, 'invalid-legacy')).stdout).toBe('HTTP 200\n');
    expect((await invoke(undefined, vaultConfig)).stdout).toBe('HTTP 200\n');
    await expect(invoke('', vaultConfig)).rejects.toMatchObject({
      stderr: expect.stringContaining('Vault config is invalid'),
    });
  });
});
