import { describe, expect, it, vi } from 'vitest';
import { BrimPolicyViolationError, createBrimFetch } from '../src/index.js';
import { MAX_PAYMENT_REQUIRED_HEADER_BYTES } from '../src/payment-required.js';
import { config, fixture, paymentRequired, req } from './sharedfixtures.js';

const challenge = (value: unknown) =>
  new Response(null, { status: 402, headers: { 'PAYMENT-REQUIRED': btoa(JSON.stringify(value)) } });
const envelope = (overrides: Record<string, unknown> = {}) => ({
  x402Version: 2,
  resource: { url: 'https://merchant.test/report' },
  accepts: [req],
  ...overrides,
});

describe('untrusted x402 boundaries', () => {
  it.each([
    { resource: undefined },
    { resource: { url: 42 } },
    { accepts: [] },
    { accepts: [req, null] },
    { accepts: [req, { ...req, network: 42 }] },
    { accepts: [req, { ...req, scheme: 'unsupported', extra: [] }] },
  ])(
    'rejects malformed envelope or unused offers before selection and signing',
    async (overrides) => {
      const transport = vi.fn(async () => challenge(envelope(overrides)));
      await expect(
        createBrimFetch({ ...config, fetch: transport })('https://merchant.test/report'),
      ).rejects.toMatchObject({ code: 'INVALID_PAYMENT_REQUIREMENTS' });
      expect(transport).toHaveBeenCalledTimes(1);
    },
  );

  it('bounds the header before decoding and refuses unsupported versions', async () => {
    const oversized = new Response(null, {
      status: 402,
      headers: { 'PAYMENT-REQUIRED': 'A'.repeat(MAX_PAYMENT_REQUIRED_HEADER_BYTES + 1) },
    });
    await expect(
      createBrimFetch({ ...config, fetch: async () => oversized })('https://merchant.test/report'),
    ).rejects.toMatchObject({ code: 'INVALID_PAYMENT_REQUIREMENTS' });
    await expect(
      createBrimFetch({ ...config, fetch: async () => challenge(envelope({ x402Version: 1 })) })(
        'https://merchant.test/report',
      ),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_PAYMENT' });
  });

  it('narrows well-formed mixed-network offers without applying Solana formats to unrelated assets', async () => {
    const f = await fixture();
    const other = {
      ...req,
      network: 'eip155:8453',
      asset: '0x0000000000000000000000000000000000000001',
      payTo: '0x0000000000000000000000000000000000000002',
    };
    const transport = vi.fn(async () =>
      transport.mock.calls.length === 1
        ? challenge(envelope({ accepts: [other, req] }))
        : new Response('paid'),
    );
    expect(
      await (
        await createBrimFetch({ ...f.config, fetch: transport })('https://merchant.test/report')
      ).text(),
    ).toBe('paid');
    expect(f.rpc).toHaveBeenCalledTimes(3);
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it.each(['escrow', 'upfront', 'unknown'])(
    'refuses unsupported payment flow %s before authorization',
    async (paymentFlow) => {
      const transport = vi.fn(async () =>
        paymentRequired([{ ...req, extra: { ...req.extra, paymentFlow } }]),
      );
      await expect(
        createBrimFetch({ ...config, fetch: transport })('https://merchant.test/report'),
      ).rejects.toMatchObject({ code: 'UNSUPPORTED_PAYMENT' });
      expect(transport).toHaveBeenCalledTimes(1);
    },
  );

  it('does not let a transport exception type disclose sensitive error text', async () => {
    const transport = async () => {
      throw new BrimPolicyViolationError('RPC_UNAVAILABLE', 'PRIVATE_FIXTURE_VALUE');
    };
    try {
      await createBrimFetch({ ...config, fetch: transport })('https://merchant.test/report');
      throw new Error('expected failure');
    } catch (error) {
      expect(error).toMatchObject({ code: 'REQUEST_FAILED' });
      expect((error as Error).message).not.toContain('PRIVATE_FIXTURE_VALUE');
    }
  });

  it.each([
    () => new Error('Failed to parse payment requirements: PRIVATE_FIXTURE_VALUE'),
    () => new BrimPolicyViolationError('AGENT_FROZEN', 'PRIVATE_FIXTURE_VALUE'),
  ])(
    'keeps all post-handoff exceptions uncertain regardless of their message or type',
    async (makeError) => {
      const f = await fixture();
      const transport = vi.fn(async () => {
        if (transport.mock.calls.length === 1) return paymentRequired();
        throw makeError();
      });
      try {
        await createBrimFetch({ ...f.config, fetch: transport })('https://merchant.test/report');
        throw new Error('expected failure');
      } catch (error) {
        expect(error).toMatchObject({ code: 'PAYMENT_OUTCOME_UNKNOWN' });
        expect((error as Error).message).not.toContain('PRIVATE_FIXTURE_VALUE');
      }
      expect(transport).toHaveBeenCalledTimes(2);
    },
  );

  it('sanitizes typed failures from the RPC boundary as well as ordinary exceptions', async () => {
    const f = await fixture();
    vi.stubGlobal('fetch', async () => {
      throw new BrimPolicyViolationError('INVALID_CONFIG', 'PRIVATE_RPC_FIXTURE_VALUE');
    });
    const transport = vi.fn(async () => paymentRequired());
    await expect(
      createBrimFetch({ ...f.config, fetch: transport })('https://merchant.test/report'),
    ).rejects.toMatchObject({ code: 'RPC_UNAVAILABLE' });
    expect(transport).toHaveBeenCalledTimes(1);
  });
});
