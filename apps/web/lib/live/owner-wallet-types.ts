import { Data, Effect } from 'effect';
import type { Wallet, WalletAccount } from '@wallet-standard/base';
import type { BrimNetwork, BrimNetworkName, OwnerPolicyLimits } from '@brim/sdk';

export interface ExistingOwnerWalletConfig {
  vaultConfig: string;
  rpcUrl?: string | undefined;
}
export interface OwnerDeploymentConfig {
  programAddress: string;
  network: BrimNetwork | BrimNetworkName;
  facilitatorFeePayers: readonly string[];
  rpcUrl?: string | undefined;
}
export type OwnerWalletConfig = ExistingOwnerWalletConfig | OwnerDeploymentConfig;
export interface WalletChoice {
  id: string;
  name: string;
  connected: boolean;
  wallet: Wallet;
  ownerAddress?: string;
}
export interface OwnerWalletConnection {
  choiceId: string;
  wallet: Wallet;
  account: WalletAccount;
  ownerAddress: string;
  vaultConfig: string;
  vaultAddress: string;
  initialized: boolean;
}
export interface OwnerPolicyInput {
  agentKey: string;
  limits: OwnerPolicyLimits;
  intent: 'create' | 'update';
}
export class OwnerWalletError extends Data.TaggedError('OwnerWalletError')<{
  code: string;
  message: string;
  signature?: string;
}> {}
export const ownerFailure = (code: string, message: string, signature?: string) =>
  new OwnerWalletError({ code, message, ...(signature ? { signature } : {}) });
export const ownerAttempt = <A>(work: () => A, code: string, message: string) =>
  Effect.try({
    try: work,
    catch: (error) => (error instanceof OwnerWalletError ? error : ownerFailure(code, message)),
  });
export const ownerIo = <A>(
  work: (signal: AbortSignal) => PromiseLike<A>,
  code: string,
  message: string,
  signature?: string,
) => Effect.tryPromise({ try: work, catch: () => ownerFailure(code, message, signature) });

/** RPC deadlines never apply to a user-controlled wallet approval dialog. */
export const ownerRpc = <A>(
  work: (signal: AbortSignal) => PromiseLike<A>,
  code: string,
  message: string,
  signature?: string,
) =>
  ownerIo(work, code, message, signature).pipe(
    Effect.timeout(10_000),
    Effect.mapError((error) =>
      error._tag === 'TimeoutError' ? ownerFailure(code, message, signature) : error,
    ),
  );
