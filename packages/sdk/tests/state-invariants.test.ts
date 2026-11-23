import { describe, expect, it, vi } from 'vitest';
import { address, getAddressEncoder } from '@solana/kit';
import { createBrimFetch, findTokenAccount } from '../src/index.js';
import { fixture, OWNER, paymentRequired, req } from './sharedfixtures.js';

const resource = 'https://merchant.test/report';
describe('payment state invariants', () => {
  it('refreshes the on-chain policy on every payment instead of reusing an unfrozen snapshot', async () => {
    const f = await fixture();
    const transport = vi.fn(async (input: RequestInfo | URL) =>
      new Request(input).headers.has('PAYMENT-SIGNATURE')
        ? new Response('paid')
        : paymentRequired(),
    );
    const brimFetch = createBrimFetch({ ...f.config, fetch: transport });
    expect(await (await brimFetch(resource)).text()).toBe('paid');
    f.policyData[72] = 1;
    await expect(brimFetch(resource)).rejects.toMatchObject({ code: 'AGENT_FROZEN' });
    expect(transport).toHaveBeenCalledTimes(3);
    expect(f.rpc).toHaveBeenCalledTimes(5);
  });

  it('checks RPC network identity before reading or authorizing vault state', async () => {
    const f = await fixture();
    f.rpc.mockImplementationOnce(
      async (_input, init) =>
        new Response(
          JSON.stringify({
            jsonrpc: '2.0',
            id: JSON.parse(String(init?.body)).id,
            result: '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',
          }),
          { headers: { 'content-type': 'application/json' } },
        ),
    );
    const transport = vi.fn(async () => paymentRequired());
    await expect(
      createBrimFetch({ ...f.config, fetch: transport })(resource),
    ).rejects.toMatchObject({ code: 'INVALID_CONFIG' });
    expect(f.rpc).toHaveBeenCalledTimes(1);
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it.each(['agent', 'vault-token-account'] as const)(
    'refuses %s as sponsor even when present in the configured fee-payer list',
    async (target) => {
      const f = await fixture();
      const feePayer =
        target === 'agent'
          ? f.signer.address
          : await findTokenAccount(f.config.vaultAddress, req.asset);
      const transport = vi.fn(async () =>
        paymentRequired([{ ...req, extra: { ...req.extra, feePayer } }]),
      );
      await expect(
        createBrimFetch({
          ...f.config,
          facilitator: { mode: 'smart-wallet-exact', feePayers: [feePayer] },
          fetch: transport,
        })(resource),
      ).rejects.toMatchObject({ code: 'UNTRUSTED_FEE_PAYER' });
      expect(transport).toHaveBeenCalledTimes(1);
    },
  );

  it.each(['mint', 'source', 'bump'] as const)(
    'refuses a vault snapshot with an inconsistent %s',
    async (target) => {
      const f = await fixture();
      if (target === 'bump') f.vaultData[109] ^= 1;
      else f.vaultData.set(getAddressEncoder().encode(address(OWNER)), target === 'mint' ? 40 : 72);
      const transport = vi.fn(async () => paymentRequired());
      await expect(
        createBrimFetch({ ...f.config, fetch: transport })(resource),
      ).rejects.toMatchObject({ code: 'INVALID_ACCOUNT' });
      expect(transport).toHaveBeenCalledTimes(1);
      expect(f.rpc).toHaveBeenCalledTimes(2);
    },
  );
});
