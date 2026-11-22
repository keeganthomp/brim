# Brim implementation decisions

## Trust boundary

The vault PDA owns a USDC associated token account. Agents sign only their own scoped payment instructions; spending limits and token transfers are enforced by the Solana program. SDK preflight checks improve developer feedback but are never the security boundary. Human owner keys stay in their wallet (or a Squads vault signing through Squads); the backend does not hold them. Production must also disclose and secure program upgrade authority: use an immutable release or documented multisig/timelock controls. An operator who can unilaterally upgrade a vault program is part of its trust boundary.

USDC is represented as integer base units (six decimals), never floating point. MVP asset support is official USDC on the configured Solana cluster and the legacy SPL Token program. Using Anchor's token interface does not imply accepting arbitrary Token-2022 extensions: transfer fees, hooks, and confidential transfers introduce settlement assumptions outside this MVP.

## Necessary PRD corrections

1. The supplied schema has **two PDA account types**, Vault and AgentPolicy, plus a token-program ATA. It does not define three program-owned PDA types.
2. The timestamp reset algorithm is a **fixed window beginning at policy initialization/reset**, not a sliding 24-hour sum. UI copy should use fixed window and show reset time. Updates must not silently clear consumed budget.
3. A minimum inter-transaction delay is **spacing**, not an exact maximum count in a rolling minute. Ten requests per minute becomes at least six seconds between payments. This deliberately forbids bursts; the program checks time, not slot duration.
4. Global pause requires an owner-only instruction absent from the original five. This implementation adds `set_vault_paused`.
5. Recipient addresses are enforceable on-chain; merchant domains are off-chain metadata. Mapping a domain to a recipient requires a separately trusted merchant registry or explicit operator input. A domain string alone provides no payment authorization.
6. A kill switch takes effect when its transaction is ordered and executed. Already executed payments cannot be revoked, and transactions racing the freeze can execute before it. A slot-time estimate is not a confirmation SLA.
7. Failed Solana transactions roll back state and cannot persist a denial record inside the program. Indexing may observe submitted failures; client preflight denials require separate authenticated telemetry and must be labeled as client reports. Calls that never reach either channel are not observable.
8. An x402 payload must contain the partially signed transaction for the facilitator to verify and settle. The SDK must not independently submit the payment and then blindly retry a 402. Facilitator compatibility and replay handling are part of the payment path.

## Current transaction path

Use Solana Kit transaction messages, integer encoders and Ed25519 signers. Version 0 transactions provide interoperability without relying on new runtime features not needed by this program. Lookup tables and transaction version upgrades are optional optimizations after end-to-end benchmarks. The PDA address, program ID, chain identity, mint, agent identity, recipient ATA, and trusted facilitator fee payer must all be validated rather than inferred from a merchant response.

The latest inspected x402 SVM package supports an opt-in smart-wallet verification path for CPI transfers. The facilitator must enable that path and allowlist the deployed Brim program; ordinary facilitator compatibility cannot be assumed. See `x402.md` for the exact installed API and restrictions.

## Operator surface

The dashboard has a browser-local demo, a read-only local Surfpool workspace with real balances and verified ledger payments, and an unconfigured live mode that refuses writes. Demo controls never submit wallet transactions. Production integration still needs wallet ownership authentication, owner-signed policy/funding transactions, and authenticated tenant-scoped APIs.

TypeScript domain workflows use Effect 4.1.5: Schema at boundaries, tagged errors, services for external dependencies, scoped resources, and bounded concurrency. Promise APIs bridge ordinary fetch/Next.js callers. Pure rendering, binary codecs and immutable constants stay plain code. Framework adapters are thin; contract, SDK, indexer and UI features live in focused modules.

`npm run dev` prepares Surfpool, Postgres, migrations, a compiled SBF program and local scoped credentials before serving Next.js and the real x402 example. `test:chain` uses an isolated Surfpool instance; `test:local` exercises the actual SDK, facilitator, token CPI and verified database ledger. Local setup checks loopback RPC and full devnet genesis; it never broadcasts externally. Private generated local key files are ignored and mode 0600.

## Indexing and GCP

Helius delivery is an untrusted notification even after bearer authentication. Indexing independently checks the configured program and finalized transaction before recording settlement; signatures deduplicate deliveries in Postgres. Chain facts and merchant/client metadata must keep separate provenance. Never render a claimed merchant label as an authenticated on-chain identity.

Cloud Run hosts the Next.js standalone app; Cloud SQL PostgreSQL stores activity. A separate ingestion service is an option if public webhook ingress and the private operator console need different authentication. Secret Manager holds RPC/webhook/database credentials. No signing key is required by the indexer. Real-time delivery can use polling first; durable SSE/pubsub and alerts follow once reconciliation and operator auth exist.

## Before handling real funds

Native policy and account tests, SBF compilation, 20 Surfpool transaction checks, and local x402-to-Postgres settlement cover the current implementation. Release gates include public devnet settlement with the intended facilitator, Squads owner flows, wallet and API authorization, documented program upgrade authority, fuzzing, and an independent security audit.
