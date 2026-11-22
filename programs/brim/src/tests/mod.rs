use super::*;
use crate::policy::NextSpend;
use anchor_spl::token;

fn policy() -> AgentPolicy {
    AgentPolicy {
        vault: Pubkey::new_unique(),
        agent_key: Pubkey::new_unique(),
        is_frozen: false,
        max_per_tx: 1_000_000,
        window_limit: 5_000_000,
        window_duration: 86_400,
        window_start: 1_000_000,
        window_spent: 0,
        min_tx_interval: 1,
        last_tx_ts: 0,
        allowlist_enabled: false,
        allowlist: vec![],
        bump: 255,
    }
}

fn code(result: Result<NextSpend>) -> u32 {
    match result {
        Err(anchor_lang::error::Error::AnchorError(error)) => error.error_code_number,
        _ => panic!("expected a policy rejection"),
    }
}

#[test]
fn caps_accept_boundary_and_reject_one_base_unit_over() {
    let mut p = policy();
    assert_eq!(
        p.check_payment(1_000_000, 1_000_000, Pubkey::new_unique())
            .unwrap()
            .window_spent,
        1_000_000
    );
    assert_eq!(
        code(p.check_payment(1_000_001, 1_000_000, Pubkey::new_unique())),
        6003
    );
    p.window_spent = 4_000_000;
    assert_eq!(
        p.check_payment(1_000_000, 1_000_000, Pubkey::new_unique())
            .unwrap()
            .window_spent,
        5_000_000
    );
    p.window_spent += 1;
    assert_eq!(
        code(p.check_payment(1_000_000, 1_000_000, Pubkey::new_unique())),
        6004
    );
}

#[test]
fn fixed_window_resets_exactly_at_expiry() {
    let mut p = policy();
    p.window_spent = p.window_limit;
    assert_eq!(
        code(p.check_payment(1, 1_086_399, Pubkey::new_unique())),
        6004
    );
    let next = p.check_payment(1, 1_086_400, Pubkey::new_unique()).unwrap();
    assert_eq!((next.window_start, next.window_spent), (1_086_400, 1));
    assert_eq!(
        p.window_spent, p.window_limit,
        "preflight is pure; failures never mutate counters"
    );
}

#[test]
fn rate_limit_is_minimum_spacing_and_does_not_block_first_payment() {
    let mut p = policy();
    p.min_tx_interval = 60;
    assert!(p.check_payment(1, 1_000_000, Pubkey::new_unique()).is_ok());
    p.last_tx_ts = 1_000_000;
    assert_eq!(
        code(p.check_payment(1, 1_000_059, Pubkey::new_unique())),
        6005
    );
    assert!(p.check_payment(1, 1_000_060, Pubkey::new_unique()).is_ok());
}

#[test]
fn frozen_zero_amount_backward_clock_and_overflow_are_rejected() {
    let mut p = policy();
    p.is_frozen = true;
    assert_eq!(
        code(p.check_payment(1, 1_000_000, Pubkey::new_unique())),
        6001
    );
    p.is_frozen = false;
    assert_eq!(
        code(p.check_payment(0, 1_000_000, Pubkey::new_unique())),
        6002
    );
    assert_eq!(
        code(p.check_payment(1, 999_999, Pubkey::new_unique())),
        6015
    );
    p.window_limit = u64::MAX;
    p.window_spent = u64::MAX;
    assert_eq!(
        code(p.check_payment(1, 1_000_000, Pubkey::new_unique())),
        6014
    );
}

#[test]
fn strict_empty_allowlist_denies_every_recipient() {
    let mut p = policy();
    let recipient = Pubkey::new_unique();
    p.allowlist_enabled = true;
    assert_eq!(code(p.check_payment(1, 1_000_000, recipient)), 6006);
    p.allowlist.push(recipient);
    assert!(p.check_payment(1, 1_000_000, recipient).is_ok());
    assert_eq!(
        code(p.check_payment(1, 1_000_000, Pubkey::new_unique())),
        6006
    );
}

#[test]
fn invalid_limits_and_duplicate_or_oversized_allowlists_are_rejected() {
    let mut limits = PolicyLimits {
        max_per_tx: 1,
        window_limit: 2,
        window_duration: 1,
        min_tx_interval: 0,
        allowlist_enabled: true,
        allowlist: vec![],
    };
    assert!(limits.validate().is_ok());
    limits.window_duration = 0;
    assert!(limits.validate().is_err());
    limits.window_duration = 1;
    limits.min_tx_interval = -1;
    assert!(limits.validate().is_err());
    limits.min_tx_interval = 0;
    let recipient = Pubkey::new_unique();
    limits.allowlist = vec![recipient, recipient];
    assert!(limits.validate().is_err());
    limits.allowlist = (0..17).map(|_| Pubkey::new_unique()).collect();
    assert!(limits.validate().is_err());
}

#[test]
fn account_sizes_and_discriminators_match_sdk_contract() {
    let p = policy();
    let mut data = vec![];
    p.try_serialize(&mut data).unwrap();
    assert_eq!(data.len(), 135);
    assert_eq!(&data[..8], &[148, 193, 218, 129, 21, 96, 195, 77]);
    assert_eq!(AgentPolicy::INIT_SPACE + 8, 647);
    assert_eq!(Vault::INIT_SPACE + 8, 110);
}

mod account_guards;
