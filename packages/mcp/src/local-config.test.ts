import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Effect } from 'effect';
import { readLocalConfiguration } from './local-config.js';

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
