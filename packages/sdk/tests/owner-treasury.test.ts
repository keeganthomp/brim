import { AccountRole } from '@solana/kit';
import { Effect } from 'effect';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BRIM_DEVELOPMENT_PROGRAM_ADDRESS,
  BRIM_NETWORK_IDS,
  NETWORKS,
  createInitVaultInstruction,
  createVaultDepositInstructions,
  createVaultWithdrawInstructions,
  createSetAgentFrozenInstruction,
  findBrimPolicyAddress,
  findTokenAccount,
} from '../src/index.js';
import { SPONSOR, MERCHANT } from './sharedfixtures.js';
const base = {
  programAddress: BRIM_DEVELOPMENT_PROGRAM_ADDRESS,
  ownerAddress: SPONSOR,
  network: 'devnet' as const,
};
const roles = (instruction: { accounts?: readonly { address: string; role: AccountRole }[] }) =>
  instruction.accounts?.map((account) => [account.address, account.role]);
const amount = 0xffff_ffff_ffff_ffffn;
async function vault() {
  return Effect.runPromise(createInitVaultInstruction(base));
}

describe('browser-safe treasury instruction builders', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('derives canonical init accounts and matches Anchor account order/signature roles', async () => {
    const built = await vault();
    expect(built.network).toBe(BRIM_NETWORK_IDS.devnet);
    expect(built.mintAddress).toBe(NETWORKS[BRIM_NETWORK_IDS.devnet].mint);
    expect(built.vaultTokenAccount).toBe(
      await findTokenAccount(built.vaultAddress, built.mintAddress),
    );
    expect(Array.from(built.instruction.data!)).toEqual([77, 79, 85, 150, 33, 217, 52, 106]);
    expect(roles(built.instruction)).toEqual([
      [SPONSOR, AccountRole.WRITABLE_SIGNER],
      [SPONSOR, AccountRole.READONLY_SIGNER],
      [built.mintAddress, AccountRole.READONLY],
      [built.vaultAddress, AccountRole.WRITABLE],
      [built.vaultTokenAccount, AccountRole.WRITABLE],
      ['TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', AccountRole.READONLY],
      ['ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL', AccountRole.READONLY],
      ['11111111111111111111111111111111', AccountRole.READONLY],
    ]);
  });
  it('supports both official networks and a separate rent payer without guessing a mint', async () => {
    const devnet = await vault();
    const mainnet = await Effect.runPromise(
      createInitVaultInstruction({
        ...base,
        network: BRIM_NETWORK_IDS.mainnet,
        payerAddress: MERCHANT,
      }),
    );
    expect(mainnet.mintAddress).toBe(NETWORKS[BRIM_NETWORK_IDS.mainnet].mint);
    expect(mainnet.vaultAddress).not.toBe(devnet.vaultAddress);
    expect(mainnet.instruction.accounts![0]!.address).toBe(MERCHANT);
    expect(mainnet.instruction.accounts![1]!.address).toBe(SPONSOR);
  });
  it('constructs a six-decimal exact transfer from the canonical wallet ATA, with no allowance', async () => {
    const initial = await vault();
    const built = await Effect.runPromise(
      createVaultDepositInstructions({ ...base, vaultAddress: initial.vaultAddress, amount }),
    );
    expect(built.instructions).toHaveLength(2);
    const [ata, transfer] = built.instructions;
    expect(Array.from(ata!.data!)).toEqual([1]); // Idempotent associated-account creation.
    expect(ata!.programAddress).toBe('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
    expect(roles(ata!)).toEqual([
      [SPONSOR, AccountRole.WRITABLE_SIGNER],
      [built.vaultTokenAccount, AccountRole.WRITABLE],
      [built.vaultAddress, AccountRole.READONLY],
      [built.mintAddress, AccountRole.READONLY],
      ['11111111111111111111111111111111', AccountRole.READONLY],
      ['TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', AccountRole.READONLY],
    ]);
    expect(built.sourceTokenAccount).toBe(await findTokenAccount(SPONSOR, built.mintAddress));
    expect(transfer!.programAddress).toBe('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
    expect(transfer!.data).toHaveLength(10);
    expect(transfer!.data![0]).toBe(12);
    expect(transfer!.data![9]).toBe(6);
    expect(
      new DataView(transfer!.data!.buffer, transfer!.data!.byteOffset).getBigUint64(1, true),
    ).toBe(amount);
    expect(roles(transfer!)).toEqual([
      [built.sourceTokenAccount, AccountRole.WRITABLE],
      [built.mintAddress, AccountRole.READONLY],
      [built.vaultTokenAccount, AccountRole.WRITABLE],
      [SPONSOR, AccountRole.READONLY_SIGNER],
    ]);
  });
  it('creates the owner ATA idempotently before a correctly bound owner withdrawal', async () => {
    const initial = await vault();
    const built = await Effect.runPromise(
      createVaultWithdrawInstructions({ ...base, vaultAddress: initial.vaultAddress, amount }),
    );
    const [ata, withdraw] = built.instructions;
    expect(Array.from(ata!.data!)).toEqual([1]);
    expect(ata!.accounts![1]!.address).toBe(built.ownerTokenAccount);
    expect(ata!.accounts![2]!.address).toBe(SPONSOR);
    expect(built.ownerTokenAccount).toBe(await findTokenAccount(SPONSOR, built.mintAddress));
    expect(Array.from(withdraw!.data!.slice(0, 8))).toEqual([183, 18, 70, 156, 148, 109, 161, 34]);
    expect(
      new DataView(withdraw!.data!.buffer, withdraw!.data!.byteOffset).getBigUint64(8, true),
    ).toBe(amount);
    expect(roles(withdraw!)).toEqual([
      [SPONSOR, AccountRole.READONLY_SIGNER],
      [built.vaultAddress, AccountRole.READONLY],
      [built.mintAddress, AccountRole.READONLY],
      [built.vaultTokenAccount, AccountRole.WRITABLE],
      [built.ownerTokenAccount, AccountRole.WRITABLE],
      ['TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', AccountRole.READONLY],
    ]);
  });
  it.each([true, false])(
    'binds freeze/resume %s to the owner, vault and canonical agent policy',
    async (isFrozen) => {
      const initial = await vault();
      const built = await Effect.runPromise(
        createSetAgentFrozenInstruction({
          ...base,
          vaultAddress: initial.vaultAddress,
          agentKey: MERCHANT,
          isFrozen,
        }),
      );
      expect(built.policyAddress).toBe(
        await findBrimPolicyAddress(base.programAddress, built.vaultAddress, MERCHANT),
      );
      expect(Array.from(built.instruction.data!)).toEqual([
        0,
        76,
        94,
        23,
        53,
        142,
        144,
        55,
        Number(isFrozen),
      ]);
      expect(roles(built.instruction)).toEqual([
        [SPONSOR, AccountRole.READONLY_SIGNER],
        [built.vaultAddress, AccountRole.READONLY],
        [built.policyAddress, AccountRole.WRITABLE],
      ]);
    },
  );
  it.each([0n, -1n, 0x1_0000_0000_0000_0000n, 1, '1000000'])(
    'rejects invalid amount %s',
    async (bad) => {
      const initial = await vault();
      const input = { ...base, vaultAddress: initial.vaultAddress, amount: bad as bigint };
      await expect(Effect.runPromise(createVaultDepositInstructions(input))).rejects.toMatchObject({
        code: 'INVALID_CONFIG',
      });
      await expect(Effect.runPromise(createVaultWithdrawInstructions(input))).rejects.toMatchObject(
        { code: 'INVALID_CONFIG' },
      );
    },
  );
  it('rejects mismatched vault, source account, mint and network before wallet signing', async () => {
    const initial = await vault();
    await expect(
      Effect.runPromise(
        createVaultDepositInstructions({ ...base, vaultAddress: MERCHANT, amount: 1n }),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_CONFIG' });
    await expect(
      Effect.runPromise(
        createVaultDepositInstructions({
          ...base,
          vaultAddress: initial.vaultAddress,
          sourceTokenAccount: MERCHANT,
          amount: 1n,
        }),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_CONFIG' });
    await expect(
      Effect.runPromise(
        createInitVaultInstruction({
          ...base,
          mintAddress: NETWORKS[BRIM_NETWORK_IDS.mainnet].mint,
        }),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_CONFIG' });
    await expect(
      Effect.runPromise(
        createVaultWithdrawInstructions({
          ...base,
          network: 'mainnet',
          vaultAddress: initial.vaultAddress,
          amount: 1n,
        }),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_CONFIG' });
  });
  it('accepts an explicit canonical source and makes no RPC call', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const initial = await vault();
    const source = await findTokenAccount(SPONSOR, initial.mintAddress);
    await Effect.runPromise(
      createVaultDepositInstructions({
        ...base,
        vaultAddress: initial.vaultAddress,
        sourceTokenAccount: source,
        amount: 1n,
      }),
    );
    expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects invalid/default addresses, private-key-shaped input and extra authority fields', async () => {
    await expect(
      Effect.runPromise(
        createInitVaultInstruction({ ...base, ownerAddress: '11111111111111111111111111111111' }),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_CONFIG' });
    await expect(
      Effect.runPromise(
        createInitVaultInstruction({ ...base, ownerAddress: JSON.stringify(Array(64).fill(7)) }),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_CONFIG' });
    await expect(
      Effect.runPromise(
        createInitVaultInstruction({ ...base, ownerKey: 'not-accepted' } as typeof base),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_CONFIG' });
  });
});
