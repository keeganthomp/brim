import type { Effect } from 'effect';
import type { BrimPolicyViolationError } from './errors.js';
import type { BrimNetwork } from './constants.js';
import type { BrimErrorCode } from './errors.js';

export interface BrimEvent {
  /** Client observation only; never proof of on-chain settlement. */
  status: 'blocked' | 'payment_signed' | 'payment_rejected';
  merchant: string;
  amount?: string;
  code?: BrimErrorCode;
}
/** Setup metadata your operator creates once. Safe to share; conveys no authority. */
export interface BrimCardDetails {
  vaultAddress: string;
  programAddress: string;
  network: BrimNetwork;
  /** Only after confirming that this facilitator supports the deployed program. */
  facilitatorFeePayers: readonly string[];
}

/** The everyday agent setup. Keep the scoped agent key private. */
export interface BrimCardConfig {
  card: string;
  agentKey: string | Uint8Array;
  /** Optional provider override. Defaults to the card network's public Solana RPC. */
  rpcUrl?: string | undefined;
  /** Optional extra local cap; defaults to $1 USDC per request. */
  maxPaymentAmount?: bigint;
  fetch?: typeof globalThis.fetch;
  onEvent?: (event: BrimEvent) => void | Promise<void>;
}

/** Advanced setup for integrations managing routing fields directly. */
export interface BrimConfig {
  vaultAddress: string;
  programAddress: string;
  agentSecretKey: string | Uint8Array;
  /** Optional provider override. Defaults to the card network's public Solana RPC. */
  rpcUrl?: string | undefined;
  network: BrimNetwork;
  /** Operator affirmation: this facilitator enables smart wallet simulation AND allowlists this program. */
  facilitator: { mode: 'smart-wallet-exact'; feePayers: readonly string[] };
  /** Additional local bound; defaults to 1 USDC (1_000_000 atomic units). */
  maxPaymentAmount?: bigint;
  fetch?: typeof globalThis.fetch;
  onEvent?: (event: BrimEvent) => void | Promise<void>;
}
/** Resolved internally before any RPC client or payment adapter is constructed. */
export interface ResolvedBrimConfig extends BrimConfig {
  rpcUrl: string;
}
export interface ValidatedPayment {
  amount: bigint;
  asset: string;
  recipient: string;
  feePayer: string;
  memo?: string;
}

export type BrimEffectFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Effect.Effect<Response, BrimPolicyViolationError>;
