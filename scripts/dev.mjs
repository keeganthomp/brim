import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// Normalize preview-runner flags to Next's CLI, while preserving plain `npm run dev`.
const require = createRequire(import.meta.url);
const input = process.argv.slice(2);
const site = input[0] === '--site';
if (site) input.shift();
const args = ['dev'];
for (let i = 0; i < input.length; i++) {
  const option = input[i];
  if (option === '--strictPort') continue; // Next fails on an explicitly occupied port.
  if (option === '--host') {
    args.push('--hostname', input[++i] ?? '0.0.0.0');
    continue;
  }
  args.push(option);
}
if (!args.includes('--hostname')) args.push('--hostname', '0.0.0.0');
if (site && !args.includes('--port') && !args.includes('-p')) args.push('--port', '3200');
const child = spawn(process.execPath, [require.resolve('next/dist/bin/next'), ...args], {
  cwd: fileURLToPath(new URL(site ? '../apps/site' : '../apps/web', import.meta.url)),
  stdio: 'inherit',
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', (code) => process.exit(code ?? 1));
