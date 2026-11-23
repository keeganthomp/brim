# Brim

Non-custodial USDC spending controls for AI agents on Solana. Scoped agent keys, contract-enforced budgets, x402 payments, and a simple operator dashboard.

## Start everything locally

Prerequisites: **Node 24 and Docker with Compose v2**. No wallet, RPC subscription, cloud account, or host Rust/Solana installation is needed for local development.

```sh
npm ci
npm run dev
```

This builds internal packages and the devnet program, starts **Surfpool 1.7.0 + PostgreSQL 18**, applies checksum-verified migrations, loads the program, creates a funded test vault and scoped agent, then starts the dashboard and a real x402 paid API. The first Docker-only chain build downloads the pinned toolchain; subsequent builds use caches. A compatible cached native toolchain is used automatically when available.

The dashboard runs at `http://localhost:3000`. The paid API runs at `http://127.0.0.1:4020`. Surfpool runs offline with fake keys and funds. The local setup saves its values in the ignored `.brim/local.json` file with mode `0600`. The local dashboard reads real test balances and verified payment rows. The demo workspace simulates policy and funding controls in the browser.

Ctrl-C stops the web and API processes while the test chain and database keep running. `npm run local:down` removes the test chain container and keeps the Postgres data. The next startup recreates the chain using the saved local keypairs.

In another terminal:

```sh
npm run demo:payment
```

This uses the actual SDK, x402 verifier/facilitator, compiled Brim program, and database. It checks the exact USDC debit/credit, verifies the finalized program event, and proves duplicate ledger delivery does not double-count. No real funds move.

## Agent integration

```ts
import { createBrimFetch } from '@brim/sdk';

const brimFetch = createBrimFetch({
  vaultConfig: process.env.BRIM_VAULT_CONFIG!,
  agentKey: process.env.BRIM_AGENT_KEY!,
});

const response = await brimFetch('https://api.example.com/paid-resource');
```

The treasury operator sends you a public `BRIM_VAULT_CONFIG` string that starts with `brim:v1:`. You generate the agent's Solana keypair, share its **public key** for registration, and store the full keypair JSON as `BRIM_AGENT_KEY` in your agent's runtime. For local testing, `npm run dev` generates both values in `.brim/local.json`.

See the [SDK quickstart](packages/sdk/README.md) for examples and the local RPC override, or [MCP setup](packages/mcp/README.md) for an existing agent client.

## Marketing and docs

Run `npm run dev:site` and open `http://localhost:3200`. The landing page is at `/` and the Fumadocs guides are at `/docs/`. `npm run build:site` exports both to `apps/site/out/` for static hosting.

## Useful commands

| Command               | What it does                                                                 |
| --------------------- | ---------------------------------------------------------------------------- |
| `npm run doctor`      | Check local prerequisites with actionable errors                             |
| `npm run dev`         | Start the complete local stack with hot-reloading Next.js                    |
| `npm run local:up`    | Prepare chain/database/test credentials without starting web/API processes   |
| `npm run local:down`  | Stop Surfpool/Postgres (including the test instance); preserve database data |
| `npm run dev:demo`    | Start only the browser-local dashboard demo                                  |
| `npm run check`       | Typecheck all TS/tools, unit tests, and production builds                    |
| `npm run test:chain`  | Execute contract security/transfer checks on an isolated Surfpool instance   |
| `npm run test:db`     | Apply migrations and run real Postgres integration checks                    |
| `npm run test:local`  | Automated real x402 → program → verified database payment test               |
| `npm run chain:build` | Build devnet SBF using cached native tools or the Docker fallback            |
| `npm run db:migrate`  | Apply local database migrations safely; repeatable                           |

Override local ports with `BRIM_WEB_PORT`, `BRIM_RPC_PORT`, `BRIM_WS_PORT`, and `BRIM_DB_PORT` when needed. In a corporate TLS proxy, supply `BRIM_BUILD_CA_CERT` for the Docker chain build; certificates stay in secret mounts and TLS verification remains enabled.

## Organization

- `apps/web`: focused UI components, React hooks, Effect domain commands, and server-only routes.
- `apps/site`: public landing page and Fumadocs, with a static search index.
- `programs/brim`: small Anchor modules for accounts, policies, instructions, errors, events, and checked CPI transfers.
- `packages/sdk`: vault config, schemas, policy checks, account codecs, signing, and HTTP/Effect boundaries.
- `packages/mcp`: stdio tools for balance, policy and safe paid requests; no treasury key or policy-editing tool.
- `packages/indexer`: Effect services/workflows, authenticated intake, finalized RPC verification, idempotent Postgres writes, migrations, and reconciliation.
- `infra/local` / `scripts`: shared local setup, Surfpool fixtures and payment example; no duplicated production payment implementation.
- `infra/gcp`: Cloud Build and Cloud Run / Cloud SQL preparation. No GCP resources have been provisioned.

Effect **4.1.5** is the TypeScript runtime and validation foundation. Pure rendering, codecs and immutable constants stay ordinary code. Solana Kit **8.6.0**, x402 **2.32.0**, Anchor **1.2.2**, Next.js **16.4.6**, React **19.3.1**, and TypeScript **7.0.2** were checked against stable registries on 2026-11-22 and pinned with lockfiles.

## Before production funds

The program, real local settlement and database path are exercised locally. A live product still needs owner-wallet/Squads integration, tenant authentication, external devnet settlement, independent security review/fuzzing, and production deployment. Local-only routes are disabled in production. No mainnet program or cloud deployment is claimed.

Budgets use fixed windows and minimum payment spacing. A freeze takes effect when its transaction executes; no fixed millisecond finality is promised. USDC v1 pins the official mint and legacy token program. Latest x402 smart-wallet verification must be explicitly enabled and allowlist the deployed Brim program.

See the [product direction](docs/product-direction.md) for Auto / Ask / Block, signed approvals and the future opt-in threat feed. Those expanded features are not implemented in v1.

Read [architecture decisions](docs/architecture.md), [contract interface](docs/contract-interface.md), and [GCP deployment preparation](infra/gcp/README.md).
