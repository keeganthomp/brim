use anchor_lang::prelude::*;

#[event]
pub struct VaultInitialized {
    pub vault: Pubkey,
    pub owner: Pubkey,
    pub mint: Pubkey,
}
#[event]
pub struct AgentPolicyUpdated {
    pub vault: Pubkey,
    pub agent_key: Pubkey,
}
#[event]
pub struct AgentFrozen {
    pub vault: Pubkey,
    pub agent_key: Pubkey,
    pub is_frozen: bool,
}
#[event]
pub struct VaultPaused {
    pub vault: Pubkey,
    pub is_paused: bool,
}
#[event]
pub struct WithdrawalExecuted {
    pub vault: Pubkey,
    pub amount: u64,
}
#[event]
pub struct PaymentExecuted {
    pub vault: Pubkey,
    pub agent_key: Pubkey,
    pub recipient: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
}
