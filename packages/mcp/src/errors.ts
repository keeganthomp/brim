import { Data, Effect, type Cause } from 'effect';

export class McpFailure extends Data.TaggedError('McpFailure')<{
  code: string;
  message: string;
}> {}

export const fail = (code: string, message: string) =>
  Effect.fail(new McpFailure({ code, message }));
export const io = <A>(
  work: (signal: AbortSignal) => PromiseLike<A>,
  code: string,
  message: string,
) => Effect.tryPromise({ try: work, catch: () => new McpFailure({ code, message }) });
export const attempt = <A>(work: () => A, code: string, message: string) =>
  Effect.try({
    try: work,
    catch: (error) => (error instanceof McpFailure ? error : new McpFailure({ code, message })),
  });

const PUBLIC_MESSAGES: Readonly<Record<string, string>> = {
  SETUP_REQUIRED:
    'Set BRIM_VAULT_CONFIG and BRIM_AGENT_KEY before starting Brim MCP. SOLANA_RPC_URL is optional.',
  INVALID_OPTIONS:
    'Use --local CONFIG [--agent-key-file PRIVATE_KEY_FILE], or configure BRIM_VAULT_CONFIG and BRIM_AGENT_KEY.',
  LOCAL_SETUP_REQUIRED: 'Start the local Brim stack before using --local.',
  INVALID_LOCAL_SETUP: 'Recreate the local Brim configuration and check its loopback RPC.',
  INVALID_CARD: 'Ask your operator for valid Brim vault configuration.',
  UNSUPPORTED_CARD_VERSION: 'Ask your operator for supported v1 Brim vault configuration.',
  INVALID_CONFIG: 'Check your Brim vault config, scoped agent key, and Solana RPC configuration.',
  INVALID_ARGUMENTS:
    'Use only the documented tool arguments. Vault config, key, and RPC settings belong in server configuration.',
  UNKNOWN_TOOL: 'Choose brim_balance, brim_policy, or brim_fetch.',
  RPC_UNAVAILABLE: 'Solana RPC is unavailable. Check the configured connection.',
  INVALID_ACCOUNT:
    'The vault account or agent policy is unavailable. Ask your operator to finish setup.',
  AGENT_FROZEN: 'This agent is frozen. Ask your operator to review its policy.',
  VAULT_PAUSED: 'The vault is paused. Ask your operator to review its status.',
  PER_TRANSACTION_LIMIT_EXCEEDED: 'Payment exceeds this agent’s per-request spending cap.',
  WINDOW_LIMIT_EXCEEDED: 'This agent’s spending window budget is exhausted.',
  RATE_LIMIT_EXCEEDED: 'This agent must wait before making another payment.',
  RECIPIENT_NOT_ALLOWED: 'The recipient is outside this agent’s approved vendor list.',
  UNSUPPORTED_PAYMENT: 'The merchant does not offer a compatible Brim payment.',
  INVALID_PAYMENT_REQUIREMENTS: 'The merchant sent invalid payment details.',
  UNTRUSTED_FEE_PAYER: 'The merchant advertised an untrusted facilitator.',
  SIGNING_FAILED: 'Check the scoped agent key configured for this vault.',
  PAYMENT_REJECTED: 'Payment was rejected. Check settlement before attempting another payment.',
  PAYMENT_OUTCOME_UNKNOWN: 'Payment outcome is unknown. Reconcile settlement before any retry.',
  REQUEST_FAILED: 'The API request failed. Check connection and settlement before retrying.',
  REQUEST_TIMEOUT: 'The request timed out. Check settlement before making another paid request.',
  RESPONSE_TOO_LARGE:
    'The API response is too large. Payment may already be settled; do not repeat it automatically.',
  INVALID_RESULT: 'The tool returned an invalid result.',
};
export function publicDiagnostic(code: unknown) {
  const allowed = typeof code === 'string' && Object.hasOwn(PUBLIC_MESSAGES, code);
  return {
    code: allowed ? code : 'TOOL_FAILED',
    message: allowed
      ? PUBLIC_MESSAGES[code]!
      : 'The tool could not complete. Check setup and connection before retrying.',
  };
}

/** Shared protocol/process boundary: never serialize a defect or provider cause. */
export function failureDiagnostic(cause: Cause.Cause<unknown>) {
  for (const reason of cause.reasons) {
    if (reason._tag === 'Fail' && reason.error instanceof McpFailure) {
      return publicDiagnostic(reason.error.code);
    }
  }
  return publicDiagnostic(undefined);
}
