// Generated Anchor guard checks against real serialized account bytes.
use super::fixtures::{fixture, info};
use super::*;
use std::collections::BTreeSet;

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

#[test]
fn stored_vault_and_policy_bumps_must_match_their_addresses() {
    for (index, offset) in [(1, 109), (2, 134)] {
        let accounts = fixture();
        accounts[index].try_borrow_mut_data().unwrap()[offset] ^= 1;
        assert!(!accepts(accounts));
    }
}

#[test]
fn account_owners_match_the_program_and_pinned_token_program() {
    for index in [1, 2, 3, 4, 6] {
        let mut accounts = fixture();
        accounts[index].owner = Box::leak(Box::new(Pubkey::new_unique()));
        assert!(!accepts(accounts));
    }
    for index in [3, 4, 6] {
        let mut accounts = fixture();
        accounts[index].owner = Box::leak(Box::new(anchor_spl::token_2022::ID));
        assert!(!accepts(accounts));
    }
}
