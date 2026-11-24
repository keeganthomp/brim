import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Wallet } from '@wallet-standard/base';
import { Effect } from 'effect';
import { getAddressEncoder } from '@solana/kit';
const registry = vi.hoisted(() => ({ wallets: [] as Wallet[] }));
vi.mock('@wallet-standard/app', () => ({ getWallets: () => ({ get: () => registry.wallets }) }));
import {
  connectOwnerWallet,
  discoverOwnerWallets,
  readOwnerWalletReadiness,
  initializeOwnerVault,
  depositOwnerFunds,
  withdrawOwnerFunds,
  setOwnerAgentFrozen,
} from '../lib/live/owner-wallet';
import { ownerFixture } from './fixtures/owner-wallet';

afterEach(() => {
  vi.unstubAllGlobals();
  registry.wallets = [];
});
const connect = async (f: Awaited<ReturnType<typeof ownerFixture>>) => {
  const choices = await Effect.runPromise(discoverOwnerWallets(f.deployment));
  return Effect.runPromise(connectOwnerWallet(choices[0]!, f.deployment));
};
const sent = (f: Awaited<ReturnType<typeof ownerFixture>>) =>
  f.rpc.mock.calls.filter(
    ([, init]) => JSON.parse(String(init?.body)).method === 'sendTransaction',
  );

