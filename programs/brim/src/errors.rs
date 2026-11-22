use anchor_lang::prelude::*;

#[error_code]
pub enum BrimError {
    #[msg("The vault is paused")]
    VaultPaused,
    #[msg("The agent is frozen")]
    AgentFrozen,
    #[msg("Payment amount must be positive")]
    InvalidAmount,
    #[msg("Per-transaction cap exceeded")]
    PerTransactionLimitExceeded,
    #[msg("Spending-window budget exceeded")]
    WindowLimitExceeded,
    #[msg("Minimum time between payments has not elapsed")]
    RateLimitExceeded,
    #[msg("Recipient is not allowed")]
    RecipientNotAllowed,
    #[msg("Invalid policy limits")]
    InvalidLimits,
    #[msg("Only the configured official USDC mint is supported")]
    UnsupportedMint,
    #[msg("Only the classic SPL Token program is supported for USDC v1")]
    UnsupportedTokenProgram,
    #[msg("Invalid agent signer or key")]
    InvalidAgent,
    #[msg("Invalid policy account")]
    InvalidPolicy,
    #[msg("Invalid vault token account")]
    InvalidVaultTokenAccount,
    #[msg("The allowlist cannot have more than 16 entries")]
    AllowlistTooLarge,
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,
    #[msg("Clock moved backwards or has invalid time")]
    InvalidClock,
    #[msg("Window duration cannot change after policy initialization")]
    WindowDurationImmutable,
    #[msg("Invalid recipient")]
    InvalidRecipient,
    #[msg("Duplicate allowlist recipient")]
    DuplicateRecipient,
    #[msg("Additional accounts are not accepted")]
    UnexpectedAccounts,
}
