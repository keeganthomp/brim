/** Everyday API: createBrimFetch({ vaultConfig, agentKey }). */
export { createBrimFetch, createBrimFetchEffect } from './fetch.js';
export {
  createBrimVaultConfig,
  readBrimVaultConfig,
  createBrimVaultConfig as createBrimCard,
  readBrimVaultConfig as readBrimCard,
} from './vault-config.js';
export { BrimPolicyViolationError } from './errors.js';
export type { BrimErrorCode } from './errors.js';
export type {
  BrimConfig,
  BrimVaultConfig,
  BrimVaultConfigDetails,
  BrimCardConfig,
  BrimCardDetails,
  BrimEvent,
  BrimEffectFetch,
} from './types.js';

/** Lower-level helpers for operator integrations. */
export { NETWORKS, BRIM_NETWORK_IDS, BRIM_DEVELOPMENT_PROGRAM_ADDRESS } from './constants.js';
export type { BrimNetwork, BrimNetworkName } from './constants.js';
export { checkPolicy, parseAtomicAmount } from './policy.js';
export type { AgentPolicySnapshot } from './policy.js';
export { decodeAgentPolicy, findBrimPolicyAddress, findTokenAccount } from './solana.js';
export { validatePaymentRequirements } from './validation.js';

export { resolveBrimRpcUrl } from './rpc.js';

export { createUpsertAgentPolicyInstruction } from './owner-policy.js';
export type { OwnerPolicyLimits, UpsertAgentPolicyInput } from './owner-policy.js';
