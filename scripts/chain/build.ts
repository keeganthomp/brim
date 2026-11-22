/** Build local/devnet Brim SBF. Fresh machines require only Node 24 and Docker. */
import { access, mkdir, readFile, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { Data, Effect } from 'effect';
import { command, ChainBuildError } from './process.ts';

const root = path.resolve(import.meta.dirname, '../..');
const outputDirectory = path.join(root, 'target/deploy');
const pinsFile = path.join(import.meta.dirname, 'toolchain.env');
const tryIO = <A>(run: () => Promise<A>, message: string) =>
  Effect.tryPromise({
    try: run,
    catch: (cause) => new ChainBuildError({ message, cause }),
  });
const exists = (file: string) =>
  Effect.tryPromise(() => access(file, constants.X_OK)).pipe(
    Effect.match({ onFailure: () => false, onSuccess: () => true }),
  );

class NativeUnavailable extends Data.TaggedError('NativeUnavailable')<{ message: string }> {}

const loadPins = Effect.gen(function* () {
  const text = yield* tryIO(() => readFile(pinsFile, 'utf8'), 'Cannot read chain toolchain pins.');
  const pins = Object.fromEntries(
    text
      .split('\n')
      .filter((line) => /^[A-Z_]+=/.test(line))
      .map((line) => {
        const separator = line.indexOf('=');
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );
  const version = pins.AGAVE_VERSION;
  const platform = pins.PLATFORM_TOOLS_VERSION;
  if (!version || !/^\d+\.\d+\.\d+$/.test(version) || !platform || !/^v\d+\.\d+$/.test(platform)) {
    return yield* Effect.fail(
      new ChainBuildError({ message: 'Invalid pinned chain toolchain versions.' }),
    );
  }
  return { version, platform };
});

/** Reuse an already-installed pinned toolchain; fresh hosts use the reproducible Docker build. */
const findNative = (version: string, platform: string) =>
  Effect.gen(function* () {
    const candidates = [
      process.env.BRIM_AGAVE_BIN,
      ...(process.env.PATH ?? '').split(path.delimiter),
      path.join(path.dirname(root), 'toolchains/agave/bin'),
    ].filter((item): item is string => Boolean(item));
    for (const directory of new Set(candidates)) {
      const builder = path.join(directory, 'cargo-build-sbf');
      const solana = path.join(directory, 'solana');
      if (!(yield* exists(builder)) || !(yield* exists(solana))) continue;
      const installed = yield* command(solana, ['--version'], { cwd: root, capture: true }).pipe(
        Effect.match({ onFailure: () => '', onSuccess: (value) => value }),
      );
      if (
        !installed.startsWith(`solana-cli ${version} `) &&
        !installed.startsWith(`solana-cli ${version}\n`)
      )
        continue;
      const rustDirectories = [
        process.env.BRIM_RUST_BIN,
        path.join(homedir(), '.cargo/bin'),
        ...(process.env.PATH ?? '').split(path.delimiter),
      ].filter((item): item is string => Boolean(item));
      for (const rustDirectory of new Set(rustDirectories)) {
        if (
          !(yield* exists(path.join(rustDirectory, 'cargo'))) ||
          !(yield* exists(path.join(rustDirectory, 'rustup')))
        )
          continue;
        // Cached platform tools avoid implicit unverified downloads on the native fast path.
        const cachedRust = path.join(
          homedir(),
          '.cache/solana',
          platform,
          'platform-tools/rust/bin/rustc',
        );
        if (!(yield* exists(cachedRust))) continue;
        return {
          builder,
          env: {
            ...process.env,
            PATH: [directory, rustDirectory, process.env.PATH].filter(Boolean).join(path.delimiter),
          },
        };
      }
    }
    return yield* Effect.fail(
      new NativeUnavailable({
        message: `No cached Agave ${version}/${platform} toolchain available.`,
      }),
    );
  });

const build = Effect.gen(function* () {
  const pins = yield* loadPins;
  const args = process.argv.slice(2);
  if (
    args.some((arg) => arg !== '--docker' && arg !== '--native') ||
    (args.includes('--docker') && args.includes('--native'))
  ) {
    return yield* Effect.fail(
      new ChainBuildError({ message: 'Usage: npm run chain:build -- [--docker | --native]' }),
    );
  }
  yield* tryIO(() => mkdir(outputDirectory, { recursive: true }), 'Cannot create target/deploy.');
  const native = args.includes('--docker')
    ? undefined
    : yield* findNative(pins.version, pins.platform).pipe(
        Effect.catchTag('NativeUnavailable', (error) =>
          args.includes('--native')
            ? Effect.fail(new ChainBuildError({ message: error.message }))
            : Effect.succeed(undefined),
        ),
      );
  if (native) {
    yield* Effect.logInfo(
      `Building devnet SBF with cached Agave ${pins.version}, platform-tools ${pins.platform}.`,
    );
    yield* command(
      native.builder,
      [
        '--manifest-path',
        'programs/brim/Cargo.toml',
        '--tools-version',
        pins.platform,
        '--arch',
        'v3',
        '--features',
        'devnet',
        '--skip-tools-install',
        '--sbf-out-dir',
        outputDirectory,
        '--',
        '--locked',
      ],
      { cwd: root, env: native.env },
    );
  } else {
    yield* Effect.logInfo(
      'Building devnet SBF with Docker; no host Rust or Solana installation required.',
    );
    yield* command('docker', ['info', '--format', '{{.ServerVersion}}'], {
      cwd: root,
      capture: true,
    });
    const caCertificate = process.env.BRIM_BUILD_CA_CERT;
    if (caCertificate)
      yield* tryIO(() => access(caCertificate), 'BRIM_BUILD_CA_CERT is not readable.');
    yield* command(
      'docker',
      [
        'build',
        '--platform',
        'linux/amd64',
        '--file',
        'scripts/chain/Dockerfile',
        '--target',
        'artifact',
        '--output',
        `type=local,dest=${outputDirectory}`,
        ...(caCertificate ? ['--secret', `id=brim_ca,src=${path.resolve(caCertificate)}`] : []),
        '.',
      ],
      { cwd: root },
    );
  }
  const artifact = path.join(outputDirectory, 'brim.so');
  const info = yield* tryIO(() => stat(artifact), 'Build did not produce target/deploy/brim.so.');
  const data = yield* tryIO(() => readFile(artifact), 'Cannot verify the built SBF artifact.');
  if (
    info.size < 64 ||
    data.subarray(0, 4).toString('hex') !== '7f454c46' ||
    data[4] !== 2 ||
    data[5] !== 1 ||
    data.readUInt16LE(18) !== 247
  ) {
    return yield* Effect.fail(
      new ChainBuildError({
        message: 'Built artifact is not a 64-bit little-endian BPF ELF program.',
      }),
    );
  }
  yield* Effect.logInfo(`Local/devnet program built: target/deploy/brim.so (${info.size} bytes).`);
});

const abort = new AbortController();
process.once('SIGINT', () => abort.abort());
process.once('SIGTERM', () => abort.abort());
await Effect.runPromise(build, { signal: abort.signal }).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
