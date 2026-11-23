# Brim product contract

Brim is Solana-native, non-custodial spend management for agents. The product is a safe payment, a clear policy, and a usable operator surface—not a generic hosted wallet service.

## Deliverable now

- One contract controls official USDC vaults and scoped agent policies; agents never hold treasury keys.
- One payment engine powers the SDK and the MCP entry point. Both take a public vault config and the agent's scoped signing key, with an optional RPC override.
- One local command prepares Surfpool, Postgres, migrations, test credentials, the dashboard, and the real x402 example.
- The dashboard has three surfaces: overview, policy drawer, and funds modal. Local mode reads actual test balances and verified payments; demo mode is explicitly simulated.
- The core is Apache-2.0 licensed. Transfers include no Brim protocol fee. Network fees and any external facilitator terms are separate.

## Next security milestone: Auto / Ask / Block

Auto amounts settle under contract policy. Ask amounts require a single-use approval signed by the treasury owner, binding the exact intent and expiring quickly. Block amounts cannot transfer. Email codes and agent-readable bearer tokens cannot raise limits or approve spending. See [the approval design](spending-bands.md), including Solana rollback and policy-migration constraints.

These bands are **designed, not implemented** in the current contract. Current payments use hard per-payment/window limits. Wallet/Squads approval UI, passkey verification, notifications, and one-use approval execution must ship together with adversarial tests before this is described as a supported feature.

## Shared threat feed

Reports are opt-in, minimal, and untrusted until verified. Never upload raw URLs, query strings, headers, API keys, request bodies, vault identities, or session keys. Hashing a domain is not meaningful anonymization on its own.

An exceeded budget is not proof that a merchant is malicious. A single client report cannot globally block a vendor. Separate reports, evidence, reviewed decisions, signed feed snapshots, expiry, revocation, and appeals. Owner-controlled recipient policy remains the on-chain authority. High-confidence shared protection must not become a way to poison another team's allowlist or grant spending authority.

The network feed is a future capability; no live threat network is claimed by this repository.

## Product and business guardrails

Aim for a first safe payment in under two minutes after provisioning; measure the actual journey before advertising it. Cold local Docker toolchain setup is a separate, longer one-time download/build. Prioritize immediate UI feedback and clear pending/confirmed/finalized states; do not equate an optimistic acknowledgement with finality.

Keep any managed pricing flat and predictable; the proposed Free / $29 Pro / $99 Team tiers are a pricing hypothesis, not implemented billing. Do not add a treasury-spending fee to the contract. Obtain an independent audit before calling the system audited.

Official Solana USDC currently uses legacy SPL Token. TokenInterface is used, but arbitrary Token-2022 mints/extensions are deliberately rejected. Expand support only with an explicit mint/extension policy and settlement tests.

Competitor capabilities, fee schedules, transaction-volume claims, and cited research in strategy discussions require current primary-source verification before appearing in marketing. None are product security assumptions.
