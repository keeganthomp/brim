import { describe, expect, it } from 'vitest';
import { createHeliusWebhookHandler, createSolanaVerifier } from '../src/index.js';
import type { Verification } from '../src/index.js';

const programId = 'AekkJRGenJd9bgXoYo88xnAGpen9DMqSjkBRZZMMskpo';
const vault = '11111111111111111111111111111111';
const signature = '1'.repeat(64);
const authorization = 'Bearer local-unit-test-authentication-value-32-bytes';
const envelope = (result: unknown) => ({ jsonrpc: '2.0', id: 1, result });
const bodyRequest = (body: BodyInit) =>
  new Request('https://brim.test/webhook', {
    method: 'POST',
    headers: { authorization, 'content-type': 'application/json' },
    body,
    duplex: 'half',
  } as RequestInit);

describe('bounded webhook requests', () => {
  it('rejects Base58 values whose decoded signature or address length is invalid', async () => {
    const recorded: string[] = [];
    const handler = createHeliusWebhookHandler({
      authorization,
      trackedVaults: [vault],
      store: {
        record: async (sig) => {
          recorded.push(sig);
        },
      },
    });
    expect(
      (await handler(bodyRequest(JSON.stringify([{ signature: '1'.repeat(65) }])))).status,
    ).toBe(400);
    expect(recorded).toEqual([]);
    expect(() =>
      createHeliusWebhookHandler({
        authorization,
        trackedVaults: ['1'.repeat(33)],
        store: { record: async () => {} },
      }),
    ).toThrow('INVALID_TRACKED_VAULTS');
  });
  it('times out incomplete request bodies and closes their stream', async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      cancel() {
        cancelled = true;
      },
    });
    const handler = createHeliusWebhookHandler({
      authorization,
      trackedVaults: [vault],
      bodyTimeoutMs: 20,
      store: {
        record: async () => {
          throw new Error('Must not persist an incomplete body');
        },
      },
    });
    const response = await handler(bodyRequest(body));
    expect(response.status).toBe(408);
    expect(await response.json()).toEqual({ code: 'REQUEST_TIMEOUT' });
    expect(cancelled).toBe(true);
  });
  it('closes an unread body when authentication or a declared byte limit rejects it', async () => {
    for (const invalidAuth of [true, false]) {
      let cancelled = false;
      const request = bodyRequest(
        new ReadableStream<Uint8Array>({
          cancel() {
            cancelled = true;
          },
        }),
      );
      if (invalidAuth) request.headers.set('authorization', 'Bearer incorrect');
      else request.headers.set('content-length', String(512 * 1024 + 1));
      const handler = createHeliusWebhookHandler({
        authorization,
        trackedVaults: [vault],
        store: { record: async () => {} },
      });
      expect((await handler(request)).status).toBe(invalidAuth ? 401 : 413);
      expect(cancelled).toBe(true);
    }
  });
  it('enforces streamed bytes without relying on a declared body length', async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(512 * 1024 + 1));
      },
      cancel() {
        cancelled = true;
      },
    });
    const handler = createHeliusWebhookHandler({
      authorization,
      trackedVaults: [vault],
      store: { record: async () => {} },
    });
    expect((await handler(bodyRequest(body))).status).toBe(413);
    expect(cancelled).toBe(true);
  });
  it('durably records the full batch and verifies later items after an earlier RPC failure', async () => {
    const otherSignature = '2'.repeat(88);
    const recorded = new Map<string, Verification>();
    const handler = createHeliusWebhookHandler({
      authorization,
      trackedVaults: [vault],
      store: {
        record: async (sig, proof) => {
          recorded.set(sig, proof);
        },
      },
      verifyTransaction: async (sig) => {
        if (sig === signature) throw new Error('Unavailable');
        return { status: 'failed', slot: 123 };
      },
    });
    const response = await handler(
      bodyRequest(JSON.stringify([{ signature }, { signature: otherSignature }])),
    );
    expect(response.status).toBe(503);
    expect(recorded.get(signature)).toEqual({ status: 'pending' });
    expect(recorded.get(otherSignature)).toEqual({ status: 'failed', slot: 123 });
  });
});

describe('bounded finalized RPC transport', () => {
  it('rejects oversized streamed RPC bodies and closes them', async () => {
    let cancelled = false;
    const verify = createSolanaVerifier({
      rpcUrl: 'https://rpc.test',
      programId,
      fetch: async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new Uint8Array(4 * 1024 * 1024 + 1));
            },
            cancel() {
              cancelled = true;
            },
          }),
        ),
    });
    await expect(verify(signature)).rejects.toMatchObject({
      _tag: 'IndexerRpcError',
      code: 'RPC_RESPONSE_LIMIT',
    });
    expect(cancelled).toBe(true);
  });
  it('cancels an incomplete RPC body when its verification deadline expires', async () => {
    let cancelled = false;
    const verify = createSolanaVerifier({
      rpcUrl: 'https://rpc.test',
      programId,
      timeoutMs: 20,
      fetch: async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            cancel() {
              cancelled = true;
            },
          }),
        ),
    });
    await expect(verify(signature)).rejects.toMatchObject({
      _tag: 'IndexerRpcError',
      code: 'RPC_TIMEOUT',
    });
    expect(cancelled).toBe(true);
  });
  it.each([
    { result: null },
    { jsonrpc: '2.0', id: 2, result: null },
    { ...envelope(null), error: null },
  ])('rejects an invalid or mismatched JSON-RPC envelope', async (body) => {
    const verify = createSolanaVerifier({
      rpcUrl: 'https://rpc.test',
      programId,
      fetch: async () => Response.json(body),
    });
    await expect(verify(signature)).rejects.toMatchObject({ code: 'RPC_INVALID_RESPONSE' });
  });
  it.each([undefined, false, 0])(
    'rejects absent or invalid transaction-error metadata',
    async (err) => {
      const meta = err === undefined ? { logMessages: [] } : { logMessages: [], err };
      const verify = createSolanaVerifier({
        rpcUrl: 'https://rpc.test',
        programId,
        fetch: async () =>
          Response.json(envelope({ slot: 123, transaction: { signatures: [signature] }, meta })),
      });
      await expect(verify(signature)).rejects.toMatchObject({ code: 'RPC_INVALID_TRANSACTION' });
    },
  );
  it('closes unsuccessful HTTP response bodies instead of retaining their resources', async () => {
    let cancelled = false;
    const verify = createSolanaVerifier({
      rpcUrl: 'https://rpc.test',
      programId,
      fetch: async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            cancel() {
              cancelled = true;
            },
          }),
          { status: 503 },
        ),
    });
    await expect(verify(signature)).rejects.toMatchObject({ code: 'RPC_UNAVAILABLE' });
    expect(cancelled).toBe(true);
  });
});
