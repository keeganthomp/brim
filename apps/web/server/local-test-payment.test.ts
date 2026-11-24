import { Effect } from 'effect';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { localTestPayment } from './local-test-payment';

const fixtures = vi.hoisted(() => ({ verifyVault: vi.fn(), pay: vi.fn() }));
vi.mock('./local-policy-owner', async () => ({
  localFixtureVault: (await import('effect')).Effect.suspend(() => fixtures.verifyVault()),
}));
vi.mock('./local-test-payment-flow', async () => ({
  localPaymentFlow: () => Effect.suspend(() => fixtures.pay()),
}));

const signature = '1'.repeat(64);
const receipt = { status: 'settled', amount: '$0.04', signature, ledgerRows: 1 };
const rpcUrl = 'http://127.0.0.1:8899';
const request = (origin = 'http://localhost:3000', body?: string) =>
  new Request('http://localhost:3000/api/local/test-payment', {
    method: 'POST',
    headers: { host: 'localhost:3000', origin },
    ...(body ? { body } : {}),
  });
const handle = (input: Request) => Effect.runPromise(localTestPayment(input));

function localConfig() {
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('BRIM_LOCAL_CONFIG', '/fixtures/brim.json');
  vi.stubEnv('BRIM_RPC_URL', rpcUrl);
  fixtures.verifyVault.mockReturnValue(Effect.succeed({ config: { rpcUrl } }));
  fixtures.pay.mockReturnValue(Effect.succeed(receipt));
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});

describe('local test payment boundary', () => {
  it('refuses production and cross-origin requests before validating or spending', async () => {
    localConfig();
    vi.stubEnv('NODE_ENV', 'production');
    expect((await handle(request())).status).toBe(404);
    vi.stubEnv('NODE_ENV', 'development');
    expect((await handle(request('https://elsewhere.example'))).status).toBe(404);
    expect(fixtures.verifyVault).not.toHaveBeenCalled();
    expect(fixtures.pay).not.toHaveBeenCalled();
  });

  it('takes no user-supplied payment instructions', async () => {
    localConfig();
    expect((await handle(request(undefined, '{"amount":"500"}'))).status).toBe(400);
    expect(fixtures.pay).not.toHaveBeenCalled();
  });

  it('does not let the demo override the checked Surfpool connection', async () => {
    localConfig();
    vi.stubEnv('BRIM_RPC_URL', 'http://localhost:9900');
    expect((await handle(request())).status).toBe(404);
    expect(fixtures.pay).not.toHaveBeenCalled();
  });

  it('returns a verified result and refuses duplicates while the first click is running', async () => {
    localConfig();
    const started = Promise.withResolvers<void>();
    const settle = Promise.withResolvers<typeof receipt>();
    fixtures.pay.mockReturnValue(
      Effect.promise(() => {
        started.resolve();
        return settle.promise;
      }),
    );
    const first = handle(request());
    await started.promise;
    const duplicate = await handle(request());
    expect(duplicate.status).toBe(409);
    expect(await duplicate.json()).toEqual({ code: 'TEST_PAYMENT_IN_PROGRESS' });
    settle.resolve(receipt);
    expect(await (await first).json()).toEqual(receipt);
    expect(fixtures.pay).toHaveBeenCalledTimes(1);
  });

  it('returns uncertain settlement without leaking internal errors', async () => {
    localConfig();
    fixtures.pay.mockReturnValue(Effect.fail(new Error('PRIVATE_DIAGNOSTIC')));
    const response = await handle(request());
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ code: 'TEST_PAYMENT_OUTCOME_UNKNOWN' });
  });
});
