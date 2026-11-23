import { describe, expect, it } from 'vitest';
import { Effect } from 'effect';
import { AccountRole, address, getAddressEncoder } from '@solana/kit';
import {
  createUpsertAgentPolicyInstruction,
  findBrimPolicyAddress,
  type OwnerPolicyLimits,
} from '../src/index.js';
import { config, MERCHANT, SPONSOR } from './sharedfixtures.js';

const limits: OwnerPolicyLimits = {
  maxPerTx: 1_000_000n,
  windowLimit: 50_000_000n,
  windowDuration: 86_400n,
  minTxInterval: 2n,
  allowlistEnabled: true,
  allowlist: [MERCHANT],
};
const input = {
  programAddress: config.programAddress,
  vaultAddress: config.vaultAddress,
  ownerAddress: SPONSOR,
  agentKey: MERCHANT,
  limits,
};
describe('browser-safe owner policy instruction', () => {
  it('matches the deployed Anchor discriminator, field order, widths, and signer roles', async () => {
    const { instruction, policyAddress } = await Effect.runPromise(
      createUpsertAgentPolicyInstruction(input),
    );
    expect(instruction.programAddress).toBe(input.programAddress);
    expect(policyAddress).toBe(
      await findBrimPolicyAddress(input.programAddress, input.vaultAddress, input.agentKey),
    );
    expect(instruction.accounts?.map((account) => [account.address, account.role])).toEqual([
      [SPONSOR, AccountRole.WRITABLE_SIGNER],
      [SPONSOR, AccountRole.READONLY_SIGNER],
      [input.vaultAddress, AccountRole.WRITABLE],
      [policyAddress, AccountRole.WRITABLE],
      ['11111111111111111111111111111111', AccountRole.READONLY],
    ]);
    const data = instruction.data!;
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    expect(Array.from(data.slice(0, 8))).toEqual([67, 112, 105, 134, 177, 7, 231, 252]);
    expect(Array.from(data.slice(8, 40))).toEqual(
      Array.from(getAddressEncoder().encode(address(MERCHANT))),
    );
    expect([
      view.getBigUint64(40, true),
      view.getBigUint64(48, true),
      view.getBigInt64(56, true),
      view.getBigInt64(64, true),
    ]).toEqual([1_000_000n, 50_000_000n, 86_400n, 2n]);
    expect(data[72]).toBe(1);
    expect(view.getUint32(73, true)).toBe(1);
    expect(data).toHaveLength(109);
    expect(Array.from(data.slice(77))).toEqual(
      Array.from(getAddressEncoder().encode(address(MERCHANT))),
    );
  });
  it('preserves deny-all semantics and full integer precision', async () => {
    const { instruction } = await Effect.runPromise(
      createUpsertAgentPolicyInstruction({
        ...input,
        limits: {
          ...limits,
          maxPerTx: 0xffff_ffff_ffff_ffffn,
          windowLimit: 0xffff_ffff_ffff_ffffn,
          allowlist: [],
        },
      }),
    );
    expect(instruction.data).toHaveLength(77);
    expect(instruction.data![72]).toBe(1);
    expect(
      new DataView(instruction.data!.buffer, instruction.data!.byteOffset).getBigUint64(40, true),
    ).toBe(0xffff_ffff_ffff_ffffn);
  });
  it.each([
    { maxPerTx: 0n },
    { windowLimit: 1n },
    { windowDuration: 0n },
    { windowDuration: 0x8000_0000_0000_0000n },
    { minTxInterval: -1n },
    { allowlist: [MERCHANT, MERCHANT] },
    { allowlist: Array(17).fill(MERCHANT) },
    { allowlist: ['11111111111111111111111111111111'] },
  ])('rejects invalid contract limits before instruction construction', async (invalid) => {
    await expect(
      Effect.runPromise(
        createUpsertAgentPolicyInstruction({ ...input, limits: { ...limits, ...invalid } }),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_CONFIG' });
  });
  it('requires a nondefault agent key and supports an explicit independent payer', async () => {
    await expect(
      Effect.runPromise(
        createUpsertAgentPolicyInstruction({
          ...input,
          agentKey: '11111111111111111111111111111111',
        }),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_CONFIG' });
    const { instruction } = await Effect.runPromise(
      createUpsertAgentPolicyInstruction({ ...input, payerAddress: MERCHANT }),
    );
    expect(instruction.accounts![0]?.address).toBe(MERCHANT);
  });
});
