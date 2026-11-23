# Brim SDK

Give your agent its public vault config and scoped private key. Then use `fetch` normally.

```ts
import { createBrimFetch } from '@brim/sdk';

const brimFetch = createBrimFetch({
  vaultConfig: process.env.BRIM_VAULT_CONFIG!,
  agentKey: process.env.BRIM_AGENT_KEY!,
});

const response = await brimFetch('https://merchant.example/paid-resource');
```

## Get your vault config and key

| Variable            | Value                                                                          | Who provides it?                                                  |
| ------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| `BRIM_VAULT_CONFIG` | A public string like `brim:v1:eyJ2ZXJzaW9uIjox...` (abbreviated).              | Your treasury operator generates it with `createBrimVaultConfig`. |
| `BRIM_AGENT_KEY`    | The contents of the agent's Solana keypair JSON file, an array of 64 integers. | You generate the keypair and keep it in your runtime secrets.     |

Send the operator your agent's **public key** so they can register it on the spending policy. The SDK reads the keypair JSON in your agent process to sign payments. The treasury owner's key stays in their wallet.

The vault config contains the vault, program, network, and trusted fee payers. Agents using the same settings can share a vault config. Each agent's registered public key selects its spending policy. See the [operator handoff](../../docs/x402.md#operator-handoff) to generate a vault config with `createBrimVaultConfig`; `readBrimVaultConfig` reads its public settings back. Operators can use the network names `'devnet'` and `'mainnet'`; the SDK encodes the x402 network ID. Always supply the actual `programAddress`: `BRIM_DEVELOPMENT_PROGRAM_ADDRESS` is for local Surfpool only.

Existing integrations remain compatible: `BRIM_CARD`, `{ card }`, `createBrimCard`, `readBrimCard`, and local `.card` values are accepted as legacy names. New setup uses the vault config names above with the same `brim:v1:` format.

## Try the SDK locally

Start the [local stack](../../README.md#start-everything-locally) with `npm run dev`. It generates the config for you: open the dashboard's **Local workspace** and choose **Copy vault config**. The scoped test key stays in the ignored local file.

To run the standalone SDK example, use another terminal at the repository root with `jq` installed:

```sh
export BRIM_VAULT_CONFIG="$(jq -r '.vaultConfig' .brim/local.json)"
export BRIM_AGENT_KEY="$(jq -r '.agentKey' .brim/local.json)"
export SOLANA_RPC_URL="$(jq -r '.rpcUrl' .brim/local.json)"

node packages/sdk/examples/agent.ts http://127.0.0.1:4020/report
```

The command loads test values without printing the key. It uses the local Surfpool RPC and pays $0.04 in test USDC. To copy just the public vault config, run `jq -r '.vaultConfig' .brim/local.json`.

## Optional RPC override

Brim chooses Solana's public RPC connection from the network in your config. You do not need a provider account to start.

| Network | Default connection                    |
| ------- | ------------------------------------- |
| Mainnet | `https://api.mainnet-beta.solana.com` |
| Devnet  | `https://api.devnet.solana.com`       |

Add `rpcUrl: process.env.SOLANA_RPC_URL` when using a dedicated provider or local Surfpool. An explicit invalid URL fails; it never silently falls back. Keep provider credentials outside the public vault config.

The SDK defaults to a $1 USDC safety cap per payment. Set `maxPaymentAmount: 5_000_000n` for a $5 local cap. The on-chain policy still applies.

## Errors and Effect

The SDK is available as a private workspace package. Run `npm ci && npm run build:packages` to build it outside the local stack.

`createBrimFetch` returns Promises. Effect applications can use `createBrimFetchEffect` with the same inputs. Catch `BrimPolicyViolationError` and inspect `error.code`; reconcile `PAYMENT_OUTCOME_UNKNOWN` before retrying a paid operation.
