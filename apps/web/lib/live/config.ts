import type { OwnerWalletConfig } from './owner-wallet';

const vaultConfig = process.env.NEXT_PUBLIC_BRIM_LIVE_VAULT_CONFIG;
const rpcUrl = process.env.NEXT_PUBLIC_BRIM_LIVE_RPC_URL || undefined;
const programAddress = process.env.NEXT_PUBLIC_BRIM_LIVE_PROGRAM_ADDRESS;
const network = process.env.NEXT_PUBLIC_BRIM_LIVE_NETWORK;
const facilitatorFeePayers = process.env.NEXT_PUBLIC_BRIM_LIVE_FEE_PAYERS?.split(',')
  .map((value) => value.trim())
  .filter(Boolean);

// These values are public and fixed by the dashboard operator at build time.
export const liveVault: OwnerWalletConfig | null = vaultConfig
  ? { vaultConfig, rpcUrl }
  : programAddress &&
      (network === 'devnet' || network === 'mainnet') &&
      facilitatorFeePayers?.length
    ? { programAddress, network, facilitatorFeePayers, rpcUrl }
    : null;
