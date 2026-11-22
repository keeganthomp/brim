use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token,
    token_interface::{Mint, TokenAccount, TokenInterface},
};

use crate::{constants::*, errors::BrimError, state::*};

#[derive(Accounts)]
pub struct InitVault<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    pub owner: Signer<'info>,
    #[account(address = USDC_MINT @ BrimError::UnsupportedMint, mint::token_program = token_program,
        constraint = mint.decimals == USDC_DECIMALS @ BrimError::UnsupportedMint)]
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(init, payer = payer, space = 8 + Vault::INIT_SPACE,
        seeds = [b"vault", owner.key().as_ref(), mint.key().as_ref()], bump)]
    pub vault: Account<'info, Vault>,
    #[account(init_if_needed, payer = payer, associated_token::mint = mint,
        associated_token::authority = vault, associated_token::token_program = token_program)]
    pub vault_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(address = token::ID @ BrimError::UnsupportedTokenProgram)]
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(agent_key: Pubkey)]
pub struct UpsertAgentPolicy<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    pub owner: Signer<'info>,
    #[account(mut, has_one = owner,
        seeds = [b"vault", vault.owner.as_ref(), vault.mint.as_ref()], bump = vault.bump)]
    pub vault: Account<'info, Vault>,
    #[account(init_if_needed, payer = payer, space = 8 + AgentPolicy::INIT_SPACE,
        seeds = [b"agent", vault.key().as_ref(), agent_key.as_ref()], bump)]
    pub policy: Account<'info, AgentPolicy>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetAgentFrozen<'info> {
    pub owner: Signer<'info>,
    #[account(has_one = owner,
        seeds = [b"vault", vault.owner.as_ref(), vault.mint.as_ref()], bump = vault.bump)]
    pub vault: Account<'info, Vault>,
    #[account(mut, has_one = vault,
        seeds = [b"agent", vault.key().as_ref(), policy.agent_key.as_ref()], bump = policy.bump)]
    pub policy: Account<'info, AgentPolicy>,
}

#[derive(Accounts)]
pub struct SetVaultPaused<'info> {
    pub owner: Signer<'info>,
    #[account(mut, has_one = owner,
        seeds = [b"vault", vault.owner.as_ref(), vault.mint.as_ref()], bump = vault.bump)]
    pub vault: Account<'info, Vault>,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    pub owner: Signer<'info>,
    #[account(has_one = owner, has_one = mint,
        constraint = vault.token_account == vault_token_account.key() @ BrimError::InvalidVaultTokenAccount,
        seeds = [b"vault", vault.owner.as_ref(), vault.mint.as_ref()], bump = vault.bump)]
    pub vault: Account<'info, Vault>,
    #[account(address = USDC_MINT @ BrimError::UnsupportedMint, mint::token_program = token_program,
        constraint = mint.decimals == USDC_DECIMALS @ BrimError::UnsupportedMint)]
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(mut, associated_token::mint = mint, associated_token::authority = vault,
        associated_token::token_program = token_program)]
    pub vault_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, associated_token::mint = mint, associated_token::authority = owner,
        associated_token::token_program = token_program)]
    pub owner_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(address = token::ID @ BrimError::UnsupportedTokenProgram)]
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct ExecutePayment<'info> {
    pub agent: Signer<'info>,
    #[account(has_one = mint,
        constraint = vault.token_account == vault_token_account.key() @ BrimError::InvalidVaultTokenAccount,
        seeds = [b"vault", vault.owner.as_ref(), vault.mint.as_ref()], bump = vault.bump)]
    pub vault: Account<'info, Vault>,
    #[account(mut, has_one = vault,
        constraint = policy.agent_key == agent.key() @ BrimError::InvalidAgent,
        seeds = [b"agent", vault.key().as_ref(), agent.key().as_ref()], bump = policy.bump)]
    pub policy: Account<'info, AgentPolicy>,
    #[account(address = USDC_MINT @ BrimError::UnsupportedMint, mint::token_program = token_program,
        constraint = mint.decimals == USDC_DECIMALS @ BrimError::UnsupportedMint)]
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(mut, associated_token::mint = mint, associated_token::authority = vault,
        associated_token::token_program = token_program)]
    pub vault_token_account: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: Only used as the recipient ATA authority and allowlist key; no data read.
    pub recipient: UncheckedAccount<'info>,
    #[account(mut, associated_token::mint = mint, associated_token::authority = recipient,
        associated_token::token_program = token_program)]
    pub recipient_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(address = token::ID @ BrimError::UnsupportedTokenProgram)]
    pub token_program: Interface<'info, TokenInterface>,
}
