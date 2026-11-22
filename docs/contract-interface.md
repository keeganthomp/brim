# Brim contract interface

Status: implementation for review and local testing. No devnet/mainnet deployment exists at the development placeholder address `AekkJRGenJd9bgXoYo88xnAGpen9DMqSjkBRZZMMskpo`. Replace this ID consistently before deployment. Never treat the presence of a public key in source as evidence of a deployed program.

Source organization: `lib.rs` exposes entrypoints; `contexts.rs` holds account constraints; `state.rs` defines serialized data; `policy.rs` validates limits and spending math; `handlers.rs` applies instructions; `transfer.rs` contains the pinned transfer CPI. Constants, errors and events have their own modules. Policy tests and generated account-guard tests are separate.

Pinned Anchor `1.2.2`; its release recommends Agave/Solana `4.1.2`, platform-tools `v1.57`, SBPF v3. Rust host tests use Rust stable. Anchor defaults to the Solana v3 dependency cohort; this is a crate API selection, not a transaction format restriction.

## Mint and token program

Default builds pin Circle mainnet USDC `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`. Build with `--features devnet` for Circle devnet USDC `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`. The program checks the mint, six decimals, token-program ownership, and canonical source/destination ATAs. Only classic SPL Token `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA` is accepted. The Anchor `TokenInterface` CPI API does **not** imply support for arbitrary Token-2022 mints/extensions. No approvals, delegates, transfer hooks, or caller-supplied remaining accounts are accepted.

## Accounts

All integers are little endian. Anchor discriminators precede Borsh fields.

Vault seeds: UTF-8 `vault`, owner (32 bytes), mint (32 bytes). Allocated length 110 bytes.

| Offset | Field                                        | Bytes |
| ------ | -------------------------------------------- | ----- |
| 0      | discriminator `[211,8,232,43,2,152,117,119]` | 8     |
| 8      | owner                                        | 32    |
| 40     | mint                                         | 32    |
| 72     | token_account                                | 32    |
| 104    | total_agents                                 | 4     |
| 108    | is_paused                                    | 1     |
| 109    | canonical bump                               | 1     |

AgentPolicy seeds: UTF-8 `agent`, vault (32 bytes), agent key (32 bytes). Allocated length 647 bytes for up to 16 recipients. The serialized bump follows the live vector, not the end of allocation. Serialized live length is `135 + 32 * allowlist.len()`; trailing allocated bytes must be ignored.

| Offset           | Field                                          | Bytes      |
| ---------------- | ---------------------------------------------- | ---------- |
| 0                | discriminator `[148,193,218,129,21,96,195,77]` | 8          |
| 8                | vault                                          | 32         |
| 40               | agent_key                                      | 32         |
| 72               | is_frozen                                      | 1          |
| 73               | max_per_tx                                     | 8 (u64)    |
| 81               | window_limit                                   | 8 (u64)    |
| 89               | window_duration                                | 8 (i64)    |
| 97               | window_start                                   | 8 (i64)    |
| 105              | window_spent                                   | 8 (u64)    |
| 113              | min_tx_interval                                | 8 (i64)    |
| 121              | last_tx_ts                                     | 8 (i64)    |
| 129              | allowlist_enabled                              | 1          |
| 130              | allowlist length                               | 4          |
| 134              | recipient authority keys                       | 32 × count |
| 134 + 32 × count | canonical bump                                 | 1          |

## Instructions

Discriminator is the first eight bytes of SHA-256(`global:<instruction_name>`).

`init_vault()` accounts in order: payer writable signer; owner readonly signer; mint readonly; vault writable; vault ATA writable; token program readonly; associated token program readonly; system program readonly. A separate payer permits Squads vault-authority PDA ownership through CPI. The Squads **vault authority PDA**, not its multisig configuration address, must sign.

`upsert_agent_policy(agent_key: Pubkey, limits: PolicyLimits)` accounts: payer writable signer; owner readonly signer; vault writable; policy writable; system program readonly. Limits fields: max_per_tx u64, window_limit u64, window_duration i64, min_tx_interval i64, allowlist_enabled bool, allowlist Vec<Pubkey>. Creation stores the canonical bump. Updates retain spent counters, last timestamp, frozen state and window start. Duration is immutable after creation. Limits can be lowered below already-spent usage, immediately preventing further payments until expiry. Enabled empty allowlists deny every recipient.

`set_agent_frozen(is_frozen: bool)` accounts: owner readonly signer; vault readonly; policy writable. Policy contains its own agent key, so no redundant instruction key argument is needed.

`set_vault_paused(is_paused: bool)` accounts: owner readonly signer; vault writable. This sixth instruction makes the PRD's global emergency pause usable. Owner withdrawals remain possible when paused.

`withdraw(amount: u64)` accounts: owner readonly signer; vault readonly; mint readonly; vault ATA writable; owner ATA writable; token program readonly.

`execute_payment(amount: u64)` bytes: discriminator `[86,4,7,7,120,139,232,139]` followed by u64 amount in USDC base units. Accounts:

1. agent readonly signer
2. vault readonly
3. policy writable
4. mint readonly
5. vault ATA writable
6. recipient authority readonly
7. recipient ATA writable
8. token program readonly

