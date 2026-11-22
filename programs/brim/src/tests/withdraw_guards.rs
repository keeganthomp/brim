use super::fixtures::{fixture, info, token_data};
use super::*;
use anchor_spl::associated_token::get_associated_token_address;
use std::collections::BTreeSet;

fn withdraw_fixture() -> Vec<AccountInfo<'static>> {
    let accounts = fixture();
    let owner = Pubkey::new_from_array(
        accounts[1].try_borrow_data().unwrap()[8..40]
            .try_into()
            .unwrap(),
    );
    vec![
        info(owner, Pubkey::default(), vec![], true, false, false),
        accounts[1].clone(),
        accounts[3].clone(),
        accounts[4].clone(),
        info(
            get_associated_token_address(&owner, &USDC_MINT),
            token::ID,
            token_data(USDC_MINT, owner),
            false,
            true,
            false,
        ),
        accounts[7].clone(),
    ]
}

fn accepts_withdraw(accounts: Vec<AccountInfo<'static>>) -> bool {
    let accounts = Box::leak(accounts.into_boxed_slice());
    Withdraw::try_accounts(
        &crate::ID,
        &mut &accounts[..],
        &[],
        &mut WithdrawBumps::default(),
        &mut BTreeSet::new(),
    )
    .is_ok()
}

#[test]
fn withdraw_requires_the_registered_owners_signature() {
    assert!(accepts_withdraw(withdraw_fixture()));
    let mut accounts = withdraw_fixture();
    accounts[0].is_signer = false;
    assert!(!accepts_withdraw(accounts));
    let mut accounts = withdraw_fixture();
    accounts[0].key = Box::leak(Box::new(Pubkey::new_unique()));
    assert!(!accepts_withdraw(accounts));
}
