use anchor_lang::prelude::*;

use crate::{
    constants::MAX_ALLOWLIST,
    errors::BrimError,
    state::{AgentPolicy, PolicyLimits},
};

impl PolicyLimits {
    pub(crate) fn validate(&self) -> Result<()> {
        require!(
            self.max_per_tx > 0 && self.window_limit > 0,
            BrimError::InvalidLimits
        );
        require!(
            self.max_per_tx <= self.window_limit,
            BrimError::InvalidLimits
        );
        require!(
            self.window_duration > 0 && self.min_tx_interval >= 0,
            BrimError::InvalidLimits
        );
        require!(
            self.allowlist.len() <= MAX_ALLOWLIST,
            BrimError::AllowlistTooLarge
        );
        for (i, recipient) in self.allowlist.iter().enumerate() {
            require!(*recipient != Pubkey::default(), BrimError::InvalidRecipient);
            require!(
                !self.allowlist[..i].contains(recipient),
                BrimError::DuplicateRecipient
            );
        }
        Ok(())
    }
}

pub(crate) struct NextSpend {
    pub(crate) window_start: i64,
    pub(crate) window_spent: u64,
}

impl AgentPolicy {
    pub(crate) fn check_payment(
        &self,
        amount: u64,
        now: i64,
        recipient: Pubkey,
    ) -> Result<NextSpend> {
        require!(!self.is_frozen, BrimError::AgentFrozen);
        require!(amount > 0, BrimError::InvalidAmount);
        require!(
            amount <= self.max_per_tx,
            BrimError::PerTransactionLimitExceeded
        );
        require!(
            self.window_duration > 0 && self.min_tx_interval >= 0,
            BrimError::InvalidLimits
        );
        require!(
            now >= 0 && now >= self.window_start && now >= self.last_tx_ts,
            BrimError::InvalidClock
        );
        if self.last_tx_ts != 0 {
            let since_last = now
                .checked_sub(self.last_tx_ts)
                .ok_or(BrimError::ArithmeticOverflow)?;
            require!(
                since_last >= self.min_tx_interval,
                BrimError::RateLimitExceeded
            );
        }
        let elapsed = now
            .checked_sub(self.window_start)
            .ok_or(BrimError::ArithmeticOverflow)?;
        let (window_start, spent) = if elapsed >= self.window_duration {
            (now, 0)
        } else {
            (self.window_start, self.window_spent)
        };
        let window_spent = spent
            .checked_add(amount)
            .ok_or(BrimError::ArithmeticOverflow)?;
        require!(
            window_spent <= self.window_limit,
            BrimError::WindowLimitExceeded
        );
        require!(
            !self.allowlist_enabled || self.allowlist.contains(&recipient),
            BrimError::RecipientNotAllowed
        );
        Ok(NextSpend {
            window_start,
            window_spent,
        })
    }
}
