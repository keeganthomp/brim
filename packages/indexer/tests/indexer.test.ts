import { describe, expect, it, vi } from 'vitest';
import {
  createHeliusWebhookHandler,
  createSolanaVerifier,
  parsePaymentLogs,
} from '../src/index.js';
import type { EventStore, Verification } from '../src/index.js';
import { getBase58Decoder } from '@solana/kit';

const program = 'AekkJRGenJd9bgXoYo88xnAGpen9DMqSjkBRZZMMskpo';
const other = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const sig = '1'.repeat(64);
const authorization = 'Bearer test-authentication-value-at-least-32-bytes';
const vault = getBase58Decoder().decode(new Uint8Array(32).fill(1));
function event() {
  const bytes = Buffer.alloc(120);
  bytes.set([153, 165, 141, 18, 246, 20, 204, 227]);
  bytes.fill(1, 8, 40);
  bytes.fill(2, 40, 72);
  bytes.fill(3, 72, 104);
  bytes.writeBigUInt64LE(40_000n, 104);
  bytes.writeBigInt64LE(1_700_000_000n, 112);
  return `Program data: ${bytes.toString('base64')}`;
}
function request(body: unknown, auth = authorization) {
  return new Request('https://brim.test/api/webhooks/helius', {
    method: 'POST',
    headers: { authorization: auth, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
function store(): EventStore & { outcomes: Map<string, Verification> } {
  const outcomes = new Map<string, Verification>();
  return {
    outcomes,
    record: vi.fn(async (signature, proof) => {
      if (outcomes.get(signature)?.status !== 'pending' && outcomes.has(signature)) return;
      outcomes.set(signature, proof);
    }),
  };
}
function rpcResponse(logs: string[], err: unknown = null, signature = sig) {
  return Response.json({
    jsonrpc: '2.0',
    id: 1,
    result: {
      slot: 123,
      transaction: { signatures: [signature] },
      meta: { err, logMessages: logs },
    },
  });
}

describe('canonical log parser', () => {
  it('decodes exact integer amounts only from successful expected-program invocation', () => {
    const result = parsePaymentLogs(
      [`Program ${program} invoke [1]`, event(), `Program ${program} success`],
      program,
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      vault,
      amount: '40000',
      timestamp: '1700000000',
      eventIndex: 0,
    });
  });
  it('ignores child program event spoofing and log text spoofing', () => {
    expect(
      parsePaymentLogs(
        [
          `Program ${program} invoke [1]`,
          `Program ${other} invoke [2]`,
          event(),
          `Program ${other} success`,
          `Program log: Program data: forged`,
          `Program ${program} success`,
        ],
        program,
      ),
    ).toEqual([]);
  });
  it('discards events from failed parent even if inner target succeeded', () => {
    expect(
      parsePaymentLogs(
        [
          `Program ${other} invoke [1]`,
          `Program ${program} invoke [2]`,
          event(),
          `Program ${program} success`,
          `Program ${other} failed: custom program error: 0x1`,
        ],
        program,
      ),
    ).toEqual([]);
  });
  it('rejects truncated logs rather than reporting settlement', () => {
    expect(() => parsePaymentLogs([`Program ${program} invoke [1]`, event()], program)).toThrow(
      'RPC_LOG_TRUNCATED',
    );
  });
});

describe('Solana finalized transaction verifier', () => {
  it('requests finalized v0-compatible transactions and binds proof to signature', async () => {
    const fetcher = vi.fn(async () =>
      rpcResponse([`Program ${program} invoke [1]`, event(), `Program ${program} success`]),
    );
    const verify = createSolanaVerifier({
      rpcUrl: 'https://rpc.test',
      programId: program,
      fetch: fetcher,
    });
    expect(await verify(sig)).toMatchObject({ status: 'settled', slot: 123 });
    const init = fetcher.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(init.body as string).params[1]).toEqual({
      commitment: 'finalized',
      encoding: 'json',
      maxSupportedTransactionVersion: 0,
    });
  });
  it('cannot settle rolled back events in failed transactions', async () => {
    const verify = createSolanaVerifier({
      rpcUrl: 'https://rpc.test',
      programId: program,
      fetch: async () =>
        rpcResponse([`Program ${program} invoke [1]`, event()], { InstructionError: [0, 1] }),
    });
    expect(await verify(sig)).toEqual({ status: 'failed', slot: 123 });
  });
  it('rejects mismatched RPC signature and returns pending for missing transaction', async () => {
    const wrong = createSolanaVerifier({
      rpcUrl: 'https://rpc.test',
      programId: program,
      fetch: async () => rpcResponse([], null, '2'.repeat(88)),
    });
    await expect(wrong(sig)).rejects.toThrow('RPC_INVALID_TRANSACTION');
    const pending = createSolanaVerifier({
      rpcUrl: 'https://rpc.test',
      programId: program,
      fetch: async () => Response.json({ jsonrpc: '2.0', id: 1, result: null }),
    });
    expect(await pending(sig)).toEqual({ status: 'pending' });
  });
});

describe('authenticated webhook intake', () => {
  it('rejects invalid authentication before reading or verifying claims', async () => {
    const verify = vi.fn();
    const db = store();
    const handler = createHeliusWebhookHandler({
      authorization,
      trackedVaults: [vault],
      store: db,
      verifyTransaction: verify,
    });
    expect((await handler(request([{ signature: sig }], 'Bearer wrong'))).status).toBe(401);
    expect(verify).not.toHaveBeenCalled();
    expect(db.outcomes.size).toBe(0);
  });
  it('stores a forged settled webhook as pending without an independent verifier', async () => {
    const db = store();
    const handler = createHeliusWebhookHandler({
      authorization,
      trackedVaults: [vault],
      store: db,
    });
    expect(
      (await handler(request([{ signature: sig, status: 'settled', amount: '9000000' }]))).status,
    ).toBe(200);
    expect(db.outcomes.get(sig)).toEqual({ status: 'pending' });
  });
  it('deduplicates a batch and preserves finalized outcomes across repeated deliveries', async () => {
    const db = store();
    const verify = vi.fn(async (): Promise<Verification> => ({ status: 'failed', slot: 1 }));
    const handler = createHeliusWebhookHandler({
      authorization,
      trackedVaults: [vault],
      store: db,
      verifyTransaction: verify,
    });
    await handler(request([{ signature: sig }, { signature: sig }]));
    expect(verify).toHaveBeenCalledTimes(1);
    await handler(request([{ signature: sig }]));
    expect(db.outcomes.size).toBe(1);
    expect(db.outcomes.get(sig)?.status).toBe('failed');
  });
  it('never settles payments for a vault outside configured tracking scope', async () => {
    const db = store();
    const payment = parsePaymentLogs(
      [`Program ${program} invoke [1]`, event(), `Program ${program} success`],
      program,
    )[0]!;
    const handler = createHeliusWebhookHandler({
      authorization,
      trackedVaults: [other],
      store: db,
      verifyTransaction: async () => ({ status: 'settled', slot: 1, payments: [payment] }),
    });
    await handler(request([{ signature: sig }]));
    expect(db.outcomes.get(sig)?.status).toBe('unrelated');
  });
  it('bounds payload bytes and batch length', async () => {
    const handler = createHeliusWebhookHandler({
      authorization,
      trackedVaults: [vault],
      store: store(),
    });
    expect(
      (await handler(request([{ signature: sig, junk: 'x'.repeat(512 * 1024) }]))).status,
    ).toBe(413);
    expect(
      (await handler(request(Array.from({ length: 51 }, () => ({ signature: sig }))))).status,
    ).toBe(400);
  });
  it('asks Helius to retry until independently finalized instead of acknowledging pending proof', async () => {
    const db = store();
    const handler = createHeliusWebhookHandler({
      authorization,
      trackedVaults: [vault],
      store: db,
      verifyTransaction: async () => ({ status: 'pending' }),
    });
    const result = await handler(request([{ signature: sig }]));
    expect(result.status).toBe(503);
    expect(await result.json()).toEqual({ code: 'AWAITING_FINALITY' });
    expect(db.outcomes.get(sig)).toEqual({ status: 'pending' });
  });
  it('rejects malformed signatures before writing notification records', async () => {
    const db = store();
    const handler = createHeliusWebhookHandler({
      authorization,
      trackedVaults: [vault],
      store: db,
    });
    expect((await handler(request([{ signature: 'not-a-solana-signature' }]))).status).toBe(400);
    expect(db.outcomes.size).toBe(0);
  });
  it('responds retryably on RPC failure and leaves unfinalized record pending', async () => {
    const db = store();
    const handler = createHeliusWebhookHandler({
      authorization,
      trackedVaults: [vault],
      store: db,
      verifyTransaction: async () => {
        throw new Error('sensitive endpoint string');
      },
    });
    const result = await handler(request([{ signature: sig }]));
    expect(result.status).toBe(503);
    expect(await result.text()).not.toContain('sensitive');
    expect(db.outcomes.get(sig)?.status).toBe('pending');
  });
});
