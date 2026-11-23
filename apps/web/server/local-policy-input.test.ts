import { Effect } from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readPolicyInput } from './local-policy-input';

const body = {
  intent: 'create',
  agentKey: 'GmaDrppBC7P5ARKV8g3djiwP89vz1jLK23V2GBjuAEGB',
  maxPerTxBaseUnits: '1000000',
  windowLimitBaseUnits: '50000000',
  minTxInterval: 6,
  allowlistEnabled: true,
  allowlist: [],
};
const request = (value: unknown = body, headers: Record<string, string> = {}) =>
  new Request('http://0.0.0.0:3000/api/local/policies', {
    method: 'POST',
    headers: {
      host: 'localhost:3000',
      origin: 'http://localhost:3000',
      'content-type': 'application/json',
      ...headers,
    },
    body: typeof value === 'string' ? value : JSON.stringify(value),
  });
const run = (input: Request) => Effect.runPromise(Effect.result(readPolicyInput(input)));
const rejected = async (input: Request, code = 'INVALID_POLICY') => {
  const result = await run(input);
  expect(result._tag).toBe('Failure');
  if (result._tag === 'Failure') expect(result.failure).toMatchObject({ code });
};
beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('BRIM_LOCAL_CONFIG', '/workspace/brim/.brim/local.json');
});
afterEach(() => vi.unstubAllEnvs());

describe('local owner-policy HTTP boundary', () => {
  it('accepts exact integer units, minimum spacing and a deny-all allowlist', async () => {
    const result = await run(request());
    expect(result._tag).toBe('Success');
    if (result._tag === 'Success') expect(result.success).toEqual(body);
  });
  it('requires explicit same-origin loopback writes and development mode', async () => {
    await rejected(request(body, { origin: '' }), 'LOCAL_ONLY');
    await rejected(request(body, { origin: 'https://other.invalid' }), 'LOCAL_ONLY');
    await rejected(request(body, { host: 'other.invalid' }), 'LOCAL_ONLY');
    await rejected(request(body, { 'sec-fetch-site': 'cross-site' }), 'LOCAL_ONLY');
    vi.stubEnv('NODE_ENV', 'production');
    await rejected(request(), 'LOCAL_ONLY');
  });
  it('rejects private-key formats and unexpected authority fields without echoing them', async () => {
    await rejected(request({ ...body, agentKey: JSON.stringify(Array(64).fill(7)) }));
    await rejected(request({ ...body, agentKey: '2'.repeat(88) }));
    const secret = 'do-not-return-this-private-value';
    const result = await run(request({ ...body, ownerKey: secret }));
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(result._tag).toBe('Failure');
  });
  it.each([
    { maxPerTxBaseUnits: '0' },
    { maxPerTxBaseUnits: '1.5' },
    { maxPerTxBaseUnits: 1 },
    { windowLimitBaseUnits: '18446744073709551616' },
    { windowLimitBaseUnits: '999999' },
    { minTxInterval: -1 },
    { minTxInterval: 0.5 },
    { intent: 'upsert' },
    { allowlist: Array(17).fill(body.agentKey) },
    { allowlist: [body.agentKey, body.agentKey] },
  ])('rejects invalid policy data: %j', async (change) =>
    rejected(request({ ...body, ...change })),
  );
  it('bounds streaming JSON and rejects unsupported media types', async () => {
    await rejected(request(' '.repeat(16_385)));
    await rejected(request(body, { 'content-type': 'text/plain' }));
    await rejected(request(body, { 'content-length': '20000' }));
  });
});
