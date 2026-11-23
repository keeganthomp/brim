import * as Data from 'effect/Data';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';
import { isAddress } from '@solana/kit';
import { AgentSchema, type Agent } from './demo-model';

export class DemoPolicyError extends Data.TaggedError('DemoPolicyError')<{
  message: string;
}> {}

const EditablePolicySchema = AgentSchema.check(
  Schema.makeFilter((draft) => {
    const recipients = policyRecipients(draft.recipients);
    if (!draft.name.trim()) return 'Give this agent a name.';
    if (draft.agentKey?.trim() && !isAddress(draft.agentKey.trim()))
      return 'Enter a valid Solana public key.';
    if (
      ![draft.cap, draft.budget, draft.requests].every(
        (value) => Number.isFinite(value) && value > 0,
      ) ||
      draft.cap > draft.budget
    ) {
      return 'Limits must be positive, and the payment cap cannot exceed the daily budget.';
    }
    if (!Number.isInteger(draft.requests) || draft.requests > 60) {
      return 'Choose a whole number between 1 and 60 requests per minute.';
    }
    if (
      draft.allowlistEnabled &&
      (recipients.length === 0 ||
        recipients.length > 16 ||
        recipients.some((address) => !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)))
    ) {
      return 'Add 1–16 Solana recipient addresses. Domains cannot be enforced on-chain.';
    }
  }),
);

export const policyRecipients = (value: string) => [
  ...new Set(value.split(/[\s,]+/).filter(Boolean)),
];

/** Decode and normalize a policy before it reaches the demo state store. */
export const prepareDemoPolicy = (draft: Agent) =>
  Schema.decodeUnknownEffect(EditablePolicySchema)(draft).pipe(
    Effect.mapError((error) => new DemoPolicyError({ message: error.message })),
    Effect.map((valid) => ({
      ...valid,
      name: valid.name.trim(),
      ...(valid.agentKey !== undefined ? { agentKey: valid.agentKey.trim() } : {}),
      recipients: policyRecipients(valid.recipients).join('\n'),
    })),
  );

/** Promise boundary keeps the Effect and schema runtime out of the dashboard shell. */
export const validateDemoPolicy = (draft: Agent) =>
  Effect.runPromise(
    prepareDemoPolicy(draft).pipe(
      Effect.match({
        onSuccess: (value) => ({ success: true as const, value }),
        onFailure: (error) => ({ success: false as const, message: error.message }),
      }),
    ),
  );
