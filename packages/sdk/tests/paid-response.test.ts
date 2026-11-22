import { describe, expect, it, vi } from 'vitest';
import { createBrimFetch, decodeAgentPolicy } from '../src/index.js';
import { MAX_PAYMENT_REQUIRED_HEADER_BYTES } from '../src/payment-required.js';
import { fixture, paymentRequired } from './sharedfixtures.js';

const resource = 'https://merchant.test/report';
describe('paid response boundaries', () => {
  it.each(['PAYMENT-RESPONSE', 'X-PAYMENT-RESPONSE', 'PAYMENT-REQUIRED'])(
    'bounds %s before the upstream paid-response parser',
    async (name) => {
      const f = await fixture();
      const transport = vi.fn(async () =>
        transport.mock.calls.length === 1
          ? paymentRequired()
          : new Response(null, {
              status: name === 'PAYMENT-REQUIRED' ? 402 : 200,
              headers: { [name]: 'A'.repeat(MAX_PAYMENT_REQUIRED_HEADER_BYTES + 1) },
            }),
      );
      await expect(
        createBrimFetch({ ...f.config, fetch: transport })(resource),
      ).rejects.toMatchObject({ code: 'PAYMENT_OUTCOME_UNKNOWN' });
      expect(transport).toHaveBeenCalledTimes(2);
      expect(f.rpc).toHaveBeenCalledTimes(3);
    },
  );

  it('retains generic fetch compatibility when a successful resource response omits a receipt', async () => {
    const f = await fixture();
    const transport = vi.fn(async () =>
      transport.mock.calls.length === 1 ? paymentRequired() : new Response('resource data'),
    );
    expect(await (await createBrimFetch({ ...f.config, fetch: transport })(resource)).text()).toBe(
      'resource data',
    );
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it('keeps reconciliation guidance for a rejected paid retry rather than asserting no settlement', async () => {
    const f = await fixture();
    const transport = vi.fn(async () => paymentRequired());
    try {
      await createBrimFetch({ ...f.config, fetch: transport })(resource);
      throw new Error('expected rejection');
    } catch (error) {
      expect(error).toMatchObject({ code: 'PAYMENT_REJECTED' });
      expect((error as Error).message).toContain('Settlement may have happened');
    }
    expect(transport).toHaveBeenCalledTimes(2);
  });
});

describe('public policy decoder', () => {
  it('requires the Anchor policy discriminator for read-only callers too', async () => {
    const f = await fixture();
    expect(decodeAgentPolicy(f.policyData).vault).toBe(f.config.vaultAddress);
    f.policyData[0] ^= 1;
    expect(() => decodeAgentPolicy(f.policyData)).toThrow(
      expect.objectContaining({ code: 'INVALID_ACCOUNT' }),
    );
  });
});
