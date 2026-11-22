import { describe, expect, it, vi } from 'vitest';
import { createBrimCard, createBrimFetch, validatePaymentRequirements } from '../src/index.js';
import { decodeBrimCard } from '../src/card.js';
import type { BrimConfig } from '../src/types.js';
import type { PaymentRequirements } from '@x402/core/types';
import {
  config,
  req,
  cardDetails,
  encodedCard,
  error,
  paymentRequired,
  OWNER,
  SPONSOR,
} from './sharedfixtures.js';

describe('simple public card setup', () => {
  it('creates stable versioned public metadata and roundtrips all routing fields', () => {
    const card = createBrimCard(cardDetails);
    expect(card).toMatch(/^brim:v1:[A-Za-z0-9_-]+$/);
    expect(createBrimCard(cardDetails)).toBe(card);
    expect(decodeBrimCard(card)).toEqual(cardDetails);
    const metadata = JSON.parse(
      atob(card.slice('brim:v1:'.length).replace(/-/g, '+').replace(/_/g, '/')),
    );
    expect(Object.keys(metadata).sort()).toEqual(
      ['version', 'vaultAddress', 'programAddress', 'network', 'facilitatorFeePayers'].sort(),
    );
    expect(JSON.stringify(metadata)).not.toContain('agentKey');
    expect(JSON.stringify(metadata)).not.toContain('rpcUrl');
  });
  it('refuses credentials or unknown fields instead of encoding them', () => {
    for (const extra of [
      { rpcUrl: 'https://secret-rpc.test/key' },
      { agentKey: 'secret' },
      { agentSecretKey: 'secret' },
      { extra: true },
    ]) {
      expect(() => createBrimCard({ ...cardDetails, ...extra })).toThrow(error('INVALID_CARD'));
    }
  });
  it('rejects malformed, oversized and unknown-version cards with fixed messages', () => {
    const publicCard = createBrimCard(cardDetails);
    for (const bad of [
      '',
      'secret-input',
      'brim:v1:not+url/safe',
      'brim:v1:' + 'a'.repeat(4096),
      encodedCard({ ...cardDetails, version: 1, unexpected: true }),
    ]) {
      expect(() => decodeBrimCard(bad)).toThrow(error('INVALID_CARD'));
      try {
        decodeBrimCard(bad);
      } catch (err) {
        expect((err as Error).message).not.toContain(bad || 'empty input');
      }
    }
    expect(() => decodeBrimCard(publicCard.replace('brim:v1:', 'brim:v2:'))).toThrow(
      error('UNSUPPORTED_CARD_VERSION'),
    );
    expect(() => decodeBrimCard(encodedCard({ ...cardDetails, version: 2 }))).toThrow(
      error('UNSUPPORTED_CARD_VERSION'),
    );
  });
  it('rejects unsupported networks and invalid facilitator metadata', () => {
    for (const override of [
      { network: 'solana:unknown' },
      { vaultAddress: 'bad' },
      { facilitatorFeePayers: [] },
      { facilitatorFeePayers: ['bad'] },
      { facilitatorFeePayers: [SPONSOR, SPONSOR] },
      { facilitatorFeePayers: new Array(17).fill(SPONSOR) },
    ]) {
      expect(() =>
        decodeBrimCard(encodedCard({ version: 1, ...cardDetails, ...override })),
      ).toThrow(error('INVALID_CARD'));
    }
  });
  it('captures public metadata without retaining the operator array', () => {
    const payers = [SPONSOR];
    const card = createBrimCard({ ...cardDetails, facilitatorFeePayers: payers });
    payers[0] = OWNER;
    const decoded = decodeBrimCard(card);
    expect(decoded.facilitatorFeePayers).toEqual([SPONSOR]);
  });
  it('reports missing agent keys and mixed setup styles clearly', () => {
    const card = createBrimCard(cardDetails);
    expect(() =>
      createBrimFetch({ card, agentKey: undefined, rpcUrl: config.rpcUrl } as never),
    ).toThrow(error('INVALID_CONFIG'));
    expect(() => createBrimFetch({ card, agentKey: '[]', ...config } as never)).toThrow(
      error('INVALID_CONFIG'),
    );
  });
});

