import path from 'node:path';
import { Effect } from 'effect';
import { configuration } from '../../../scripts/local/config.ts';
import { readLocalContext } from './context.ts';

export const loadLocalContext = Effect.gen(function* () {
  const defaults = yield* configuration;
  return yield* readLocalContext(
    path.resolve(process.env.BRIM_LOCAL_CONFIG ?? defaults.file),
    process.env.BRIM_RPC_URL,
  );
});
