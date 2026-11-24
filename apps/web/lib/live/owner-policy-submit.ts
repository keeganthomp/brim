import { createUpsertAgentPolicyInstruction } from '@brim/sdk';
import { Effect } from 'effect';
import {
  ownerContext,
  policyMatches,
  readOwnerPolicy,
  type OwnerContext,
} from './owner-policy-state';
import { assertOwnerConnection, signOwnerInstructions } from './owner-signing';
import {
  ownerAttempt,
  ownerFailure,
  type OwnerPolicyInput,
  type OwnerWalletConfig,
  type OwnerWalletConnection,
} from './owner-wallet-types';

function checkIntent(context: OwnerContext, input: OwnerPolicyInput, policyAddress: string) {
  return Effect.gen(function* () {
    const existing = yield* readOwnerPolicy(context, policyAddress);
    if (input.intent === 'create' && existing)
      return yield* ownerFailure(
        'POLICY_EXISTS',
        'This agent already has a policy. Open it to update its limits.',
      );
    if (input.intent === 'update' && !existing)
      return yield* ownerFailure(
        'POLICY_MISSING',
        'This agent has no policy. Add it before updating.',
      );
    if (
      existing &&
      (existing.vault !== context.vaultAddress ||
        existing.agentKey !== input.agentKey ||
        existing.windowDuration !== input.limits.windowDuration)
    )
      return yield* ownerFailure(
        'INVALID_POLICY',
        'An existing policy window duration cannot change. Refresh the policy.',
      );
  });
}
export function submitPolicy(
  connection: OwnerWalletConnection,
  config: OwnerWalletConfig,
  input: OwnerPolicyInput,
) {
  return Effect.gen(function* () {
    const reviewed = yield* ownerAttempt(
      () => ({ ...input, limits: { ...input.limits, allowlist: [...input.limits.allowlist] } }),
      'INVALID_POLICY',
      'Review the agent key and policy limits.',
    );
    if (!['create', 'update'].includes(reviewed.intent))
      return yield* ownerFailure('INVALID_POLICY', 'Choose create or update for this policy.');
    const context = yield* ownerContext(config, connection.ownerAddress);
    if (!context.initialized)
      return yield* ownerFailure(
        'VAULT_MISSING',
        'Create your vault before adding an agent policy.',
      );
    yield* assertOwnerConnection(connection, context);
    const built = yield* createUpsertAgentPolicyInstruction({
      programAddress: context.programAddress,
      vaultAddress: context.vaultAddress,
      ownerAddress: context.ownerAddress,
      agentKey: reviewed.agentKey,
      limits: reviewed.limits,
    }).pipe(
      Effect.mapError(() =>
        ownerFailure(
          'INVALID_POLICY',
          'Review the agent public key, limits, and approved recipients.',
        ),
      ),
    );
    yield* checkIntent(context, reviewed, built.policyAddress);
    const signature = yield* signOwnerInstructions(
      connection,
      context,
      [built.instruction],
      'POLICY',
      checkIntent(context, reviewed, built.policyAddress),
    );
    const saved = yield* readOwnerPolicy(context, built.policyAddress, signature);
    if (!saved || !policyMatches(saved, reviewed.agentKey, context, reviewed.limits))
      return yield* ownerFailure(
        'POLICY_READBACK_MISMATCH',
        'The confirmed policy differs from this request. Refresh the vault before another write.',
        signature,
      );
    return { signature, policyAddress: built.policyAddress };
  });
}
