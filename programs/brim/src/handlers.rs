use anchor_lang::prelude::*;

use crate::{contexts::*, errors::BrimError, events::*, state::*, transfer::transfer_from_vault};

pub fn init_vault(ctx: Context<InitVault>) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    vault.set_inner(Vault {
        owner: ctx.accounts.owner.key(),
        mint: ctx.accounts.mint.key(),
        token_account: ctx.accounts.vault_token_account.key(),
        total_agents: 0,
        is_paused: false,
        bump: ctx.bumps.vault,
    });
    emit!(VaultInitialized {
        vault: vault.key(),
        owner: vault.owner,
        mint: vault.mint
    });
    Ok(())
}

pub fn upsert_agent_policy(
    ctx: Context<UpsertAgentPolicy>,
    agent_key: Pubkey,
    limits: PolicyLimits,
) -> Result<()> {
    limits.validate()?;
    require!(agent_key != Pubkey::default(), BrimError::InvalidAgent);
    let now = Clock::get()?.unix_timestamp;
    require!(now >= 0, BrimError::InvalidClock);
    let policy = &mut ctx.accounts.policy;
    if policy.vault == Pubkey::default() {
        policy.vault = ctx.accounts.vault.key();
        policy.agent_key = agent_key;
        policy.window_start = now;
        policy.bump = ctx.bumps.policy;
        ctx.accounts.vault.total_agents = ctx
            .accounts
            .vault
            .total_agents
            .checked_add(1)
            .ok_or(BrimError::ArithmeticOverflow)?;
    } else {
        require_keys_eq!(
            policy.vault,
            ctx.accounts.vault.key(),
            BrimError::InvalidPolicy
        );
        require_keys_eq!(policy.agent_key, agent_key, BrimError::InvalidPolicy);
        require_eq!(policy.bump, ctx.bumps.policy, BrimError::InvalidPolicy);
        // Updating limits must never reset spent/last payment/frozen state.
        // Immutable duration avoids ambiguously moving a live budget window.
        require_eq!(
            policy.window_duration,
            limits.window_duration,
            BrimError::WindowDurationImmutable
        );
    }
    policy.max_per_tx = limits.max_per_tx;
    policy.window_limit = limits.window_limit;
    policy.window_duration = limits.window_duration;
    policy.min_tx_interval = limits.min_tx_interval;
    policy.allowlist_enabled = limits.allowlist_enabled;
    policy.allowlist = limits.allowlist;
    emit!(AgentPolicyUpdated {
        vault: policy.vault,
        agent_key
    });
    Ok(())
}

pub fn set_agent_frozen(ctx: Context<SetAgentFrozen>, is_frozen: bool) -> Result<()> {
    ctx.accounts.policy.is_frozen = is_frozen;
    emit!(AgentFrozen {
        vault: ctx.accounts.vault.key(),
        agent_key: ctx.accounts.policy.agent_key,
        is_frozen
    });
    Ok(())
}

pub fn set_vault_paused(ctx: Context<SetVaultPaused>, is_paused: bool) -> Result<()> {
    ctx.accounts.vault.is_paused = is_paused;
    emit!(VaultPaused {
        vault: ctx.accounts.vault.key(),
        is_paused
    });
    Ok(())
}

pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
    require!(amount > 0, BrimError::InvalidAmount);
    require!(
        ctx.remaining_accounts.is_empty(),
        BrimError::UnexpectedAccounts
    );
    transfer_from_vault(
        &ctx.accounts.vault,
        &ctx.accounts.mint,
        &ctx.accounts.vault_token_account,
        &ctx.accounts.owner_token_account,
        &ctx.accounts.token_program,
        amount,
    )?;
    emit!(WithdrawalExecuted {
        vault: ctx.accounts.vault.key(),
        amount
    });
    Ok(())
}

pub fn execute_payment(ctx: Context<ExecutePayment>, amount: u64) -> Result<()> {
    require!(
        ctx.remaining_accounts.is_empty(),
        BrimError::UnexpectedAccounts
    );
    require!(!ctx.accounts.vault.is_paused, BrimError::VaultPaused);
    require_keys_neq!(
        ctx.accounts.recipient.key(),
        ctx.accounts.vault.key(),
        BrimError::InvalidRecipient
    );
    let now = Clock::get()?.unix_timestamp;
    let next = ctx
        .accounts
        .policy
        .check_payment(amount, now, ctx.accounts.recipient.key())?;
    // State updates and CPI are atomic: a failed token transfer rolls back all counters.
    ctx.accounts.policy.window_start = next.window_start;
    ctx.accounts.policy.window_spent = next.window_spent;
    ctx.accounts.policy.last_tx_ts = now;
    transfer_from_vault(
        &ctx.accounts.vault,
        &ctx.accounts.mint,
        &ctx.accounts.vault_token_account,
        &ctx.accounts.recipient_token_account,
        &ctx.accounts.token_program,
        amount,
    )?;
    emit!(PaymentExecuted {
        vault: ctx.accounts.vault.key(),
        agent_key: ctx.accounts.agent.key(),
        recipient: ctx.accounts.recipient.key(),
        amount,
        timestamp: now,
    });
    Ok(())
}
