import type { IncomingMessage, ServerResponse } from 'node:http';
import type { x402HTTPResourceServer } from '@x402/core/server';
import { Effect } from 'effect';
import { describe, expect, it, vi } from 'vitest';
import { handleLocalRequest } from '../../../infra/local/payments/http';
import { LocalSetupError } from '../../../scripts/local/config';

const receipt = {
  success: true,
  transaction: 'PUBLIC_TRANSACTION_SIGNATURE',
  network: 'local-test-network',
  headers: { 'PAYMENT-RESPONSE': 'PUBLIC_SETTLEMENT_RECEIPT' },
};
const resource = {
  processHTTPRequest: async () => ({
    type: 'payment-verified',
    paymentPayload: {},
    paymentRequirements: {},
  }),
  processSettlement: async () => receipt,
} as unknown as x402HTTPResourceServer;
const request = { url: '/report', method: 'GET', headers: {} } as IncomingMessage;
function response() {
  return { headersSent: false, writeHead: vi.fn(), end: vi.fn() } as unknown as ServerResponse & {
    writeHead: ReturnType<typeof vi.fn>;
    end: ReturnType<typeof vi.fn>;
  };
}

describe('local settled response durability boundary', () => {
  it('does not return a successful paid response until its receipt is durably captured', async () => {
    let started!: () => void;
    let release!: () => void;
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    const durable = new Promise<void>((resolve) => {
      release = resolve;
    });
    const output = response();
    const observer = vi.fn(() =>
      Effect.gen(function* () {
        yield* Effect.sync(started);
        yield* Effect.promise(() => durable);
      }),
    );
    const running = Effect.runPromise(handleLocalRequest(resource, request, output, observer));
    await entered;
    expect(output.end).not.toHaveBeenCalled();
    release();
    await running;
    expect(observer).toHaveBeenCalledWith(receipt);
    expect(output.writeHead.mock.calls[0]?.[0]).toBe(200);
  });
  it('preserves the actual settlement receipt and reports uncertainty if durable capture fails', async () => {
    const output = response();
    await Effect.runPromise(
      handleLocalRequest(resource, request, output, () =>
        Effect.fail(new LocalSetupError({ message: 'PRIVATE_IO_DIAGNOSTIC' })),
      ),
    );
    expect(output.writeHead.mock.calls[0]?.[0]).toBe(503);
    expect(output.writeHead.mock.calls[0]?.[1]).toMatchObject({
      'payment-response': 'PUBLIC_SETTLEMENT_RECEIPT',
    });
    expect(output.end.mock.calls[0]?.[0]).toContain('SETTLED_INDEXING_UNAVAILABLE');
    expect(output.end.mock.calls[0]?.[0]).not.toContain('PRIVATE_IO_DIAGNOSTIC');
  });
});
