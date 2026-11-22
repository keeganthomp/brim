/**
 * Real SBF transaction tests against an isolated, disposable offline Surfpool.
 * Runs without a remote RPC datasource. The fixture resembles devnet USDC, but its
 * mint authority is an openly documented TEST key and all balances are fake.
 *
 * Build first: cargo build-sbf --manifest-path programs/brim/Cargo.toml \
 *   --tools-version v1.57 --arch v3 --features devnet -- --locked
 * Run: npm run test:chain (SURFPOOL_BIN can select a Surfpool binary)
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { open, mkdtemp, readFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createKeyPairSignerFromPrivateKeyBytes,
  generateKeyPairSigner,
  getAddressEncoder,
} from '@solana/kit';
import { seedSurfpool } from '../../../infra/local/surfpool/seed.ts';
import {
  DEVNET_GENESIS,
  assertLocalRpc,
  PROGRAM,
  MINT,
  TOKEN,
} from '../../../infra/local/surfpool/config.ts';
import {
  ATA,
  SYSTEM,
  readonly,
  writable,
  signer,
  writableSigner,
  u64,
  i64,
  u32,
  ix,
  pda,
  tokenAccount,
  createAta,
  createLocalClient,
  pause,
} from '../../../infra/local/surfpool/transactions.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const args = process.argv.slice(2);
function option(name, fallback) {
  const i = args.indexOf(name);
  return i < 0 ? fallback : args[i + 1];
}
const surfpoolBin = option('--surfpool', process.env.SURFPOOL_BIN ?? 'surfpool');
const attachUrl = option('--rpc-url');
const programFile = path.resolve(option('--program', path.join(root, 'target/deploy/brim.so')));
const rpcPort = Number(option('--rpc-port', '18899'));
assert(Number.isInteger(rpcPort) && rpcPort > 1024 && rpcPort < 65000, 'Invalid local RPC port');
const rpcUrl = attachUrl ?? `http://127.0.0.1:${rpcPort}`;
assertLocalRpc(rpcUrl);
const encoder = getAddressEncoder();
const utf8 = new TextEncoder();
let checks = 0;
const { rpc, send, confirm, accountBytes, tokenBalance } = createLocalClient(rpcUrl);
function passed(name) {
  console.log(`PASS ${name}`);
  checks++;
}
async function rejects(name, action, expectedCodes) {
  try {
    await action();
  } catch (error) {
    assert(
      error.signature,
      `${name}: expected a confirmed runtime failure, received ${error.stack}`,
    );
    if (expectedCodes) {
      const actual = error.details?.InstructionError?.[1]?.Custom;
      assert(
        expectedCodes.includes(actual),
        `${name}: expected custom ${expectedCodes}, got ${JSON.stringify(error.details)}`,
      );
    }
    passed(name);
    return;
  }
  assert.fail(`${name}: unexpectedly succeeded`);
}

await access(programFile);
const ledger = await mkdtemp(path.join(tmpdir(), 'brim-surfpool-'));
const logFile = path.join(ledger, 'process.log');
const output = await open(logFile, 'w');
const validator = attachUrl
  ? null
  : spawn(
      surfpoolBin,
      [
        'start',
        '--offline',
        '--genesis-hash',
        DEVNET_GENESIS,
        '--no-deploy',
        '--no-tui',
        '--no-studio',
        '--yes',
        '--host',
        '127.0.0.1',
        '--port',
        String(rpcPort),
        '--ws-port',
        String(rpcPort + 1),
        '--log-path',
        ledger,
        '--airdrop-amount',
        '0',
      ],
      { cwd: ledger, stdio: ['ignore', output.fd, output.fd] },
    );
let launchError;
validator?.on('error', (error) => {
  launchError = error;
});
try {
  let healthy = false;
  for (let i = 0; i < 180; i++) {
    if (launchError) throw launchError;
    if (validator && validator.exitCode !== null) {
      throw new Error(`Surfpool exited ${validator.exitCode}; ${await readFile(logFile, 'utf8')}`);
    }
    try {
      if ((await rpc('getHealth')) === 'ok') {
        healthy = true;
        break;
      }
    } catch {}
    await pause(500);
  }
  assert(healthy, `Surfpool did not become healthy: ${logFile}`);
  await seedSurfpool({ rpcUrl, programPath: programFile });
  const owner = await generateKeyPairSigner();
  const agent = await generateKeyPairSigner();
  const rogue = await generateKeyPairSigner();
  const merchant = await generateKeyPairSigner();
  // Public fixture key: seed [7;32]. Only valid on this disposable local ledger.
  const mintAuthority = await createKeyPairSignerFromPrivateKeyBytes(new Uint8Array(32).fill(7));
  await confirm(await rpc('requestAirdrop', [owner.address, 10_000_000_000]));
  await confirm(await rpc('requestAirdrop', [agent.address, 1_000_000_000]));
  const vault = await pda(PROGRAM, [
    utf8.encode('vault'),
    encoder.encode(owner.address),
    encoder.encode(MINT),
  ]);
  const vaultAta = await tokenAccount(vault);
  const merchantAta = await tokenAccount(merchant.address);
  const ownerAta = await tokenAccount(owner.address);
  const rogueAta = await tokenAccount(rogue.address);
  const policy = await pda(PROGRAM, [
    utf8.encode('agent'),
    encoder.encode(vault),
    encoder.encode(agent.address),
  ]);
  const init = ix('init_vault', [
    writableSigner(owner),
    signer(owner),
    readonly(MINT),
    writable(vault),
    writable(vaultAta),
    readonly(TOKEN),
    readonly(ATA),
    readonly(SYSTEM),
  ]);
  const limits = (max = 1_000_000n, budget = 2_000_000n) =>
    Buffer.concat([
      u64(max),
      u64(budget),
      i64(86_400),
      i64(0),
      Buffer.from([1]),
      u32(1),
      Buffer.from(encoder.encode(merchant.address)),
    ]);
  const upsert = (authority = owner, budget = 2_000_000n) =>
    ix(
      'upsert_agent_policy',
      [
        writableSigner(owner),
        signer(authority),
        writable(vault),
        writable(policy),
        readonly(SYSTEM),
      ],
      Buffer.from(encoder.encode(agent.address)),
      limits(1_000_000n, budget),
    );
  const freeze = (frozen, authority = owner) =>
    ix(
      'set_agent_frozen',
      [signer(authority), readonly(vault), writable(policy)],
      Buffer.from([Number(frozen)]),
    );
  const paused = (value) =>
    ix('set_vault_paused', [signer(owner), writable(vault)], Buffer.from([Number(value)]));
  const payment = (
    amount,
    authority = agent,
    recipient = merchant.address,
    destination = merchantAta,
    token = TOKEN,
    mint = MINT,
  ) =>
    ix(
      'execute_payment',
      [
        signer(authority),
        readonly(vault),
        writable(policy),
        readonly(mint),
        writable(vaultAta),
        readonly(recipient),
        writable(destination),
        readonly(token),
      ],
      u64(amount),
    );
  const withdraw = (amount) =>
    ix(
      'withdraw',
      [
        signer(owner),
        readonly(vault),
        readonly(MINT),
        writable(vaultAta),
        writable(ownerAta),
        readonly(TOKEN),
      ],
      u64(amount),
    );

  await send(owner, [createAta(owner, vault, vaultAta)]);
  await send(owner, [init]);
  passed('vault initializes when its predictable ATA already exists');
  await send(owner, [
    upsert(),
    createAta(owner, merchant.address, merchantAta),
    createAta(owner, owner.address, ownerAta),
    createAta(owner, rogue.address, rogueAta),
  ]);
  await send(owner, [
    {
      programAddress: TOKEN,
      accounts: [writable(MINT), writable(vaultAta), signer(mintAuthority)],
      data: Buffer.concat([Buffer.from([7]), u64(10_000_000)]),
    },
  ]);
  await send(agent, [payment(500_000)]);
  assert.equal(await tokenBalance(merchantAta), 500_000n);
  passed('agent-signed checked-transfer pays the merchant exact USDC base units');
  await rejects(
    'per-transaction cap enforced by runtime',
    () => send(agent, [payment(1_000_001)], true),
    [6003],
  );
  await send(agent, [payment(1_000_000)]);
  await rejects(
    'fixed-window total enforced by runtime',
    () => send(agent, [payment(600_000)], true),
    [6004],
  );
  await send(owner, [freeze(true)]);
  await rejects('frozen policy blocks payment', () => send(agent, [payment(1)], true), [6001]);
  await send(owner, [upsert(owner, 3_000_000n)]);
  const retained = await accountBytes(policy);
  assert.equal(retained[72], 1);
  assert.equal(retained.readBigUInt64LE(105), 1_500_000n);
  passed('policy update preserves frozen state and consumed budget');
  await rejects(
    'foreign owner cannot unfreeze',
    () => send(owner, [freeze(false, rogue)], true),
    [2001],
  );
  await rejects(
    'foreign owner cannot update policy',
    () => send(owner, [upsert(rogue)], true),
    [2001],
  );
  await send(owner, [freeze(false)]);
  await rejects(
    'different signing agent cannot reuse policy',
    () => send(owner, [payment(1, rogue)], true),
    [2006, 6010],
  );
  await rejects(
    'recipient allowlist enforced',
    () => send(agent, [payment(1, agent, rogue.address, rogueAta)], true),
    [6006],
  );
  await rejects('recipient ATA substitution rejected', () =>
    send(agent, [payment(1, agent, merchant.address, ownerAta)], true),
  );
  await rejects('token program substitution rejected', () =>
    send(agent, [payment(1, agent, merchant.address, merchantAta, SYSTEM)], true),
  );
  await rejects('mint account substitution rejected', () =>
    send(agent, [payment(1, agent, merchant.address, merchantAta, TOKEN, SYSTEM)], true),
  );
  await send(owner, [paused(true)]);
  await rejects('global pause blocks agents', () => send(agent, [payment(1)], true), [6000]);
  await send(owner, [withdraw(8_400_000)]);
  assert.equal(await tokenBalance(ownerAta), 8_400_000n);
  assert.equal(await tokenBalance(vaultAta), 100_000n);
  passed('owner can withdraw while globally paused');
  await send(owner, [paused(false)]);
  const before = await accountBytes(policy);
  await rejects(
    'insufficient token balance fails in checked-transfer CPI',
    () => send(agent, [payment(200_000)], true),
    [1],
  );
  assert.deepEqual(await accountBytes(policy), before);
  assert.equal(await tokenBalance(vaultAta), 100_000n);
  assert.equal(await tokenBalance(merchantAta), 1_500_000n);
  passed('failed checked-transfer CPI rolls back budget and timestamp writes');
  console.log(`\n${checks} local SBF integration checks passed. No external chain was contacted.`);
} catch (error) {
  console.error(`Surfpool logs: ${logFile}`);
  throw error;
} finally {
  if (validator) {
    validator.kill('SIGINT');
    await Promise.race([new Promise((resolve) => validator.once('exit', resolve)), pause(5000)]);
    if (validator.exitCode === null) validator.kill('SIGKILL');
  }
  await output.close();
}
