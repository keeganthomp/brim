import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Wallet } from '@wallet-standard/base';
import { Effect } from 'effect';
const registry = vi.hoisted(() => ({ wallets: [] as Wallet[] }));
vi.mock('@wallet-standard/app', () => ({ getWallets: () => ({ get: () => registry.wallets }) }));
import {
  connectOwnerWallet,
  discoverOwnerWallets,
  submitOwnerPolicy,
} from '../lib/live/owner-wallet';
import { OWNER_LIMITS, ownerFixture } from './fixtures/owner-wallet';

afterEach(() => {
  vi.unstubAllGlobals();
  registry.wallets = [];
});
const connection = async (f: Awaited<ReturnType<typeof ownerFixture>>) => {
  const choices = await Effect.runPromise(discoverOwnerWallets(f.config));
  return Effect.runPromise(connectOwnerWallet(choices[0]!, f.config));
};
const sent = (f: Awaited<ReturnType<typeof ownerFixture>>) =>
  f.rpc.mock.calls.filter(
    ([, init]) => JSON.parse(String(init?.body)).method === 'sendTransaction',
  );

describe('owner wallet policy workflow', () => {
  it('prioritizes matching connected accounts and reuses them without another connection prompt', async () => {
    const f = await ownerFixture(registry);
    const choices = await Effect.runPromise(discoverOwnerWallets(f.config));
    expect(choices).toHaveLength(1);
    expect(choices[0]?.connected).toBe(true);
    const again = await Effect.runPromise(discoverOwnerWallets(f.config));
    expect(again[0]?.id).toBe(choices[0]?.id);
    const connected = await Effect.runPromise(connectOwnerWallet(choices[0]!, f.config));
    expect(connected.ownerAddress).toBe(f.owner.address);
    expect(f.connect).not.toHaveBeenCalled();
  });
  it('offers supported disconnected wallets and requests their owner account when selected', async () => {
    const f = await ownerFixture(registry);
    f.state.accounts = [];
    const choices = await Effect.runPromise(discoverOwnerWallets(f.config));
    expect(choices[0]?.connected).toBe(false);
    await Effect.runPromise(connectOwnerWallet(choices[0]!, f.config));
    expect(f.connect).toHaveBeenCalledTimes(1);
  });
  it('keeps wallet choices explicit if more than one supports the configured chain', async () => {
    const f = await ownerFixture(registry);
    registry.wallets = [{ ...f.wallet, name: 'Second provider' }, f.wallet];
    const choices = await Effect.runPromise(discoverOwnerWallets(f.config));
    expect(choices.map((value) => value.name)).toEqual([
      'Second provider',
      'Synthetic owner wallet',
    ]);
    expect(new Set(choices.map((value) => value.id)).size).toBe(2);
  });
  it('refuses a wallet that cannot sign v0 and never requests signing', async () => {
    const f = await ownerFixture(registry);
    f.signFeature.supportedTransactionVersions = [1];
    expect(await Effect.runPromise(discoverOwnerWallets(f.config))).toHaveLength(0);
    expect(f.sign).not.toHaveBeenCalled();
  });
  it('signs only the reviewed owner instruction, submits once, confirms, and reads back', async () => {
    const f = await ownerFixture(registry);
    const connected = await connection(f);
    const result = await Effect.runPromise(submitOwnerPolicy(connected, f.config, f.input));
    expect(result.signature).toMatch(/^[1-9A-HJ-NP-Za-km-z]{64,88}$/);
    expect(result.policyAddress).toBeTruthy();
    expect(f.sign).toHaveBeenCalledTimes(1);
    expect(sent(f)).toHaveLength(1);
    expect(f.sign.mock.calls[0]?.[0]).toMatchObject({ account: f.account, chain: 'solana:devnet' });
  });
  it.each(['exists', 'missing', 'duration'] as const)(
    'refuses unsafe %s policy intent before wallet approval',
    async (kind) => {
      const f = await ownerFixture(registry);
      if (kind !== 'missing') f.state.policy = f.policyData();
      const connected = await connection(f);
      const input = {
        ...f.input,
        intent: kind === 'exists' ? ('create' as const) : ('update' as const),
        limits: kind === 'duration' ? { ...OWNER_LIMITS, windowDuration: 3600n } : OWNER_LIMITS,
      };
      await expect(
        Effect.runPromise(submitOwnerPolicy(connected, f.config, input)),
      ).rejects.toMatchObject({
        code:
          kind === 'exists'
            ? 'POLICY_EXISTS'
            : kind === 'missing'
              ? 'POLICY_MISSING'
              : 'INVALID_POLICY',
      });
      expect(f.sign).not.toHaveBeenCalled();
      expect(sent(f)).toHaveLength(0);
    },
  );
  it.each(['message', 'signature', 'account'] as const)(
    'rejects a changed %s before broadcasting',
    async (kind) => {
      const f = await ownerFixture(registry);
      const connected = await connection(f);
      f.state.alterMessage = kind === 'message';
      f.state.alterSignature = kind === 'signature';
      f.state.disconnectOnSign = kind === 'account';
      await expect(
        Effect.runPromise(submitOwnerPolicy(connected, f.config, f.input)),
      ).rejects.toMatchObject({
        code: kind === 'account' ? 'WALLET_CHANGED' : 'INVALID_WALLET_TRANSACTION',
      });
      expect(sent(f)).toHaveLength(0);
    },
  );
  it('rechecks create intent after approval so an observed concurrent registration is not overwritten', async () => {
    const f = await ownerFixture(registry);
    const connected = await connection(f);
    f.state.createDuringApproval = true;
    await expect(
      Effect.runPromise(submitOwnerPolicy(connected, f.config, f.input)),
    ).rejects.toMatchObject({ code: 'POLICY_EXISTS' });
    expect(sent(f)).toHaveLength(0);
  });
  it.each(['send', 'confirm'] as const)(
    'reports uncertain %s with the known signature and fixed diagnostics',
    async (phase) => {
      const f = await ownerFixture(registry);
      const connected = await connection(f);
      f.state.sendFailure = phase === 'send';
      f.state.confirmFailure = phase === 'confirm';
      try {
        await Effect.runPromise(submitOwnerPolicy(connected, f.config, f.input));
        throw new Error('expected failure');
      } catch (error) {
        expect(error).toMatchObject({
          code: 'POLICY_OUTCOME_UNKNOWN',
          signature: expect.any(String),
        });
        expect((error as Error).message).not.toContain('PRIVATE_RPC_DETAIL');
      }
      expect(sent(f)).toHaveLength(1);
    },
  );
  it('accepts equivalent owner accounts recreated by wallet getters', async () => {
    const f = await ownerFixture(registry);
    f.state.recreateAccounts = true;
    const connected = await connection(f);
    const result = await Effect.runPromise(submitOwnerPolicy(connected, f.config, f.input));
    expect(result.signature).toBeTruthy();
    expect(sent(f)).toHaveLength(1);
  });
  it('keeps wallet rejection diagnostics fixed and does not broadcast', async () => {
    const f = await ownerFixture(registry);
    const connected = await connection(f);
    f.sign.mockRejectedValueOnce(new Error('PRIVATE_WALLET_DETAIL'));
    try {
      await Effect.runPromise(submitOwnerPolicy(connected, f.config, f.input));
      throw new Error('expected rejection');
    } catch (error) {
      expect(error).toMatchObject({ code: 'WALLET_REJECTED' });
      expect((error as Error).message).not.toContain('PRIVATE_WALLET_DETAIL');
    }
    expect(sent(f)).toHaveLength(0);
  });
  it('bounds RPC reads while leaving wallet approval user-controlled', async () => {
    const f = await ownerFixture(registry);
    vi.useFakeTimers();
    vi.stubGlobal('fetch', () => new Promise<Response>(() => {}));
    const assertion = expect(
      Effect.runPromise(discoverOwnerWallets(f.config)),
    ).rejects.toMatchObject({ code: 'RPC_UNAVAILABLE' });
    try {
      await vi.advanceTimersByTimeAsync(10_001);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});
