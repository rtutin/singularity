pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("FRDGTfySMijDP7sjw3tQq9u2FtEHteUCZu5jR9MGErEJ");

#[program]
pub mod cyber_bridge {
    use super::*;

    /// Initialize the bridge with native and wrapped token mints.
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        instructions::initialize::handler(ctx)
    }

    /// User locks native CYBER.sol to bridge to EVM.
    pub fn lock_native(
        ctx: Context<LockNative>,
        amount: u64,
        evm_recipient: [u8; 20],
    ) -> Result<()> {
        instructions::lock_native::handler(ctx, amount, evm_recipient)
    }

    /// Relayer unlocks native CYBER.sol when user redeems wCYBER.sol on EVM.
    pub fn release_native(ctx: Context<ReleaseNative>, amount: u64, nonce: u64) -> Result<()> {
        instructions::release_native::handler(ctx, amount, nonce)
    }

    /// Relayer mints wrapped wCYBER when user locks CYBER on EVM.
    pub fn release_wrapped(ctx: Context<ReleaseWrapped>, amount: u64, nonce: u64) -> Result<()> {
        instructions::release_wrapped::handler(ctx, amount, nonce)
    }

    /// User burns wrapped wCYBER to redeem native CYBER on EVM.
    pub fn redeem_wrapped(
        ctx: Context<RedeemWrapped>,
        amount: u64,
        evm_recipient: [u8; 20],
    ) -> Result<()> {
        instructions::redeem_wrapped::handler(ctx, amount, evm_recipient)
    }
}
