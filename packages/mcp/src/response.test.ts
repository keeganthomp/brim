import { describe, expect, it, vi } from 'vitest';
import { getBase58Decoder } from '@solana/kit';
import { Effect } from 'effect';
import { boundedBody } from './body.js';
import { MAX_RESPONSE_BYTES } from './schemas.js';
import { readResourceResponse, readSettlementReceipt } from './response.js';

const network = 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1';
const transaction = getBase58Decoder().decode(new Uint8Array(64).fill(7));
const config = { agentKey: 'scoped-test-key', rpcUrl: 'https://rpc.example/provider-token' };
const encoded = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64');
const receipt = { success: true, network, transaction };

describe('MCP resource response boundaries', () => {
  it('returns only validated receipt fields for the configured network', async () => {
    await expect(
      Effect.runPromise(readSettlementReceipt(encoded(receipt), network)),
    ).resolves.toEqual({ network, signature: transaction });
  });

  it('reads the receipt returned by Pay Kit x402', async () => {
    const response = new Response('report', {
      headers: { 'X-PAYMENT-RESPONSE': encoded(receipt) },
    });
    await expect(
      Effect.runPromise(readResourceResponse(response, config, network)),
    ).resolves.toEqual({
      status: 200,
      body: 'report',
      receipt: { network, signature: transaction },
    });
  });

  it('does not replace an invalid standard receipt with a legacy receipt', async () => {
    const response = new Response('report', {
      headers: {
        'PAYMENT-RESPONSE': encoded({ ...receipt, network: 'solana:another-network' }),
        'X-PAYMENT-RESPONSE': encoded(receipt),
      },
    });
    await expect(
      Effect.runPromise(readResourceResponse(response, config, network)),
    ).rejects.toMatchObject({
      code: 'PAYMENT_OUTCOME_UNKNOWN',
    });
  });

  it.each([
    { ...receipt, success: 'true' },
    { ...receipt, network: 'solana:another-network' },
    { ...receipt, transaction: 'not-a-signature' },
    { success: true },
  ])(
    'refuses malformed settlement metadata without treating it as confirmed payment',
    async (value) => {
      await expect(
        Effect.runPromise(readSettlementReceipt(encoded(value), network)),
      ).rejects.toMatchObject({ code: 'PAYMENT_OUTCOME_UNKNOWN' });
    },
  );

  it('bounds receipt headers before decoding', async () => {
    await expect(
      Effect.runPromise(readSettlementReceipt('a'.repeat(8193), network)),
    ).rejects.toMatchObject({ code: 'PAYMENT_OUTCOME_UNKNOWN' });
  });

  it('releases an unread response when receipt validation fails', async () => {
    const cancel = vi.fn();
    const response = new Response(new ReadableStream({ cancel }), {
      headers: { 'PAYMENT-RESPONSE': encoded({ ...receipt, network: 'solana:another-network' }) },
    });
    await expect(
      Effect.runPromise(readResourceResponse(response, config, network)),
    ).rejects.toMatchObject({ code: 'PAYMENT_OUTCOME_UNKNOWN' });
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('keeps a read failure after a resource response out of the safe-to-retry category', async () => {
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.error(new Error('PRIVATE_PROVIDER_DIAGNOSTIC'));
        },
      }),
    );
    const result = await Effect.runPromise(
      Effect.result(readResourceResponse(response, config, network)),
    );
    expect(result._tag).toBe('Failure');
    if (result._tag === 'Failure') {
      expect(result.failure.code).toBe('PAYMENT_OUTCOME_UNKNOWN');
      expect(result.failure.message).not.toContain('PRIVATE_PROVIDER_DIAGNOSTIC');
    }
  });

  it('preserves the response bound when upstream cancellation fails', async () => {
    const cancel = vi.fn(() => Promise.reject(new Error('PRIVATE_CANCEL_DIAGNOSTIC')));
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(MAX_RESPONSE_BYTES + 1));
        },
        cancel,
      }),
    );
    await expect(Effect.runPromise(boundedBody(response))).rejects.toMatchObject({
      code: 'RESPONSE_TOO_LARGE',
    });
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('does not wait indefinitely for cancellation after rejecting an oversized body', async () => {
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(MAX_RESPONSE_BYTES + 1));
        },
        cancel() {
          return new Promise(() => {});
        },
      }),
    );
    await expect(Effect.runPromise(boundedBody(response))).rejects.toMatchObject({
      code: 'RESPONSE_TOO_LARGE',
    });
  }, 1000);
});