describe('x402 fail-closed negotiation', () => {
  it('requires explicit facilitator support', () => {
    expect(() =>
      createBrimFetch({ ...config, facilitator: undefined } as unknown as BrimConfig),
    ).toThrow(error('INVALID_CONFIG'));
  });
  it('pins network, asset, fee payer and transaction version', () => {
    expect(validatePaymentRequirements(config, req).amount).toBe(40000n);
    for (const override of [{ network: 'solana:unknown' }, { asset: OWNER }, { scheme: 'upto' }])
      expect(() =>
        validatePaymentRequirements(config, { ...req, ...override } as PaymentRequirements),
      ).toThrow(error('UNSUPPORTED_PAYMENT'));
    expect(() =>
      validatePaymentRequirements(config, { ...req, extra: { feePayer: OWNER } }),
    ).toThrow(error('UNTRUSTED_FEE_PAYER'));
    expect(() =>
      validatePaymentRequirements(config, {
        ...req,
        extra: { feePayer: SPONSOR, transactionVersions: [1] },
      }),
    ).toThrow(error('UNSUPPORTED_PAYMENT'));
  });
  it('rejects HTTP merchant authorization and unsupported scheme/network offers', async () => {
    const transport = vi.fn(async () => paymentRequired());
    await expect(
      createBrimFetch({ ...config, fetch: transport })('http://merchant.test/api'),
    ).rejects.toMatchObject({ code: 'INVALID_CONFIG' });
    expect(transport).not.toHaveBeenCalled();
    for (const override of [{ network: 'solana:unknown' }, { scheme: 'upto' }]) {
      const other = vi.fn(async () =>
        paymentRequired([{ ...req, ...override } as PaymentRequirements]),
      );
      await expect(
        createBrimFetch({ ...config, fetch: other })('https://merchant.test/api'),
      ).rejects.toMatchObject({ code: 'UNSUPPORTED_PAYMENT' });
    }
  });
  it('passes free responses through without touching RPC or session key', async () => {
    const transport = vi.fn(async () => new Response('free'));
    expect(
      await (
        await createBrimFetch({ ...config, fetch: transport })('https://merchant.test/api')
      ).text(),
    ).toBe('free');
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('rejects malformed and ambiguous 402 responses before signing', async () => {
    const malformed = createBrimFetch({
      ...config,
      fetch: async () =>
        new Response(null, { status: 402, headers: { 'PAYMENT-REQUIRED': 'not-base64' } }),
    });
    await expect(malformed('https://merchant.test/api')).rejects.toMatchObject({
      code: 'INVALID_PAYMENT_REQUIREMENTS',
    });
    const transport = vi.fn(async () => paymentRequired([req, { ...req, amount: '50000' }]));
    await expect(
      createBrimFetch({ ...config, fetch: transport })('https://merchant.test/api'),
    ).rejects.toMatchObject({ code: 'INVALID_PAYMENT_REQUIREMENTS' });
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('keeps typed policy errors and emits best-effort local observations', async () => {
    const onEvent = vi.fn(() => {
      throw new Error('telemetry down');
    });
    const transport = vi.fn(async () => paymentRequired([{ ...req, amount: '1000001' }]));
    await expect(
      createBrimFetch({ ...config, fetch: transport, onEvent })('https://merchant.test/api'),
    ).rejects.toMatchObject({ code: 'PER_TRANSACTION_LIMIT_EXCEEDED' });
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'blocked', merchant: 'merchant.test' }),
    );
  });
  it('rejects pre-existing authorization without issuing a request', async () => {
    const transport = vi.fn(async () => new Response('bad'));
    await expect(
      createBrimFetch({ ...config, fetch: transport })('https://merchant.test/api', {
        headers: { 'PAYMENT-SIGNATURE': 'external' },
      }),
    ).rejects.toMatchObject({ code: 'INVALID_PAYMENT_REQUIREMENTS' });
    expect(transport).not.toHaveBeenCalled();
  });
});
