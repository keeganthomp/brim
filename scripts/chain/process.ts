import { spawn } from 'node:child_process';
import { Data, Effect } from 'effect';

export class ChainBuildError extends Data.TaggedError('ChainBuildError')<{
  message: string;
  cause?: unknown;
}> {}

export interface CommandOptions {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  capture?: boolean;
}

/** Managed child process: exit errors enter the Effect error channel, cancellation stops the child. */
export const command = (executable: string, args: readonly string[], options: CommandOptions) =>
  Effect.callback<string, ChainBuildError>((resume) => {
    const child = spawn(executable, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    });
    let output = '';
    if (options.capture) {
      child.stdout?.on('data', (chunk) => {
        output = (output + String(chunk)).slice(-16000);
      });
      child.stderr?.on('data', (chunk) => {
        output = (output + String(chunk)).slice(-16000);
      });
    }
    child.once('error', (cause) =>
      resume(
        Effect.fail(
          new ChainBuildError({
            message: `Unable to launch ${executable}.`,
            cause,
          }),
        ),
      ),
    );
    child.once('close', (code, signal) =>
      resume(
        code === 0
          ? Effect.succeed(output.trim())
          : Effect.fail(
              new ChainBuildError({
                message: `${executable} failed (${signal ?? code}).${output ? `\n${output}` : ''}`,
              }),
            ),
      ),
    );
    return Effect.sync(() => {
      if (child.exitCode === null) child.kill('SIGTERM');
    });
  });
