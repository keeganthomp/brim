import type { BrimNetwork } from './constants.js';
import type { BrimErrorCode } from './errors.js';

/** Public metadata only. This API never accepts a signing key. */
export interface BrimConnectionInput {
  vaultConfig: string;
  agentPublicKey: string;
  rpcUrl?: string | undefined;
  /** Optional trusted destination. Probe from a client/CLI, never from untrusted server input. */
  resourceUrl?: string | undefined;
  /** Overrides only the optional resource GET, consistently with createBrimFetch. */
  fetch?: typeof globalThis.fetch | undefined;
}

export interface BrimConnectionIssue {
  code: BrimErrorCode | 'POLICY_NOT_FOUND' | 'VAULT_EMPTY' | 'INSUFFICIENT_BALANCE';
  message: string;
}

export interface BrimConnectionPolicy {
  isFrozen: boolean;
  maxPerTxBaseUnits: string;
  windowLimitBaseUnits: string;
  windowRemainingBaseUnits: string;
  minTxIntervalSeconds: string;
  nextPaymentAt: string;
}

export interface BrimMerchantCheck {
  status: 'free' | 'quote';
  httpStatus: number;
  /** An advertised quote cannot prove the facilitator will accept or settle a transaction. */
  facilitatorAcceptance: 'unverified';
  amountBaseUnits?: string;
  recipient?: string;
  feePayer?: string;
}

/** Advisory chain snapshot, not a reservation, signature, or settlement proof. */
export interface BrimConnectionReport {
  network: BrimNetwork;
  vaultAddress: string;
  agentPublicKey: string;
  policyAddress: string;
  vaultTokenAccount: string;
  mint: string;
  balanceBaseUnits: string;
  vaultPaused: boolean;
  policy: BrimConnectionPolicy | null;
  merchant?: BrimMerchantCheck;
  /** All requested checks passed at this snapshot; future acceptance is not guaranteed. */
  ready: boolean;
  blockers: BrimConnectionIssue[];
}
