import path from 'node:path';
import { Data, Effect, Schema } from 'effect';

export const root = path.resolve(import.meta.dirname, '../..');
export class LocalSetupError extends Data.TaggedError('LocalSetupError')<{ message: string }> {}

function port(value: string | undefined, fallback: number) {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < 1024 || parsed > 65535) {
    throw new LocalSetupError({ message: 'Local ports must be integers between 1024 and 65535.' });
  }
  return parsed;
}

export const configuration = Effect.try({
  try: () => {
    const rpcPort = port(process.env.BRIM_RPC_PORT, 8899);
    const dbPort = port(process.env.BRIM_DB_PORT, 54329);
    const webPort = port(process.env.BRIM_WEB_PORT, 3000);
    const testRpcPort = port(process.env.BRIM_TEST_RPC_PORT, 18899);
    return {
      rpcPort,
      dbPort,
      testRpcPort,
      rpcUrl: `http://127.0.0.1:${rpcPort}`,
      databaseUrl: `postgresql://brim:brim-local-only@127.0.0.1:${dbPort}/brim`,
      webPort,
      file: path.join(root, '.brim/local.json'),
    };
  },
  catch: () =>
    new LocalSetupError({
      message: 'Invalid local ports. Check BRIM_RPC_PORT, BRIM_DB_PORT and BRIM_WEB_PORT.',
    }),
});

export const LocalVaultMetadata = Schema.Struct({
  programAddress: Schema.String,
  vaultAddress: Schema.String,
  rpcUrl: Schema.String,
});
