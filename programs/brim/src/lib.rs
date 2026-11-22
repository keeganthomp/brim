use anchor_lang::prelude::*;

pub mod constants;
pub mod contexts;
pub mod errors;
pub mod events;
pub mod state;

mod handlers;
mod policy;
mod transfer;

pub use constants::*;
pub use contexts::*;
pub use errors::BrimError;
pub use events::*;
pub use state::*;

// Development identifier only. Replace consistently before deployment.
declare_id!("AekkJRGenJd9bgXoYo88xnAGpen9DMqSjkBRZZMMskpo");

#[program]
pub mod brim {
    use super::*;

    pub fn init_vault(ctx: Context<InitVault>) -> Result<()> {
        handlers::init_vault(ctx)
    }

    pub fn upsert_agent_policy(
        ctx: Context<UpsertAgentPolicy>,
        agent_key: Pubkey,
        limits: PolicyLimits,
    ) -> Result<()> {
        handlers::upsert_agent_policy(ctx, agent_key, limits)
    }

    pub fn set_agent_frozen(ctx: Context<SetAgentFrozen>, is_frozen: bool) -> Result<()> {
        handlers::set_agent_frozen(ctx, is_frozen)
    }

    pub fn set_vault_paused(ctx: Context<SetVaultPaused>, is_paused: bool) -> Result<()> {
        handlers::set_vault_paused(ctx, is_paused)
    }

    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        handlers::withdraw(ctx, amount)
    }

    pub fn execute_payment(ctx: Context<ExecutePayment>, amount: u64) -> Result<()> {
        handlers::execute_payment(ctx, amount)
    }
}

#[cfg(test)]
mod tests;
