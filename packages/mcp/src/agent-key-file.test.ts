import { chmod, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createKeyPairSignerFromBytes } from '@solana/kit';
import { createBrimVaultConfig } from '@brim/sdk';
import { Effect } from 'effect';
import { generateAgentKey } from '../../../scripts/agent-key.ts';
import { loadMcpConfig } from './config.js';
import { readLocalAgentKey } from './local-config.js';

const directories: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});
async function directory() {
  const dir = await mkdtemp(path.join(tmpdir(), 'brim-agent-key-'));
  directories.push(dir);
  return dir;
}
async function fixture() {
  const dir = await directory();
  const filename = path.join(dir, 'agent.json');
  const generated = await Effect.runPromise(generateAgentKey(filename));
  const vaultConfig = createBrimVaultConfig({
    vaultAddress: '11111111111111111111111111111111',
    programAddress: 'AekkJRGenJd9bgXoYo88xnAGpen9DMqSjkBRZZMMskpo',
    network: 'devnet',
    facilitatorFeePayers: ['ComputeBudget111111111111111111111111111111'],
  });
  const localFile = path.join(dir, 'local.json');
  await writeFile(
    localFile,
    JSON.stringify({
      kind: 'brim-local-only-v1',
      vaultConfig,
      agentKey: 'GENERATED_SEEDED_AGENT_PLACEHOLDER',
      rpcUrl: 'http://127.0.0.1:8899',
    }),
    { mode: 0o600 },
  );
  return { filename, generated, localFile, vaultConfig };
}

describe('private scoped key generation', () => {
  it('writes a valid private key once, returning only public identity and path', async () => {
    const { filename, generated } = await fixture();
    expect(Object.keys(generated).sort()).toEqual(['keyFile', 'publicKey']);
    expect(generated.keyFile).toBe(filename);
    expect((await stat(filename)).mode & 0o777).toBe(0o600);
    const before = await readFile(filename, 'utf8');
    const signer = await createKeyPairSignerFromBytes(new Uint8Array(JSON.parse(before)));
    expect(signer.address).toBe(generated.publicKey);
    await expect(Effect.runPromise(generateAgentKey(filename))).rejects.toMatchObject({
      message: expect.stringContaining('already exists'),
    });
    expect(await readFile(filename, 'utf8')).toBe(before);
  });
});

describe('explicit local MCP key override', () => {
  it('uses only the selected agent key with unchanged local routing and no network calls', async () => {
    const { filename, localFile, vaultConfig } = await fixture();
    const fetcher = vi.spyOn(globalThis, 'fetch');
    const config = await Effect.runPromise(
      loadMcpConfig(['--local', localFile, '--agent-key-file', filename], {}),
    );
    expect(config).toEqual({
      vaultConfig,
      rpcUrl: 'http://127.0.0.1:8899',
      local: true,
      agentKey: JSON.stringify(JSON.parse(await readFile(filename, 'utf8'))),
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('rejects public-readable, relative, malformed and oversized private key files', async () => {
    const { filename } = await fixture();
    await chmod(filename, 0o644);
    await expect(Effect.runPromise(readLocalAgentKey(filename))).rejects.toMatchObject({
      code: 'INVALID_LOCAL_SETUP',
    });
    await chmod(filename, 0o600);
    await writeFile(filename, JSON.stringify(new Array(64).fill(0)));
    await expect(Effect.runPromise(readLocalAgentKey(filename))).rejects.toMatchObject({
      code: 'INVALID_LOCAL_SETUP',
    });
    await writeFile(filename, 'x'.repeat(1025));
    await expect(Effect.runPromise(readLocalAgentKey(filename))).rejects.toMatchObject({
      code: 'INVALID_LOCAL_SETUP',
    });
    await expect(Effect.runPromise(readLocalAgentKey('agent.json'))).rejects.toMatchObject({
      code: 'INVALID_LOCAL_SETUP',
    });
  });

  it('requires --local and retains the loopback RPC boundary', async () => {
    const { filename, localFile, vaultConfig } = await fixture();
    await expect(
      Effect.runPromise(loadMcpConfig(['--agent-key-file', filename], {})),
    ).rejects.toMatchObject({ code: 'INVALID_OPTIONS' });
    await writeFile(
      localFile,
      JSON.stringify({
        kind: 'brim-local-only-v1',
        vaultConfig,
        agentKey: 'seeded-key-placeholder',
        rpcUrl: 'https://api.devnet.solana.com',
      }),
    );
    await expect(
      Effect.runPromise(loadMcpConfig(['--local', localFile, '--agent-key-file', filename], {})),
    ).rejects.toMatchObject({ code: 'INVALID_LOCAL_SETUP' });
  });
});
