import { Schema } from 'effect';
import { AtomicAmountSchema } from './schemas.js';
import { fail } from './errors.js';

export interface AgentPolicySnapshot {
  vault: string;
  agentKey: string;
  isFrozen: boolean;
  maxPerTx: bigint;
  windowLimit: bigint;
  windowDuration: bigint;
  windowStart: bigint;
  windowSpent: bigint;
  minTxInterval: bigint;
  lastTxTs: bigint;
  allowlistEnabled: boolean;
  allowlist: readonly string[];
}

export function parseAtomicAmount(value: unknown): bigint {
  let input: string;
  try {
    input = Schema.decodeUnknownSync(AtomicAmountSchema)(value);
  } catch {
    fail('INVALID_PAYMENT_REQUIREMENTS', 'Amount must be a positive integer in USDC base units.');
  }
  const amount = BigInt(input);
  if (amount > 0xffff_ffff_ffff_ffffn) fail('INVALID_PAYMENT_REQUIREMENTS', 'Amount exceeds u64.');
  return amount;
}

/** Local advisory check. The program serializes account writes and remains authoritative. */
export function checkPolicy(
  policy: AgentPolicySnapshot,
  amount: bigint,
  recipient: string,
  now: bigint,
  vaultPaused = false,
): void {
  if (vaultPaused) fail('VAULT_PAUSED', 'Vault is paused.');
  if (policy.isFrozen) fail('AGENT_FROZEN', 'Agent is frozen.');
  if (amount <= 0n || amount > policy.maxPerTx)
    fail('PER_TRANSACTION_LIMIT_EXCEEDED', 'Per-transaction cap exceeded.');
  if (
    policy.windowDuration <= 0n ||
    policy.minTxInterval < 0n ||
    now < policy.windowStart ||
    (policy.lastTxTs > 0n && now < policy.lastTxTs)
  ) {
    fail('INVALID_ACCOUNT', 'Policy timestamps or limits are invalid.');
  }
  if (policy.lastTxTs > 0n && now - policy.lastTxTs < policy.minTxInterval)
    fail('RATE_LIMIT_EXCEEDED', 'Minimum payment interval has not elapsed.');
  const spent = now - policy.windowStart >= policy.windowDuration ? 0n : policy.windowSpent;
  if (spent + amount > policy.windowLimit)
    fail('WINDOW_LIMIT_EXCEEDED', 'Spending window cap exceeded.');
  if (policy.allowlistEnabled && !policy.allowlist.includes(recipient))
    fail('RECIPIENT_NOT_ALLOWED', 'Recipient is outside the on-chain allowlist.');
}
