import { describe, expect, it, vi } from 'vitest';
import { createBrimCard, createBrimFetch, resolveBrimRpcUrl } from '../src/index.js';
import { resolveBrimConfig } from '../src/card.js';
import { cardDetails, config, fixture, paymentRequired } from './sharedfixtures.js';

const endpoints = [
  ['solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp', 'https://api.mainnet-beta.solana.com'],
  ['solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1', 'https://api.devnet.solana.com'],
] as const;

describe('optional RPC configuration', () => {
  it.each(endpoints)(
    'defaults omitted RPC for %s from the trusted card network',
    (network, expected) => {
      const card = createBrimCard({ ...cardDetails, network });
      expect(resolveBrimRpcUrl(network)).toBe(expected);
      expect(resolveBrimConfig({ card, agentKey: '[]' }).rpcUrl).toBe(expected);
      expect(resolveBrimConfig({ ...config, network, rpcUrl: undefined }).rpcUrl).toBe(expected);
    },
  );

  it.each(['https://provider.example/rpc?token=private', 'http://127.0.0.1:8899'])(
    'preserves explicit override %s',
    (rpcUrl) => {
      expect(resolveBrimRpcUrl(cardDetails.network, rpcUrl)).toBe(rpcUrl);
      expect(
        resolveBrimConfig({ card: createBrimCard(cardDetails), agentKey: '[]', rpcUrl }).rpcUrl,
      ).toBe(rpcUrl);
    },
  );

  it.each(['', 'not-a-url', 'http://provider.example', null, 42])(
    'rejects an explicitly invalid RPC instead of silently defaulting',
    (rpcUrl) => {
      expect(() =>
        createBrimFetch({
          card: createBrimCard(cardDetails),
          agentKey: '[]',
          rpcUrl: rpcUrl as string,
        }),
      ).toThrow(expect.objectContaining({ code: 'INVALID_CONFIG' }));
    },
  );

  it('performs no network work on setup and does not read RPC for a free request', async () => {
    const transport = vi.fn(async () => new Response('free'));
    vi.stubGlobal('fetch', transport);
    const paidFetch = createBrimFetch({ card: createBrimCard(cardDetails), agentKey: '[]' });
    expect(transport).not.toHaveBeenCalled();
    expect(await (await paidFetch('https://merchant.test/free')).text()).toBe('free');
    expect(transport).toHaveBeenCalledTimes(1);
    expect((transport.mock.calls[0][0] as Request).url).toBe('https://merchant.test/free');
  });

  it('signs the same scoped payment with the default RPC when a paid response requires it', async () => {
    const f = await fixture();
    const card = createBrimCard({ ...cardDetails, vaultAddress: f.config.vaultAddress });
    const transport = vi.fn(async () =>
      transport.mock.calls.length === 1 ? paymentRequired() : new Response('paid'),
    );
    const paidFetch = createBrimFetch({
      card,
      agentKey: f.config.agentSecretKey,
      fetch: transport,
    });
    expect(f.rpc).not.toHaveBeenCalled();
    expect(await (await paidFetch('https://merchant.test/report')).text()).toBe('paid');
    expect(f.rpc).toHaveBeenCalledTimes(3);
    expect(new URL(String(f.rpc.mock.calls[0][0])).origin).toBe('https://api.devnet.solana.com');
    expect(transport).toHaveBeenCalledTimes(2);
  });
});
