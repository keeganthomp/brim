use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Vault {
    pub owner: Pubkey,
    pub mint: Pubkey,
    pub token_account: Pubkey,
    pub total_agents: u32,
    pub is_paused: bool,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct AgentPolicy {
    pub vault: Pubkey,
    pub agent_key: Pubkey,
    pub is_frozen: bool,
    pub max_per_tx: u64,
    pub window_limit: u64,
    pub window_duration: i64,
    pub window_start: i64,
    pub window_spent: u64,
    pub min_tx_interval: i64,
    pub last_tx_ts: i64,
    pub allowlist_enabled: bool,
    #[max_len(16)]
    pub allowlist: Vec<Pubkey>,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct PolicyLimits {
    pub max_per_tx: u64,
    pub window_limit: u64,
    pub window_duration: i64,
    pub min_tx_interval: i64,
    pub allowlist_enabled: bool,
    pub allowlist: Vec<Pubkey>,
}
