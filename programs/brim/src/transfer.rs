use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};

use crate::{constants::USDC_DECIMALS, state::Vault};

pub(crate) fn transfer_from_vault<'info>(
    vault: &Account<'info, Vault>,
    mint: &InterfaceAccount<'info, Mint>,
    source: &InterfaceAccount<'info, TokenAccount>,
    destination: &InterfaceAccount<'info, TokenAccount>,
    token_program: &Interface<'info, TokenInterface>,
    amount: u64,
) -> Result<()> {
    let bump = [vault.bump];
    let seeds: &[&[u8]] = &[b"vault", vault.owner.as_ref(), vault.mint.as_ref(), &bump];
    token_interface::transfer_checked(
        CpiContext::new(
            token_program.key(),
            TransferChecked {
                from: source.to_account_info(),
                mint: mint.to_account_info(),
                to: destination.to_account_info(),
                authority: vault.to_account_info(),
            },
        )
        .with_signer(&[seeds]),
        amount,
        USDC_DECIMALS,
    )
}
