/** Benign state-transition regressions against the isolated fake-fund chain. */
import assert from 'node:assert/strict';
import { generateKeyPairSigner, getAddressEncoder } from '@solana/kit';
import { PROGRAM, MINT, TOKEN } from '../../../infra/local/surfpool/config.ts';
import {
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
} from '../../../infra/local/surfpool/transactions.ts';

export async function checkPolicyInvariants({
  owner,
  merchant,
  merchantAta,
  vault,
  vaultAta,
  mintAuthority,
  client,
  passed,
}) {
  const { rpc, send, accountBytes, tokenBalance } = client;
  const encoder = getAddressEncoder();
  await send(owner, [
    {
      programAddress: TOKEN,
      accounts: [writable(MINT), writable(vaultAta), signer(mintAuthority)],
      data: Buffer.concat([Buffer.from([7]), u64(10_000_000)]),
    },
  ]);

  async function newPolicy(duration, spacing) {
    const agent = await generateKeyPairSigner();
    const policy = await pda(PROGRAM, [
      new TextEncoder().encode('agent'),
      encoder.encode(vault),
      encoder.encode(agent.address),
    ]);
    const limits = Buffer.concat([
      u64(1_000_000),
      u64(1_000_000),
      i64(duration),
      i64(spacing),
      Buffer.from([1]),
      u32(1),
      Buffer.from(encoder.encode(merchant.address)),
    ]);
    await send(owner, [
      ix(
        'upsert_agent_policy',
        [writableSigner(owner), signer(owner), writable(vault), writable(policy), readonly(SYSTEM)],
        Buffer.from(encoder.encode(agent.address)),
        limits,
      ),
    ]);
    const pay = (amount) =>
      ix(
        'execute_payment',
        [
          signer(agent),
          readonly(vault),
          writable(policy),
          readonly(MINT),
          writable(vaultAta),
          readonly(merchant.address),
          writable(merchantAta),
          readonly(TOKEN),
        ],
        u64(amount),
      );
    return { policy, pay };
  }

  const spaced = await newPolicy(120, 60);
  await send(owner, [spaced.pay(1_000_000)]);
  const before = await accountBytes(spaced.policy);
  await assert.rejects(
    () => send(owner, [spaced.pay(1)], true),
    (error) => !!error.signature && error.details?.InstructionError?.[1]?.Custom === 6005,
  );
  assert.deepEqual(await accountBytes(spaced.policy), before);
  passed('minimum spacing rejects an early payment without changing policy state');

  const boundary = before.readBigInt64LE(97) + 120n;
  // Surfpool's RPC takes milliseconds; the program's Clock uses seconds.
  await rpc('surfnet_timeTravel', [{ absoluteTimestamp: Number(boundary * 1000n) }]);
  await send(owner, [spaced.pay(300_000)]);
  const renewed = await accountBytes(spaced.policy);
  assert(renewed.readBigInt64LE(97) >= boundary);
  assert.equal(renewed.readBigUInt64LE(105), 300_000n);
  passed('an expired spending window starts fresh on the next accepted payment');

  const concurrent = await newPolicy(86_400, 0);
  const merchantBefore = await tokenBalance(merchantAta);
  const results = await Promise.allSettled([
    send(owner, [concurrent.pay(600_000)], true),
    send(owner, [concurrent.pay(600_000)], true),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  const rejected = results.find((result) => result.status === 'rejected');
  assert.equal(rejected?.reason.details?.InstructionError?.[1]?.Custom, 6004);
  assert.equal((await accountBytes(concurrent.policy)).readBigUInt64LE(105), 600_000n);
  assert.equal((await tokenBalance(merchantAta)) - merchantBefore, 600_000n);
  passed('concurrent payments serialize consumption of the same remaining budget');
}
