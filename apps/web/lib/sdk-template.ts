/** SDK handoff contains public routing information and a reference to the local secret. */
export function sdkSetupTemplate(vaultConfig?: string, rpcUrl?: string, resourceUrl?: string) {
  return [
    'import { createBrimFetch } from "@brim/sdk";',
    '',
    'const brimFetch = createBrimFetch({',
    vaultConfig
      ? `  vaultConfig: ${JSON.stringify(vaultConfig)},`
      : '  vaultConfig: process.env.BRIM_VAULT_CONFIG!,',
    '  agentKey: process.env.BRIM_AGENT_KEY!, // Set in the agent runtime.',
    ...(rpcUrl ? [`  rpcUrl: ${JSON.stringify(rpcUrl)},`] : []),
    '});',
    '',
    `const response = await brimFetch(${JSON.stringify(resourceUrl ?? 'https://api.example.com/paid-resource')});`,
  ].join('\n');
}
