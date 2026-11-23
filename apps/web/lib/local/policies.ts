import { Effect, Schema } from 'effect';
import { policyError, preparePolicyInput, type PolicyIntent } from '../chain/policy-input';
import type { Agent } from '../demo-model';

const messages = {
  INVALID_POLICY: 'Check the public key and spending limits.',
  LOCAL_ONLY: 'Policy registration requires the local workspace started with npm run dev.',
  POLICY_LIMIT_REACHED: 'This test vault has reached its policy limit.',
  POLICY_EXISTS: 'This public key already has a policy. Open that policy to change its limits.',
  POLICY_MISSING: 'This policy is no longer on the test chain. Reopen the policy list.',
  LOCAL_POLICY_UNAVAILABLE: 'The test chain is unavailable. Check that Brim is running locally.',
  POLICY_REJECTED: 'Solana rejected the policy change. Check the limits and try again.',
  CONFIRMATION_PENDING:
    'The transaction may still be confirming. Check your policies before retrying.',
};

const reply = Schema.Struct({ status: Schema.Literal('confirmed'), agentKey: Schema.String });
const pending = () => policyError(messages.CONFIRMATION_PENDING);

const savePolicy = (draft: Agent, intent: PolicyIntent) =>
  Effect.gen(function* () {
    const { agentKey, limits } = yield* preparePolicyInput(draft);

    const response = yield* Effect.tryPromise({
      try: (signal) =>
        fetch('/api/local/policies', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            intent,
            agentKey,
            maxPerTxBaseUnits: limits.maxPerTx.toString(),
            windowLimitBaseUnits: limits.windowLimit.toString(),
            minTxInterval: Number(limits.minTxInterval),
            allowlistEnabled: limits.allowlistEnabled,
            allowlist: limits.allowlist,
          }),
          signal,
        }),
      catch: pending,
    });
    const body: unknown = yield* Effect.tryPromise({ try: () => response.json(), catch: pending });
    if (!response.ok || response.status === 202) {
      const code = body && typeof body === 'object' && 'code' in body ? body.code : null;
      return yield* typeof code === 'string' && Object.hasOwn(messages, code)
        ? policyError(messages[code as keyof typeof messages])
        : pending();
    }
    const result = yield* Schema.decodeUnknownEffect(reply)(body).pipe(Effect.mapError(pending));
    if (result.agentKey !== agentKey) return yield* pending();
  }).pipe(
    Effect.timeout('30 seconds'),
    Effect.mapError((error) => (error._tag === 'TimeoutError' ? pending() : error)),
  );

export function saveLocalPolicy(draft: Agent, intent: PolicyIntent) {
  return Effect.runPromise(
    savePolicy(draft, intent).pipe(
      Effect.match({
        onSuccess: () => ({ success: true as const }),
        onFailure: (error) => ({ success: false as const, message: error.message }),
      }),
    ),
  );
}
