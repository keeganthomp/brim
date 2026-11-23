/** Public SDK template; the demo never issues vault config or signing keys. */
export const SDK_TEMPLATE = `import { createBrimFetch } from "@brim/sdk";

// Get this public vault config from your treasury operator.
const brimFetch = createBrimFetch({
  vaultConfig: process.env.BRIM_VAULT_CONFIG!,
  agentKey: process.env.BRIM_AGENT_KEY!,
});

const response = await brimFetch("https://api.example.com/paid-resource");`;
