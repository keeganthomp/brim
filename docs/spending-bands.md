# Spending bands: v2 implementation design

Status: proposed follow-up. V1 code, layouts and its 17 passing Surfpool checks remain unchanged. Approval bands and automatic freeze are not implemented yet.

## Exact decision rules

Use integer USDC base units. Require `0 <= auto_limit <= hard_limit <= window_limit`, positive hard limit/window duration, and positive payment amounts.

| Requested amount                    | Decision | On-chain requirement                                  |
| ----------------------------------- | -------- | ----------------------------------------------------- |
| `amount <= auto_limit`              | Auto     | Agent signature and normal policy checks              |
| `auto_limit < amount <= hard_limit` | Ask      | Agent signature, normal checks and one owner approval |
| `amount > hard_limit`               | Block    | Reject; approval cannot override the hard limit       |

Approved payments still obey the current budget, minimum interval, allowlist, freeze and vault pause. Approval reserves no funds; competing approvals share the remaining budget. `auto_limit = 0` asks for every payment; equal thresholds eliminate Ask.

## One approval, one payment

`PaymentApproval` is the third canonical PDA family alongside Vault and versioned AgentPolicy. Seeds: `[b"approval", policy.key(), nonce.to_le_bytes()]`, with stored canonical bump. Pending requests stay off-chain; only the owner creates approval accounts.

Fields: `vault`, `policy`, `policy_revision`, `agent_key`, `mint`, `recipient`, `amount`, `intent_hash: [u8; 32]`, `expires_at`, `nonce`, `consumed`, `bump`. Recipient is the token-account authority; separately verify its canonical ATA and pinned mint/token program.

`approve_payment` requires the Vault owner signer and a separate rent payer. Check the current revision, Ask band, permitted recipient, unfrozen/unpaused state, `nonce == next_approval_nonce`, and `now < expires_at <= now + 300 seconds`. Increment the checked monotonic nonce; policy edits never reset it.

`execute_payment_v2(amount, intent_hash, approval_nonce?)` requires the agent signer. Ask checks every binding, current revision, `!consumed` and `now < expires_at`, then ordinary policy checks. Consumption, counters and `transfer_checked` are atomic; failed CPI rolls them back. Auto must omit an approval account. Keep consumed approvals as replay tombstones; rent recovery/closing needs separate review.

Policy edits and per-agent freeze/unfreeze use checked `policy_revision` increments, failing closed on overflow and invalidating old approvals. Vault pause blocks execution while paused. The unchanged Vault format cannot revoke approvals globally on unpause: a current, unconsumed approval may resume until expiry. Freeze affected policies or wait the maximum TTL before resuming when revocation is required.

The SDK hashes a versioned, length-prefixed encoding of program/vault/policy/agent/mint/recipient/amount, exact request method/URL/body digest and merchant quote identifier/digest. The program binds hash bytes, not HTTP identity or delivery. Resource/facilitator integration must authenticate the quote and bind it to this intent. The approval screen renders amount, merchant claim, verified recipient, expiry and request summary from the same decoded payload.

## Wallet and passkey authority

Wallet Standard signs `approve_payment`; show Approved after on-chain confirmation. Squads must execute through CPI with its **vault authority PDA** as owner, not its multisig configuration address.

Passkeys require a passkey-backed Solana wallet/authority integration producing that same owner authorization. WebAuthn login or a backend session alone grants no approval. Selecting/testing the wallet integration is a v2 dependency; a new native passkey authority program needs separate review. Treasury keys never reach the server. Distinguish Pending, Awaiting wallet, Submitted, Approved, Expired and Rejected.

## Block and automatic freeze

Failed Solana instructions roll back state/events. Setting frozen immediately before returning `HardLimitExceeded` does not persist a freeze.

Add `record_hard_block(amount, recipient, intent_hash)`: agent-signed, verifies `amount > hard_limit`, sets frozen, emits `HardBlockedAndFrozen`, has no token-transfer accounts, and returns success. A cooperating SDK submits this non-payment transaction and waits for confirmation. The event records an agent-asserted intent and self-freeze, not proof of an actual merchant request. A successful freeze is never payment proof; facilitator settlement still requires the verified checked transfer.

A malicious client can omit this call and submit a rejected payment. Optionally configure a per-policy **freeze-only guardian** signer. A watcher submits a separate freeze after a committed signal: a successful Brim block event or authenticated failed Brim execution on a finalized transaction. Verify status, invoking program, accounts and error; extend current successful-payment indexing explicitly.

Enforce guardian keys distinct from the vault owner and this policy’s agent. The guardian role can only freeze, never approve, unfreeze, change policy, pause another vault or withdraw. Owner guardian changes invalidate approvals. The program cannot prove historical RPC observations; guardian trust includes denial-of-service risk. SDK telemetry and threat feeds are advisory, never treasury authority.

Do not promise freeze for every malicious request or fixed latency. Rejection blocks that transfer; a separate committed freeze blocks subsequent payments. Show Blocked, Freeze pending and Frozen on-chain separately, including watcher failures. Pending payments recheck policy when executed; already settled payments remain settled.

## Account versions and migration

Keep current v1 layouts unchanged. V2 uses a new `AgentPolicyV2` discriminator and explicit version 2 **at the same canonical policy PDA**. This is a versioned Rust type, not a fourth PDA family; Approval is the new family.

Owner-only `migrate_policy_v2` validates v1 owner/vault/seeds/bump, funds reallocation, and atomically rewrites the complete payload. Preserve vault/agent bindings, canonical bump, freeze, allowlist contents/enabled flag, window limit/start/duration/spent, minimum interval and last-payment timestamp. Map `auto_limit = hard_limit = v1.max_per_tx`; initialize revision 1 and approval nonce 0. Never replenish budgets. Rewrite the validated raw account explicitly so a typed v1 Anchor wrapper cannot overwrite v2 bytes on exit.

Legacy payment/upsert/unfreeze must reject migrated discriminators; v2 instructions reject unmigrated accounts. Untouched v1 policies remain supported. Only the owner can create additional v1 policies. No automatic migration, closing, balance movement or SDK reinterpretation.

Keep contexts, classification, approval validation and CPI in focused modules. Add owner approval, migration, v2 policy/payment/freeze and the block-record operation; reuse the checked-transfer helper.

## Acceptance checks before enabling v2

- Surfpool boundaries: zero, Auto exactly/+1, hard exactly/+1, zero Auto, equal thresholds, overflow and invalid limits.
- Reject missing approval or wrong owner/Squads authority, agent, vault/policy, mint, recipient/ATA, amount, intent, revision, nonce, consumed flag or bump. Expiry exactly at chain time and excessive TTL fail.
- Replay in one transaction, concurrent transactions or after blockhash refresh cannot double-pay. Approved payments share budget/rate limits. Failed CPI preserves approval and counters.
- Freeze/pause blocks approved payments; unfreeze invalidates approvals; unpause follows the documented TTL semantics. Backend login/forged telemetry cannot approve. Test real passkey-wallet authorization and Squads CPI end to end.
- Hard rejection transfers nothing and persists no freeze. Block-record persists freeze without transfer. Omitting it cannot bypass the hard limit. Surface watcher failure; guardian cannot spend, approve, unfreeze or withdraw.
- Migration preserves counters/freeze, rejects wrong authority/seeds, rolls back on failure, cannot repeat, and cannot be undone through legacy instructions. Retain all 17 v1 checks.
- x402 routes v1/v2 policy versions explicitly, rejects block-record as payment and binds quote/intent consistently. Review compute/account limits, events, storage growth, adversarial concurrency/replay, fuzzing and independent security findings before funded rollout.
