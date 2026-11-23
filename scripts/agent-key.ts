/** Generate one scoped agent identity without printing its private key. */
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createKeyPairSignerFromPrivateKeyBytes, getAddressEncoder } from '@solana/kit';
import { Data, Effect } from 'effect';

class AgentKeyError extends Data.TaggedError('AgentKeyError')<{ message: string }> {}

export function generateAgentKey(output: string) {
  return Effect.gen(function* () {
    const filename = path.resolve(output);
    const identity = yield* Effect.tryPromise({
      try: async () => {
        const seed = randomBytes(32);
        const signer = await createKeyPairSignerFromPrivateKeyBytes(seed);
        const bytes = [...seed, ...getAddressEncoder().encode(signer.address)];
        return { publicKey: signer.address, encoded: JSON.stringify(bytes) + '\n' };
      },
      catch: () => new AgentKeyError({ message: 'Could not generate a scoped agent key.' }),
    });
    yield* Effect.tryPromise({
      try: async () => {
        await mkdir(path.dirname(filename), { recursive: true, mode: 0o700 });
        await writeFile(filename, identity.encoded, { mode: 0o600, flag: 'wx' });
      },
      catch: (error) =>
        new AgentKeyError({
          message:
            (error as NodeJS.ErrnoException).code === 'EEXIST'
              ? 'Key file already exists. Choose another --out path; existing keys are never replaced.'
              : 'Could not write the private key file. Choose a writable private --out path.',
        }),
    });
    return { publicKey: identity.publicKey, keyFile: filename };
  });
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const args = process.argv.slice(2);
  if (args.length === 1 && (args[0] === '--help' || args[0] === '-h')) {
    console.log('Usage: npm run agent:key -- --out .brim/research-agent.json');
    console.log('Writes a new mode-0600 keypair file. Prints only its public key and path.');
  } else if (args.length !== 2 || args[0] !== '--out' || !args[1]) {
    console.error('Use --out PATH to choose a new private agent key file. No key was written.');
    process.exitCode = 1;
  } else {
    await Effect.runPromise(generateAgentKey(args[1])).then(
      (result) => console.log(JSON.stringify(result)),
      (error) => {
        console.error(
          error instanceof AgentKeyError ? error.message : 'Agent key generation failed.',
        );
        process.exitCode = 1;
      },
    );
  }
}