Agent signs; owner never signs agent payments. Vault signs only the pinned checked-transfer CPI. Payment updates are atomic with the token transfer. A fee payer still needs SOL, unless a configured facilitator sponsors the transaction. The program never guarantees acceptance by an x402 facilitator; compatibility depends on its verification mode and explicit program allowlisting.

## Time and events

Budgets use fixed replenishment windows, not rolling windows. At `now - window_start >= window_duration`, the next accepted payment sets start to now and spends from zero. Spacing is an integer-second minimum interval, not an N-requests-in-any-minute sliding counter. Freeze takes effect when its transaction lands before a payment executes; there is no guaranteed 400 ms kill latency or reversal of prior transfers.

`PaymentExecuted` event discriminator `[153,165,141,18,246,20,204,227]`, then vault Pubkey32, agent_key Pubkey32, recipient Pubkey32, amount u64, timestamp i64. Use successful, finalized transactions and verify the invoking program's log stack; other programs can print misleading event-shaped logs. The indexer waits for finalized transactions before recording settled payments. Merchant domain is off-chain metadata, not proven by this event.

Other events: `VaultInitialized(vault, owner, mint)`, `AgentPolicyUpdated(vault, agent_key)`, `AgentFrozen(vault, agent_key, is_frozen)`, `VaultPaused(vault, is_paused)`, `WithdrawalExecuted(vault, amount)`.

Failed transactions roll back events/state; SDK-reported blocked attempts are advisory and cannot provide complete detection of a malicious client.

## Release gates

Host tests cover policy math, serialization and generated Anchor guards. The Surfpool suite executes compiled SBF for checked transfers, caps, freezes, owner authorization, substituted accounts and CPI rollback. Before accepting real funds: generate/review IDL, deploy to devnet using a real program key, test owner flows through Squads CPI, run supported-facilitator settlement and adversarial concurrency/replay tests, fuzz state transitions with Trident, and obtain independent security review. No audit is claimed.

All agents share one writable vault ATA. Payments serialize on that account; per-agent PDAs do not eliminate vault-level account contention.

Local Surfpool uses a synthetic mint at the devnet USDC address. Build with the devnet feature: `cargo build-sbf --manifest-path programs/brim/Cargo.toml --tools-version v1.57 --arch v3 --features devnet -- --locked`. A default build pins the mainnet mint and will reject the devnet fixture.

## Verification performed in this workspace

`cargo test --locked -p brim` and `cargo test --locked -p brim --features devnet` passed 10 tests each: policy arithmetic/boundaries, serialization and Anchor generated account guards.

The explicit devnet SBF build command above passed with Agave 4.1.2, platform-tools v1.57 (Rust SBPF 1.95.0), SBPF v3 and Anchor 1.2.2, including after the source-module refactor. The compiled artifact is `target/deploy/brim.so`. Build output is ignored; no program was deployed to devnet/mainnet. SBF compilation alone does not demonstrate runtime behavior or facilitator compatibility.

## Local Surfpool workflow

Local running and transaction tests use [Surfpool 1.7.0](https://github.com/solana-foundation/surfpool/releases/tag/v1.7.0). The harness `programs/brim/tests/surfpool.mjs` starts Surfpool **offline**, loads the compiled SBF through `surfnet_writeProgram`, and seeds a synthetic USDC mint through `surfnet_setAccount`. It runs 17 real SBF transaction checks: successful exact transfers, per-payment/window caps, freeze/pause, owner authorization, preserved policy updates, substituted recipient/mint/program rejection, precreated ATA initialization and failed-CPI rollback. **All 17 passed in this workspace**, both attached to an existing Surfpool instance and in a standalone spawned instance.

Use `npm run test:chain`. The underlying harness supports `SURFPOOL_BIN=/path/to/surfpool` and `--rpc-url http://127.0.0.1:8899` to attach to an existing local instance. A devnet-feature SBF artifact must exist first; `npm run build:chain` prepares it through the repository's build helper. Solana/Anchor CLIs are not needed to seed or execute local transactions.

The runtime is configured with `--offline --genesis-hash EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG`. This makes SDK devnet CAIP-2 checks work against loopback RPC without weakening remote-network checks. It does not fork or broadcast to devnet/mainnet. Token balances and mint authority in the fixture are fake. The openly documented fixture authority is never suitable for an external chain.

Shared local code lives under `infra/local/surfpool/`: `config.ts` validates local RPC boundaries, `seed.ts` loads code/mint, `transactions.ts` provides Effect transaction workflows, and `credentials.ts`/`bootstrap.ts` manage idempotent local setup. `seedSurfpoolEffect` and `bootstrapLocalEffect` expose typed Effect workflows; Promise facades serve CLI/test boundaries.

`node infra/local/surfpool/bootstrap.ts` uses `BRIM_RPC_URL` (default loopback port 8899), `BRIM_LOCAL_CONFIG` (default `.brim/local.json`), and optional `BRIM_PROGRAM_PATH`. It creates a vault with 100 fake USDC, a strict merchant allowlist, a $1 payment cap and $50 fixed-window budget. It stores fake owner, agent and facilitator keys only in the ignored local JSON file with permissions `0600`; the public card contains no key. Existing credentials, policies, budgets and vault balances are retained on repeat startup. A new empty Surfpool instance recreates missing accounts using the same persisted local keys.
