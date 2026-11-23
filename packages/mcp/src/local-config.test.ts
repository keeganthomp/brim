import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Effect } from 'effect';
import { readLocalConfiguration } from './local-config.js';
import { loadMcpConfig } from './config.js';
import { createBrimVaultConfig } from '@brim/sdk';

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});
async function localFile(contents: string) {
  const directory = await mkdtemp(path.join(tmpdir(), 'brim-config-bound-'));
  directories.push(directory);
  const filename = path.join(directory, 'local.json');
  await writeFile(filename, contents, { mode: 0o600 });
  return filename;
}

describe('MCP local configuration read', () => {
  it('reads a bounded file through the explicitly supplied absolute path', async () => {
    const filename = await localFile('{"kind":"local-test"}');
    await expect(Effect.runPromise(readLocalConfiguration(filename))).resolves.toBe(
      '{"kind":"local-test"}',
    );
  });

  it('refuses relative paths instead of depending on an MCP host working directory', async () => {
    await expect(Effect.runPromise(readLocalConfiguration('local.json'))).rejects.toMatchObject({
      code: 'INVALID_LOCAL_SETUP',
    });
  });

  it('applies the file cap in bytes, including multibyte contents', async () => {
    const filename = await localFile('€'.repeat(11_000));
    await expect(Effect.runPromise(readLocalConfiguration(filename))).rejects.toMatchObject({
      code: 'INVALID_LOCAL_SETUP',
    });
  });
});

const canonicalVaultConfig = () =>
  createBrimVaultConfig({
    vaultAddress: '11111111111111111111111111111111',
    programAddress: 'AekkJRGenJd9bgXoYo88xnAGpen9DMqSjkBRZZMMskpo',
    network: 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
    facilitatorFeePayers: ['ComputeBudget111111111111111111111111111111'],
  });
const localMetadata = {
  kind: 'brim-local-only-v1',
  rpcUrl: 'http://127.0.0.1:8899',
  agentKey: 'scoped-agent-placeholder',
};

describe('MCP local vault config compatibility', () => {
  it.each(['vaultConfig', 'card'] as const)(
    'normalizes a %s setup into canonical internal configuration',
    async (field) => {
      const value = canonicalVaultConfig();
      const filename = await localFile(
        JSON.stringify({
          ...localMetadata,
          [field]: value,
          ownerKey: 'OWNER_SECRET_PLACEHOLDER',
          facilitatorKey: 'FACILITATOR_SECRET_PLACEHOLDER',
        }),
      );
      const config = await Effect.runPromise(loadMcpConfig(['--local', filename], {}));
      expect(config).toEqual({
        vaultConfig: value,
        agentKey: localMetadata.agentKey,
        rpcUrl: localMetadata.rpcUrl,
        local: true,
      });
      expect(JSON.stringify(config)).not.toContain('SECRET_PLACEHOLDER');
      expect(config).not.toHaveProperty('card');
    },
  );

  it('keeps canonical local metadata when the ignored legacy field is invalid', async () => {
    const value = canonicalVaultConfig();
    const filename = await localFile(
      JSON.stringify({ ...localMetadata, vaultConfig: value, card: 'x'.repeat(4097) }),
    );
    const config = await Effect.runPromise(loadMcpConfig(['--local', filename], {}));
    expect(config.vaultConfig).toBe(value);
  });

  it.each(['', null, 'x'.repeat(4097)])(
    'rejects invalid present canonical metadata instead of using legacy setup',
    async (value) => {
      const filename = await localFile(
        JSON.stringify({ ...localMetadata, vaultConfig: value, card: canonicalVaultConfig() }),
      );
      await expect(
        Effect.runPromise(loadMcpConfig(['--local', filename], {})),
      ).rejects.toMatchObject({ code: 'INVALID_LOCAL_SETUP' });
    },
  );
});
