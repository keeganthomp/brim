import { describe, expect, it } from 'vitest';
import { BrimPolicyViolationError, checkPolicy, parseAtomicAmount } from '../src/index.js';
import { policy, MERCHANT, OWNER, error } from './sharedfixtures.js';

describe('integer policy bounds', () => {
  it('preserves precision and rejects malformed or overflowing amounts', () => {
    expect(parseAtomicAmount('18446744073709551615')).toBe(18446744073709551615n);
    for (const bad of ['0', '-1', '1.1', '01', '1e6', '18446744073709551616', 1, null])
      expect(() => parseAtomicAmount(bad)).toThrow(BrimPolicyViolationError);
  });
  it('enforces exact window boundary and minimum interval', () => {
    expect(() => checkPolicy(policy, 1_000_000n, MERCHANT, 1102n)).not.toThrow();
    expect(() => checkPolicy(policy, 1n, MERCHANT, 1101n)).toThrow(error('RATE_LIMIT_EXCEEDED'));
    expect(() =>
      checkPolicy({ ...policy, windowSpent: policy.windowLimit }, 1n, MERCHANT, 87399n),
    ).toThrow(error('WINDOW_LIMIT_EXCEEDED'));
    expect(() =>
      checkPolicy({ ...policy, windowSpent: policy.windowLimit }, 1n, MERCHANT, 87400n),
    ).not.toThrow();
  });
  it('blocks pause/freeze, cap overflow, backward clocks and unknown recipients', () => {
    expect(() => checkPolicy(policy, 1n, MERCHANT, 1102n, true)).toThrow(error('VAULT_PAUSED'));
    expect(() => checkPolicy({ ...policy, isFrozen: true }, 1n, MERCHANT, 1102n)).toThrow(
      error('AGENT_FROZEN'),
    );
    expect(() => checkPolicy(policy, 1_000_001n, MERCHANT, 1102n)).toThrow(
      error('PER_TRANSACTION_LIMIT_EXCEEDED'),
    );
    expect(() => checkPolicy(policy, 1n, OWNER, 1102n)).toThrow(error('RECIPIENT_NOT_ALLOWED'));
    expect(() => checkPolicy(policy, 1n, MERCHANT, 999n)).toThrow(error('INVALID_ACCOUNT'));
  });
});

describe('epoch-zero policy state', () => {
  it('distinguishes an unused policy from a payment recorded at Unix zero', () => {
    const initial = {
      ...policy,
      windowStart: 0n,
      windowSpent: 0n,
      lastTxTs: 0n,
      minTxInterval: 5n,
    };
    expect(() => checkPolicy(initial, 1n, MERCHANT, 0n)).not.toThrow();
    const spent = { ...initial, windowSpent: 1n };
    expect(() => checkPolicy(spent, 1n, MERCHANT, 0n)).toThrow(error('RATE_LIMIT_EXCEEDED'));
    expect(() => checkPolicy(spent, 1n, MERCHANT, 4n)).toThrow(error('RATE_LIMIT_EXCEEDED'));
    expect(() => checkPolicy(spent, 1n, MERCHANT, 5n)).not.toThrow();
    expect(() => checkPolicy(initial, 1n, MERCHANT, -1n)).toThrow(error('INVALID_ACCOUNT'));
  });
});
