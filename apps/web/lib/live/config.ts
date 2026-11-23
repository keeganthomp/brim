const vaultConfig = process.env.NEXT_PUBLIC_BRIM_LIVE_VAULT_CONFIG;
const rpcUrl = process.env.NEXT_PUBLIC_BRIM_LIVE_RPC_URL;

// Both values are public and fixed by the dashboard operator at build time.
export const liveVault = vaultConfig ? { vaultConfig, ...(rpcUrl ? { rpcUrl } : {}) } : null;
