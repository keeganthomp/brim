import { afterEach, describe, expect, it, vi } from 'vitest';
import { Effect } from 'effect';
import { checkBrimConnection, checkBrimConnectionEffect } from '../src/check-connection.js';
import { NETWORKS, BRIM_NETWORK_IDS } from '../src/constants.js';
import { challenge, connectionFixture, feePayer, recipient } from './connection-fixture.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
const methods = (rpc: Awaited<ReturnType<typeof connectionFixture>>['rpc']) =>
  rpc.mock.calls.map(([, init]) => JSON.parse(String(init?.body)).method);

describe('read-only Brim connection checks', () => {
  it('checks canonical state and exact remaining budget without signing or submitting', async () => {
    const f = await connectionFixture();
    const report = await checkBrimConnection(f.input);
    expect(report).toMatchObject({
      ready: true,
      balanceBaseUnits: '100000000',
      vaultPaused: false,
      policyAddress: f.policyAddress,
      policy: { isFrozen: false, windowRemainingBaseUnits: '47000000', nextPaymentAt: '1100' },
      blockers: [],
    });
    expect(JSON.parse(JSON.stringify(report))).toEqual(report);
    expect(methods(f.rpc)).toEqual(['getGenesisHash', 'getMultipleAccounts']);
  });

  it('is lazy for Effect users', async () => {
    const f = await connectionFixture();
    const effect = checkBrimConnectionEffect(f.input);
    expect(f.rpc).not.toHaveBeenCalled();
    await Effect.runPromise(effect);
    expect(f.rpc).toHaveBeenCalledTimes(2);
  });

  it.each(['frozen', 'paused', 'empty', 'missing', 'budget', 'spacing'] as const)(
    'reports a %s connection without claiming readiness',
    async (condition) => {
      const f = await connectionFixture();
      if (condition === 'frozen') f.policy[72] = 1;
      if (condition === 'paused') f.vault[108] = 1;
      if (condition === 'empty') new DataView(f.token.buffer).setBigUint64(64, 0n, true);
      if (condition === 'missing') f.accounts[1] = null;
      if (condition === 'budget')
        new DataView(f.policy.buffer).setBigUint64(105, 50_000_000n, true);
      if (condition === 'spacing') new DataView(f.policy.buffer).setBigInt64(121, 1099n, true);
      const report = await checkBrimConnection(f.input);
      expect(report.ready).toBe(false);
      expect(report.blockers).toHaveLength(1);
      if (condition === 'missing') expect(report.policy).toBeNull();
    },
  );

  it('resets advisory remaining when the fixed window expires', async () => {
    const f = await connectionFixture();
    new DataView(f.clock.buffer).setBigInt64(32, 87_400n, true);
    expect((await checkBrimConnection(f.input)).policy?.windowRemainingBaseUnits).toBe('50000000');
  });

  it('rejects a wrong RPC network before reading accounts', async () => {
    const f = await connectionFixture();
    f.changeGenesis('5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d');
    await expect(checkBrimConnection(f.input)).rejects.toMatchObject({ code: 'INVALID_CONFIG' });
    expect(methods(f.rpc)).toEqual(['getGenesisHash']);
  });

  it.each([
    'vault-owner',
    'vault-bump',
    'policy-bump',
    'policy-key',
    'mint',
    'token-owner',
    'token-state',
    'program',
  ] as const)('rejects inconsistent %s account data', async (target) => {
    const f = await connectionFixture();
    if (target === 'vault-owner') f.accounts[0]!.owner = feePayer;
    if (target === 'vault-bump') f.vault[109] ^= 1;
    if (target === 'policy-bump') f.policy[166] ^= 1;
    if (target === 'policy-key') f.policy[40] ^= 1;
    if (target === 'mint') f.mintData[44] = 9;
    if (target === 'token-owner') f.token[32] ^= 1;
    if (target === 'token-state') f.token[108] = 2;
    if (target === 'program') f.accounts[5]!.executable = false;
    await expect(checkBrimConnection(f.input)).rejects.toMatchObject({ code: 'INVALID_ACCOUNT' });
  });

  it('checks a quote using only headers and never sends authorization or reads its body', async () => {
    const f = await connectionFixture();
    const response = challenge();
    const cancel = vi.spyOn(response.body ?? { cancel: async () => {} }, 'cancel');
    const reads = [
      vi.spyOn(response, 'text'),
      vi.spyOn(response, 'json'),
      vi.spyOn(response, 'arrayBuffer'),
    ];
    let request: Request | undefined;
    const transport = vi.fn(async (input: RequestInfo | URL) => {
      request = new Request(input);
      return response;
    });
    const result = await checkBrimConnection({
      ...f.input,
      resourceUrl: 'https://merchant.example/report',
      fetch: transport,
    });
    expect(result).toMatchObject({
      ready: true,
      merchant: {
        status: 'quote',
        amountBaseUnits: '40000',
        recipient,
        feePayer,
        facilitatorAcceptance: 'unverified',
      },
    });
    expect(request?.method).toBe('GET');
    expect(request?.redirect).toBe('error');
    expect(request?.credentials).toBe('omit');
    expect([...request!.headers]).toEqual([]);
    expect(request?.signal.aborted).toBe(true);
    for (const read of reads) expect(read).not.toHaveBeenCalled();
    expect(transport).toHaveBeenCalledTimes(1);
    expect(methods(f.rpc)).toEqual(['getGenesisHash', 'getMultipleAccounts']);
    expect(cancel).not.toHaveBeenCalled(); // null body requires no cancellation.
  });

  it.each([
    [{ network: BRIM_NETWORK_IDS.mainnet }, 'UNSUPPORTED_PAYMENT'],
    [{ asset: NETWORKS[BRIM_NETWORK_IDS.mainnet].mint }, 'UNSUPPORTED_PAYMENT'],
    [{ extra: { feePayer: recipient } }, 'UNTRUSTED_FEE_PAYER'],
    [{ amount: 'bad' }, 'INVALID_PAYMENT_REQUIREMENTS'],
  ] as const)('rejects an incompatible advertised quote', async (offer, code) => {
    const f = await connectionFixture();
    await expect(
      checkBrimConnection({
        ...f.input,
        resourceUrl: 'https://merchant.example/report',
        fetch: async () => challenge(offer),
      }),
    ).rejects.toMatchObject({ code });
  });

  it('reports amount and recipient blockers without creating a payment', async () => {
    const f = await connectionFixture();
    const response = challenge({ amount: '2000000' });
    const result = await checkBrimConnection({
      ...f.input,
      resourceUrl: 'https://merchant.example/report',
      fetch: async () => response,
    });
    expect(result.ready).toBe(false);
    expect(result.merchant?.amountBaseUnits).toBe('2000000');
    expect(result.blockers.some((issue) => issue.code === 'PER_TRANSACTION_LIMIT_EXCEEDED')).toBe(
      true,
    );
  });

  it('refuses redirected and oversized challenge responses', async () => {
    const f = await connectionFixture();
    for (const response of [
      new Response(null, { status: 302 }),
      new Response(null, { status: 402, headers: { 'PAYMENT-REQUIRED': 'a'.repeat(65_537) } }),
    ]) {
      await expect(
        checkBrimConnection({
          ...f.input,
          resourceUrl: 'https://merchant.example/report',
          fetch: async () => response,
        }),
      ).rejects.toBeDefined();
    }
  });

  it('cancels an unread body without waiting for a stuck cancel promise', async () => {
    const f = await connectionFixture();
    const response = new Response('body is intentionally unread');
    const cancel = vi.fn(() => new Promise<void>(() => {}));
    const getReader = vi.spyOn(response.body!, 'getReader');
    Object.defineProperty(response.body, 'cancel', { value: cancel });
    const report = await checkBrimConnection({
      ...f.input,
      resourceUrl: 'https://merchant.example/report',
      fetch: async () => response,
    });
    expect(report.merchant?.status).toBe('free');
    expect(cancel).toHaveBeenCalledOnce();
    expect(getReader).not.toHaveBeenCalled();
  });

  it('aborts a pending probe when the caller cancels', async () => {
    const f = await connectionFixture();
    const controller = new AbortController();
    let signal: AbortSignal | undefined;
    let notifyStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      notifyStarted = resolve;
    });
    const result = checkBrimConnection(
      {
        ...f.input,
        resourceUrl: 'https://merchant.example/report',
        fetch: async (input) => {
          expect(input).toBeInstanceOf(Request);
          signal = (input as Request).signal;
          notifyStarted();
          return await new Promise<Response>(() => {});
        },
      },
      { signal: controller.signal },
    );
    const rejected = expect(result).rejects.toBeDefined();
    await started;
    controller.abort();
    await rejected;
    expect(signal?.aborted).toBe(true);
  });

  it('bounds a stalled header-only probe and aborts its transport', async () => {
    const f = await connectionFixture();
    let signal: AbortSignal | undefined;
    await expect(
      checkBrimConnection({
        ...f.input,
        resourceUrl: 'https://merchant.example/report',
        fetch: async (input) => {
          expect(input).toBeInstanceOf(Request);
          signal = (input as Request).signal;
          return await new Promise<Response>(() => {});
        },
      }),
    ).rejects.toMatchObject({
      code: 'REQUEST_FAILED',
      message: 'Connection check timed out. No payment was authorized.',
    });
    expect(signal?.aborted).toBe(true);
  }, 20_000);
});
