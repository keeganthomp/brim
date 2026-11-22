import { Data } from 'effect';

export type BrimErrorCode =
  | 'INVALID_CARD'
  | 'UNSUPPORTED_CARD_VERSION'
  | 'INVALID_CONFIG'
  | 'INVALID_PAYMENT_REQUIREMENTS'
  | 'UNSUPPORTED_PAYMENT'
  | 'UNTRUSTED_FEE_PAYER'
  | 'INVALID_ACCOUNT'
  | 'VAULT_PAUSED'
  | 'AGENT_FROZEN'
  | 'PER_TRANSACTION_LIMIT_EXCEEDED'
  | 'WINDOW_LIMIT_EXCEEDED'
  | 'RATE_LIMIT_EXCEEDED'
  | 'RECIPIENT_NOT_ALLOWED'
  | 'PAYMENT_REJECTED'
  | 'RPC_UNAVAILABLE'
  | 'SIGNING_FAILED'
  | 'REQUEST_FAILED'
  | 'PAYMENT_OUTCOME_UNKNOWN';

export class BrimPolicyViolationError extends Data.TaggedError('BrimPolicyViolationError')<{
  readonly code: BrimErrorCode;
  readonly message: string;
}> {
  constructor(code: BrimErrorCode, message: string) {
    super({ code, message });
  }
}
export function fail(code: BrimErrorCode, message: string): never {
  throw new BrimPolicyViolationError(code, message);
}
