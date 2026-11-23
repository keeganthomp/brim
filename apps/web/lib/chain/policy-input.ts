import { isAddress, isOffCurveAddress } from '@solana/kit';
import { Data, Effect } from 'effect';
import { policyRecipients } from '../agent-policy';
import type { Agent } from '../demo-model';

export type PolicyIntent = 'create' | 'update';
export class PolicySaveError extends Data.TaggedError('PolicySaveError')<{ message: string }> {}

export const policyError = (message: string) => new PolicySaveError({ message });
const defaultAddress = '11111111111111111111111111111111';

function baseUnits(amount: number) {
  const units = Math.round(amount * 1_000_000);
  return Number.isSafeInteger(units) && units > 0 && units / 1_000_000 === amount
    ? BigInt(units)
    : undefined;
}

export const preparePolicyInput = (draft: Agent) =>
  Effect.gen(function* () {
    const agentKey = draft.agentKey?.trim() ?? '';
    if (!isAddress(agentKey) || isOffCurveAddress(agentKey) || agentKey === defaultAddress)
      return yield* policyError('Paste a valid agent public key.');

    const maxPerTx = baseUnits(draft.cap);
    const windowLimit = baseUnits(draft.budget);
    if (!maxPerTx || !windowLimit || maxPerTx > windowLimit)
      return yield* policyError(
        'Enter positive USDC limits with up to six decimals. The cap must fit the budget.',
      );

    const minTxInterval = draft.minTxInterval ?? 0;
    if (!Number.isSafeInteger(minTxInterval) || minTxInterval < 0)
      return yield* policyError('Enter a whole number of seconds, starting at zero.');

    const allowlist = policyRecipients(draft.recipients);
    if (
      allowlist.length > 16 ||
      allowlist.some((recipient) => !isAddress(recipient) || recipient === defaultAddress)
    )
      return yield* policyError('Use up to 16 Solana wallet addresses for approved recipients.');

    return {
      agentKey,
      limits: {
        maxPerTx,
        windowLimit,
        windowDuration: BigInt(draft.windowDuration ?? '86400'),
        minTxInterval: BigInt(minTxInterval),
        allowlistEnabled: draft.allowlistEnabled,
        allowlist,
      },
    };
  });
