import { getBase58Decoder } from '@solana/kit';
import { IndexerRpcError } from './errors.js';
import type { CanonicalPayment } from './types.js';

const PAYMENT_EVENT = Buffer.from([153, 165, 141, 18, 246, 20, 204, 227]);
const addressDecoder = getBase58Decoder();
export const INVOKE = /^Program ([1-9A-HJ-NP-Za-km-z]{32,44}) invoke \[(\d+)\]$/;
const END = /^Program ([1-9A-HJ-NP-Za-km-z]{32,44}) (success|failed:.*)$/;
const MAX_LOG_BYTES = 2 * 1024 * 1024;

function paymentEvent(base64: string, eventIndex: number): CanonicalPayment | null {
  // Strict canonical base64: Buffer otherwise silently accepts malformed input.
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) return null;
  const bytes = Buffer.from(base64, 'base64');
  if (
    bytes.toString('base64') !== base64 ||
    bytes.length !== 120 ||
    !bytes.subarray(0, 8).equals(PAYMENT_EVENT)
  )
    return null;
  const amount = bytes.readBigUInt64LE(104);
  if (amount === 0n) return null;
  return {
    vault: addressDecoder.decode(bytes.subarray(8, 40)),
    agentKey: addressDecoder.decode(bytes.subarray(40, 72)),
    recipient: addressDecoder.decode(bytes.subarray(72, 104)),
    amount: amount.toString(),
    timestamp: bytes.readBigInt64LE(112).toString(),
    eventIndex,
  };
}

/** Ignore CPI child emissions and roll back events from failed enclosing invocations. */
export function parsePaymentLogs(logs: readonly string[], programId: string): CanonicalPayment[] {
  if (logs.reduce((sum, log) => sum + Buffer.byteLength(log), 0) > MAX_LOG_BYTES)
    throw new IndexerRpcError({ code: 'RPC_LOG_LIMIT' });
  const stack: { program: string; payments: CanonicalPayment[] }[] = [];
  const committed: CanonicalPayment[] = [];
  let eventIndex = 0;
  for (const log of logs) {
    const invoke = INVOKE.exec(log);
    if (invoke) {
      if (Number(invoke[2]) !== stack.length + 1)
        throw new IndexerRpcError({ code: 'RPC_LOG_STACK' });
      stack.push({ program: invoke[1]!, payments: [] });
      continue;
    }
    const end = END.exec(log);
    if (end) {
      const frame = stack.pop();
      if (!frame || frame.program !== end[1]) throw new IndexerRpcError({ code: 'RPC_LOG_STACK' });
      if (end[2] === 'success') {
        const parent = stack.at(-1);
        if (parent) parent.payments.push(...frame.payments);
        else committed.push(...frame.payments);
      }
      continue;
    }
    const frame = stack.at(-1);
    if (frame?.program === programId && log.startsWith('Program data: ')) {
      const payment = paymentEvent(log.slice(14), eventIndex++);
      if (payment) frame.payments.push(payment);
      if (eventIndex > 64) throw new IndexerRpcError({ code: 'RPC_EVENT_LIMIT' });
    }
  }
  if (stack.length) throw new IndexerRpcError({ code: 'RPC_LOG_TRUNCATED' });
  return committed;
}
