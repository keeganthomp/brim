# Brim SDK

Give your agent its public vault config (Brim card) and scoped private key. Then use `fetch` normally.

```ts
import { createBrimFetch } from '@brim/sdk';

const brimFetch = createBrimFetch({
  card: process.env.BRIM_CARD!,
  agentKey: process.env.BRIM_AGENT_KEY!,
});

const response = await brimFetch('https://merchant.example/paid-resource');
```

- `BRIM_CARD` is public connection metadata supplied by your operator. The operator creates the vault and attaches an on-chain policy to your agent first; the config itself grants no authority.
- `BRIM_AGENT_KEY` is private: a JSON array of the scoped agent's 64 Ed25519 keypair bytes. Never use the treasury owner's key.

The example URL is illustrative. For a real local payment with fake funds, follow the repository's [local quickstart](../../README.md#start-everything-locally).

## Optional RPC override

Brim chooses Solana's public RPC connection from the network in your config. You do not need a provider account to start.

| Network | Default connection                    |
| ------- | ------------------------------------- |
| Mainnet | `https://api.mainnet-beta.solana.com` |
| Devnet  | `https://api.devnet.solana.com`       |

Add `rpcUrl: process.env.SOLANA_RPC_URL` when using a dedicated provider or local Surfpool. An explicit invalid URL fails; it never silently falls back. Keep provider credentials outside the public card config.

The SDK defaults to a $1 USDC safety cap per payment. Set `maxPaymentAmount: 5_000_000n` for a $5 local cap. The on-chain policy still applies.

## Run the included example

This package is a private workspace, not an npm publication. From the repository root:

```sh
npm ci
npm run build:packages
node packages/sdk/examples/agent.ts --help
```

Set `BRIM_CARD` and `BRIM_AGENT_KEY`, then run `node packages/sdk/examples/agent.ts YOUR_PAID_API_URL`. `SOLANA_RPC_URL` is optional.

`createBrimFetch` returns Promises. Effect applications can use `createBrimFetchEffect` with the same inputs. Catch `BrimPolicyViolationError` and inspect `error.code`; reconcile `PAYMENT_OUTCOME_UNKNOWN` before retrying a paid operation.

See [operator setup and compatibility](../../docs/x402.md) for `createBrimCard`, facilitator requirements, and settlement behavior.
