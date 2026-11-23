import { BrimPolicyViolationError, createBrimFetch } from '@brim/sdk';

const resource = process.argv[2];
if (!resource || resource === '--help') {
  console.log('Usage: node packages/sdk/examples/agent.ts HTTPS_RESOURCE_URL');
  console.log(
    'Requires BRIM_VAULT_CONFIG and BRIM_AGENT_KEY. SOLANA_RPC_URL is an optional provider override.',
  );
} else {
  try {
    const brimFetch = createBrimFetch({
      vaultConfig: process.env.BRIM_VAULT_CONFIG ?? process.env.BRIM_CARD ?? '',
      agentKey: process.env.BRIM_AGENT_KEY ?? '',
      rpcUrl: process.env.SOLANA_RPC_URL,
    });

    const response = await brimFetch(resource);
    console.log(`HTTP ${response.status}`);
    if (!response.ok) process.exitCode = 1;
  } catch (error) {
    // SDK diagnostics are fixed messages; never log keys or provider URLs.
    console.error(
      error instanceof BrimPolicyViolationError
        ? `${error.code}: ${error.message}`
        : 'REQUEST_FAILED',
    );
    process.exitCode = 1;
  }
}
