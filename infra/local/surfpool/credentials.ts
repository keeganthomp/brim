/** Fake local-ledger credentials. Never printed or reused outside Surfpool. */
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, writeFile, chmod } from 'node:fs/promises';
import path from 'node:path';
import {
  createKeyPairSignerFromPrivateKeyBytes,
  createKeyPairSignerFromBytes,
  getAddressEncoder,
} from '@solana/kit';
import { Effect, Schema } from 'effect';
import { createBrimVaultConfig } from '@brim/sdk';
import { PROGRAM } from './config.ts';
import { attempt, decode, fromPromise, LocalSurfpoolError } from './effects.ts';

export const NETWORK = 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1' as const;
const KeyBytes = Schema.Array(
  Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 0, maximum: 255 })),
).check(Schema.isBetweenLength(64, 64));
const LocalConfigFile = Schema.fromJsonString(
  Schema.Struct({
    kind: Schema.Literal('brim-local-only-v1'),
    rpcUrl: Schema.String,
    network: Schema.Literal(NETWORK),
    programAddress: Schema.Literal(PROGRAM),
    vaultAddress: Schema.String,
    merchantAddress: Schema.String,
    ownerKey: Schema.String,
    agentKey: Schema.String,
    facilitatorKey: Schema.String,
    ownerAddress: Schema.String,
    agentAddress: Schema.String,
    facilitatorAddress: Schema.String,
    vaultConfig: Schema.optionalKey(Schema.String),
    card: Schema.optionalKey(Schema.String), // Existing local fixtures and shell commands.
  }),
);
export type LocalConfig = typeof LocalConfigFile.Type & { vaultConfig: string };
export function localSignerEffect(key: string) {
  return Effect.gen(function* () {
    const bytes = yield* decode(Schema.fromJsonString(KeyBytes), key);
    return yield* fromPromise(
      () => createKeyPairSignerFromBytes(new Uint8Array(bytes)),
      'Cannot load a local-only key.',
    );
  });
}
export function newIdentityEffect() {
  return Effect.gen(function* () {
    const seed = yield* attempt(() => randomBytes(32), 'Could not create a local-only key.');
    const signer = yield* fromPromise(
      () => createKeyPairSignerFromPrivateKeyBytes(seed),
      'Could not create a local signer.',
    );
    const bytes = Buffer.concat([seed, Buffer.from(getAddressEncoder().encode(signer.address))]);
    return { signer, key: JSON.stringify(Array.from(bytes)) };
  });
}
export function readCredentialsEffect(filename: string) {
  return Effect.gen(function* () {
    const text = yield* fromPromise(async () => {
      try {
        return await readFile(filename, 'utf8');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw error;
      }
    }, 'Cannot read local credentials.');
    if (text === null) return null;
    const config = yield* decode(LocalConfigFile, text);
    const vaultConfig = config.vaultConfig ?? config.card;
    if (vaultConfig === undefined) {
      return yield* new LocalSurfpoolError({ message: 'Local vault config is missing.' });
    }
    return { ...config, vaultConfig };
  });
}
export function saveCredentialsEffect(filename: string, config: LocalConfig) {
  return fromPromise(async () => {
    await mkdir(path.dirname(filename), { recursive: true, mode: 0o700 });
    const temporary = `${filename}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify(config, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    await rename(temporary, filename);
    await chmod(filename, 0o600);
  }, 'Could not persist local credentials.');
}
export const localVaultConfig = (vaultAddress: string, facilitatorAddress: string) =>
  createBrimVaultConfig({
    vaultAddress,
    programAddress: PROGRAM,
    network: NETWORK,
    facilitatorFeePayers: [facilitatorAddress],
  });
