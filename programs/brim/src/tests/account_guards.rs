// Exercise Anchor's generated account guards on real Borsh/SPL account bytes.
// These host tests complement policy tests; CPI execution still needs a VM.
use super::*;
use anchor_lang::solana_program::{program_option::COption, program_pack::Pack};
use anchor_spl::associated_token::get_associated_token_address;
use anchor_spl::token::spl_token::state::{Account as SplAccount, AccountState, Mint as SplMint};
use std::collections::BTreeSet;

fn info(
    key: Pubkey,
    owner: Pubkey,
    data: Vec<u8>,
    signer: bool,
    writable: bool,
    executable: bool,
) -> AccountInfo<'static> {
    AccountInfo::new(
        Box::leak(Box::new(key)),
        signer,
        writable,
        Box::leak(Box::new(10_000_000)),
        Box::leak(data.into_boxed_slice()),
        Box::leak(Box::new(owner)),
        executable,
    )
}

fn token_data(mint: Pubkey, owner: Pubkey) -> Vec<u8> {
    let mut data = vec![0; SplAccount::LEN];
    SplAccount::pack(
        SplAccount {
            mint,
            owner,
            amount: 10_000_000,
            delegate: COption::None,
            state: AccountState::Initialized,
            is_native: COption::None,
            delegated_amount: 0,
            close_authority: COption::None,
        },
        &mut data,
    )
    .unwrap();
    data
}

fn fixture() -> Vec<AccountInfo<'static>> {
    let owner = Pubkey::new_unique();
    let agent = Pubkey::new_unique();
    let recipient = Pubkey::new_unique();
    let (vault_key, vault_bump) =
        Pubkey::find_program_address(&[b"vault", owner.as_ref(), USDC_MINT.as_ref()], &crate::ID);
    let (policy_key, policy_bump) =
        Pubkey::find_program_address(&[b"agent", vault_key.as_ref(), agent.as_ref()], &crate::ID);
    let source = get_associated_token_address(&vault_key, &USDC_MINT);
    let destination = get_associated_token_address(&recipient, &USDC_MINT);
    let vault = Vault {
        owner,
        mint: USDC_MINT,
        token_account: source,
        total_agents: 1,
        is_paused: false,
        bump: vault_bump,
    };
    let mut vault_data = vec![];
    vault.try_serialize(&mut vault_data).unwrap();
    let mut p = policy();
    p.vault = vault_key;
    p.agent_key = agent;
    p.bump = policy_bump;
    let mut policy_data = vec![];
    p.try_serialize(&mut policy_data).unwrap();
    policy_data.resize(8 + AgentPolicy::INIT_SPACE, 0);
    let mut mint_data = vec![0; SplMint::LEN];
    SplMint::pack(
        SplMint {
            mint_authority: COption::None,
            supply: 100_000_000,
            decimals: USDC_DECIMALS,
            is_initialized: true,
            freeze_authority: COption::None,
        },
        &mut mint_data,
    )
    .unwrap();
    vec![
        info(agent, Pubkey::default(), vec![], true, false, false),
        info(vault_key, crate::ID, vault_data, false, false, false),
        info(policy_key, crate::ID, policy_data, false, true, false),
        info(USDC_MINT, token::ID, mint_data, false, false, false),
        info(
            source,
            token::ID,
            token_data(USDC_MINT, vault_key),
            false,
            true,
            false,
        ),
        info(recipient, Pubkey::default(), vec![], false, false, false),
        info(
            destination,
            token::ID,
            token_data(USDC_MINT, recipient),
            false,
            true,
            false,
        ),
        info(token::ID, Pubkey::new_unique(), vec![], false, false, true),
    ]
}

fn accepts(accounts: Vec<AccountInfo<'static>>) -> bool {
    let accounts = Box::leak(accounts.into_boxed_slice());
    ExecutePayment::try_accounts(
        &crate::ID,
        &mut &accounts[..],
        &[],
        &mut ExecutePaymentBumps::default(),
        &mut BTreeSet::new(),
    )
    .is_ok()
}

#[test]
fn canonical_accounts_are_accepted() {
    assert!(accepts(fixture()));
}

#[test]
fn missing_agent_signature_and_substituted_recipient_are_rejected() {
    let mut accounts = fixture();
    accounts[0].is_signer = false;
    assert!(!accepts(accounts));
    let mut accounts = fixture();
    accounts[5] = info(
        Pubkey::new_unique(),
        Pubkey::default(),
        vec![],
        false,
        false,
        false,
    );
    assert!(!accepts(accounts));
}

#[test]
fn foreign_policy_wrong_mint_and_wrong_token_program_are_rejected() {
    let accounts = fixture();
    accounts[2].try_borrow_mut_data().unwrap()[8..40]
        .copy_from_slice(Pubkey::new_unique().as_ref());
    assert!(!accepts(accounts));
    let mut accounts = fixture();
    accounts[3].key = Box::leak(Box::new(Pubkey::new_unique()));
    assert!(!accepts(accounts));
    let mut accounts = fixture();
    accounts[7].key = Box::leak(Box::new(Pubkey::new_unique()));
    assert!(!accepts(accounts));
}