describe('owner wallet treasury', () => {
  it('keeps multiple owner accounts explicit even within one wallet', async () => {
    const f = await ownerFixture(registry);
    f.state.accounts = [
      f.account,
      {
        ...f.account,
        address: f.agent.address,
        publicKey: new Uint8Array(getAddressEncoder().encode(f.agent.address)),
      },
    ];
    const choices = await Effect.runPromise(discoverOwnerWallets(f.deployment));
    expect(choices.map((choice) => choice.ownerAddress)).toEqual([
      f.owner.address,
      f.agent.address,
    ]);
    expect(new Set(choices.map((choice) => choice.id)).size).toBe(2);
    await expect(
      Effect.runPromise(
        connectOwnerWallet(
          { id: 'unselected', wallet: f.wallet, name: f.wallet.name, connected: true },
          f.deployment,
        ),
      ),
    ).rejects.toMatchObject({ code: 'OWNER_SELECTION_REQUIRED' });
    const connection = await Effect.runPromise(connectOwnerWallet(choices[1]!, f.deployment));
    expect(connection.ownerAddress).toBe(f.agent.address);
    expect(connection.vaultAddress).not.toBe(f.vault);
  });
  it('connects before a vault exists and derives only the selected owner vault', async () => {
    const f = await ownerFixture(registry);
    f.treasury.initialized = false;
    const connected = await connect(f);
    expect(connected).toMatchObject({
      ownerAddress: f.owner.address,
      vaultAddress: f.vault,
      initialized: false,
    });
    expect(connected.vaultConfig).toBe(f.config.vaultConfig);
    expect(f.sign).not.toHaveBeenCalled();
  });
  it('reads funding readiness without signing, including a missing USDC account', async () => {
    const f = await ownerFixture(registry);
    f.treasury.ownerHasAta = false;
    const ready = await Effect.runPromise(readOwnerWalletReadiness(await connect(f), f.deployment));
    expect(ready).toMatchObject({ initialized: true, solBalance: 1_000_000_000n, usdcBalance: 0n });
    expect(f.sign).not.toHaveBeenCalled();
  });
  it('creates a missing owner vault and reads it back', async () => {
    const f = await ownerFixture(registry);
    f.treasury.initialized = false;
    const result = await Effect.runPromise(initializeOwnerVault(await connect(f), f.deployment));
    expect(result.vaultAddress).toBe(f.vault);
    expect(f.treasury.initialized).toBe(true);
    expect(sent(f)).toHaveLength(1);
  });
  it.each(['existing', 'undeployed'] as const)(
    'refuses %s vault creation before approval',
    async (kind) => {
      const f = await ownerFixture(registry);
      f.treasury.initialized = kind === 'existing';
      f.treasury.programAvailable = kind !== 'undeployed';
      await expect(
        Effect.runPromise(initializeOwnerVault(await connect(f), f.deployment)),
      ).rejects.toMatchObject({
        code: kind === 'existing' ? 'VAULT_EXISTS' : 'PROGRAM_UNAVAILABLE',
      });
      expect(f.sign).not.toHaveBeenCalled();
    },
  );
  it('deposits and withdraws exact USDC amounts through the reviewed messages', async () => {
    const f = await ownerFixture(registry);
    const connection = await connect(f);
    await Effect.runPromise(depositOwnerFunds(connection, f.deployment, { amount: 2_500_001n }));
    expect(f.treasury.ownerBalance).toBe(97_499_999n);
    expect(f.treasury.vaultBalance).toBe(52_500_001n);
    await Effect.runPromise(withdrawOwnerFunds(connection, f.deployment, { amount: 500_001n }));
    expect(f.treasury.ownerBalance).toBe(98_000_000n);
    expect(f.treasury.vaultBalance).toBe(52_000_000n);
    expect(sent(f)).toHaveLength(2);
  });
  it.each(['deposit', 'withdraw'] as const)(
    'refuses insufficient %s balances before approval',
    async (direction) => {
      const f = await ownerFixture(registry);
      const action = direction === 'deposit' ? depositOwnerFunds : withdrawOwnerFunds;
      await expect(
        Effect.runPromise(action(await connect(f), f.deployment, { amount: 101_000_000n })),
      ).rejects.toMatchObject({ code: 'INSUFFICIENT_USDC' });
      expect(f.sign).not.toHaveBeenCalled();
    },
  );
  it.each([0n, -1n, 0x1_0000_0000_0000_0000n])(
    'refuses invalid atomic amount %s before signing',
    async (amount) => {
      const f = await ownerFixture(registry);
      await expect(
        Effect.runPromise(depositOwnerFunds(await connect(f), f.deployment, { amount })),
      ).rejects.toMatchObject({ code: 'INVALID_TRANSACTION' });
      expect(f.sign).not.toHaveBeenCalled();
    },
  );
  it('freezes and resumes only an existing policy, then reads back the flag', async () => {
    const f = await ownerFixture(registry);
    const connection = await connect(f);
    await expect(
      Effect.runPromise(
        setOwnerAgentFrozen(connection, f.deployment, {
          agentKey: f.agent.address,
          isFrozen: true,
        }),
      ),
    ).rejects.toMatchObject({ code: 'POLICY_MISSING' });
    f.state.policy = f.policyData();
    for (const isFrozen of [true, false]) {
      await Effect.runPromise(
        setOwnerAgentFrozen(connection, f.deployment, { agentKey: f.agent.address, isFrozen }),
      );
      expect(f.state.policy[72]).toBe(Number(isFrozen));
    }
    expect(sent(f)).toHaveLength(2);
  });
  it.each(['message', 'signature', 'account'] as const)(
    'rejects a changed treasury %s before broadcast',
    async (kind) => {
      const f = await ownerFixture(registry);
      const connection = await connect(f);
      f.state.alterMessage = kind === 'message';
      f.state.alterSignature = kind === 'signature';
      f.state.disconnectOnSign = kind === 'account';
      await expect(
        Effect.runPromise(depositOwnerFunds(connection, f.deployment, { amount: 1n })),
      ).rejects.toMatchObject({
        code: kind === 'account' ? 'WALLET_CHANGED' : 'INVALID_WALLET_TRANSACTION',
      });
      expect(sent(f)).toHaveLength(0);
    },
  );
  it.each(['send', 'confirm'] as const)(
    'preserves a known signature for uncertain treasury %s',
    async (phase) => {
      const f = await ownerFixture(registry);
      const connection = await connect(f);
      f.state.sendFailure = phase === 'send';
      f.state.confirmFailure = phase === 'confirm';
      await expect(
        Effect.runPromise(depositOwnerFunds(connection, f.deployment, { amount: 1n })),
      ).rejects.toMatchObject({ code: 'TREASURY_OUTCOME_UNKNOWN', signature: expect.any(String) });
      expect(sent(f)).toHaveLength(1);
    },
  );
  it.each([undefined, [], [{}]])(
    'refuses malformed wallet output before broadcast',
    async (output) => {
      const f = await ownerFixture(registry);
      const connection = await connect(f);
      f.sign.mockResolvedValueOnce(output as never);
      await expect(
        Effect.runPromise(depositOwnerFunds(connection, f.deployment, { amount: 1n })),
      ).rejects.toMatchObject({ code: 'INVALID_WALLET_TRANSACTION' });
      expect(sent(f)).toHaveLength(0);
    },
  );
  it('rechecks source funding after wallet approval', async () => {
    const f = await ownerFixture(registry);
    const connection = await connect(f);
    const sign = f.sign.getMockImplementation()!;
    f.sign.mockImplementationOnce(async (input) => {
      const output = await sign(input);
      f.treasury.ownerBalance = 0n;
      return output;
    });
    await expect(
      Effect.runPromise(depositOwnerFunds(connection, f.deployment, { amount: 1n })),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_USDC' });
    expect(sent(f)).toHaveLength(0);
  });
});
