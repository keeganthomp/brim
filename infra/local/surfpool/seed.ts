/** Load the local SBF program and synthetic mint; never broadcasts externally. */
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Effect, Schema } from 'effect';
import { DEVNET_GENESIS, MINT, PROGRAM, TOKEN, localRpcEffect } from './config.ts';
import { decode, fromPromise, LocalSurfpoolError, run } from './effects.ts';

export interface SeedOptions {
  rpcUrl?: string | undefined;
  programPath?: string | undefined;
}
const Fixture = Schema.Struct({
  account: Schema.Struct({
    lamports: Schema.Number,
    data: Schema.Tuple([Schema.String, Schema.Literal('base64')]),
    owner: Schema.String,
    executable: Schema.Boolean,
    rentEpoch: Schema.Number,
  }),
});
const LoadedProgram = Schema.Struct({
  value: Schema.NullOr(Schema.Struct({ executable: Schema.Boolean })),
});
export function seedSurfpoolEffect({
  rpcUrl = 'http://127.0.0.1:8899',
  programPath = fileURLToPath(new URL('../../../target/deploy/brim.so', import.meta.url)),
}: SeedOptions = {}) {
  return Effect.gen(function* () {
    const rpc = (method: string, params?: readonly unknown[]) =>
      localRpcEffect(rpcUrl, method, params);
    if ((yield* rpc('getGenesisHash')) !== DEVNET_GENESIS)
      return yield* new LocalSurfpoolError({
        message: 'Start offline Surfpool with the configured devnet genesis hash.',
      });
    const binary = yield* fromPromise(
      () => readFile(programPath),
      'Missing SBF artifact. Run npm run chain:build first.',
    );
    const json = yield* fromPromise(
      () =>
        readFile(
          new URL('../../../programs/brim/tests/fixtures/usdc-mint.json', import.meta.url),
          'utf8',
        ),
      'Cannot read synthetic mint fixture.',
    );
    const fixture = yield* decode(Schema.fromJsonString(Fixture), json);
    yield* rpc('surfnet_writeProgram', [PROGRAM, binary.toString('hex'), 0]);
    const existing = yield* decode(
      Schema.Struct({ value: Schema.NullOr(Schema.Struct({ owner: Schema.String })) }),
      yield* rpc('getAccountInfo', [MINT]),
    );
    if (!existing.value)
      yield* rpc('surfnet_setAccount', [
        MINT,
        {
          ...fixture.account,
          data: Buffer.from(fixture.account.data[0], 'base64').toString('hex'),
        },
      ]);
    else if (existing.value.owner !== TOKEN)
      return yield* new LocalSurfpoolError({
        message: 'Existing local mint has an unexpected owner.',
      });
    const loaded = yield* decode(LoadedProgram, yield* rpc('getAccountInfo', [PROGRAM]));
    if (!loaded.value?.executable)
      return yield* new LocalSurfpoolError({
        message: 'Surfpool did not load the Brim executable.',
      });
    return { program: PROGRAM, mint: MINT };
  });
}
export const seedSurfpool = (options: SeedOptions = {}) => run(seedSurfpoolEffect(options));
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await seedSurfpool({
    rpcUrl: process.env.BRIM_RPC_URL,
    programPath: process.env.BRIM_PROGRAM_PATH,
  });
  console.log('Loaded Brim SBF and synthetic USDC into local Surfpool.');
}
