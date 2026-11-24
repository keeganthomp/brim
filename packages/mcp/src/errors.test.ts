import { Cause } from 'effect';
import { describe, expect, it } from 'vitest';
import { McpFailure, toolFailureDiagnostic } from './errors.js';

describe('MCP payment cancellation diagnostics', () => {
  it('treats an interrupted paid call as uncertain even without an aborted client signal', () => {
    expect(toolFailureDiagnostic(Cause.interrupt(), 'brim_fetch')).toEqual({
      code: 'PAYMENT_OUTCOME_UNKNOWN',
      message: 'Payment outcome is unknown. Reconcile settlement before any retry.',
    });
  });

  it('never downgrades an aborted paid request using an exception or provider diagnostic', () => {
    const cause = Cause.fail(
      new McpFailure({
        code: 'RPC_UNAVAILABLE',
        message: 'SECRET_PROVIDER_CAUSE',
      }),
    );
    const result = toolFailureDiagnostic(cause, 'brim_fetch', true);
    expect(result.code).toBe('PAYMENT_OUTCOME_UNKNOWN');
    expect(result.message).not.toContain('SECRET_PROVIDER_CAUSE');
    expect(result.message).toContain('before any retry');
  });

  it('preserves known rejection codes on a paid call that was not canceled', () => {
    const result = toolFailureDiagnostic(
      Cause.fail(
        new McpFailure({
          code: 'AGENT_FROZEN',
          message: 'SECRET_INTERNAL_DETAILS',
        }),
      ),
      'brim_fetch',
    );
    expect(result.code).toBe('AGENT_FROZEN');
    expect(result.message).not.toContain('SECRET_INTERNAL_DETAILS');
  });

  it('does not describe canceled read-only tools as payments', () => {
    for (const name of ['brim_balance', 'brim_policy']) {
      expect(toolFailureDiagnostic(Cause.interrupt(), name, true).code).not.toBe(
        'PAYMENT_OUTCOME_UNKNOWN',
      );
    }
  });
});
