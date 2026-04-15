use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self as token, Burn, Mint, TokenAccount, TokenInterface};

use crate::constants::*;
use crate::error::BridgeError;
use crate::state::BridgeConfig;

/// User burns wrapped wCYBER to redeem native CYBER on EVM.
/// The backend relayer detects the RedeemWrapped event and unlocks CYBER on EVM.
#[derive(Accounts)]
pub struct RedeemWrapped<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [BRIDGE_SEED],
        bump = bridge_config.bump,
        constraint = !bridge_config.paused @ BridgeError::BridgePaused,
    )]
    pub bridge_config: Account<'info, BridgeConfig>,

    /// The wrapped token mint. Bridge PDA is the mint authority.
    #[account(
        mut,
        address = bridge_config.wrapped_mint,
    )]
    pub wrapped_mint: InterfaceAccount<'info, Mint>,

    /// User's token account for the wrapped mint.
    #[account(
        mut,
        token::mint = wrapped_mint,
        token::authority = user,
    )]
    pub user_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handler(ctx: Context<RedeemWrapped>, amount: u64, evm_recipient: [u8; 20]) -> Result<()> {
    require!(amount > 0, BridgeError::ZeroAmount);
    require!(evm_recipient != [0u8; 20], BridgeError::InvalidEvmRecipient);

    // Burn wrapped tokens from user
    let cpi_accounts = Burn {
        mint: ctx.accounts.wrapped_mint.to_account_info(),
        from: ctx.accounts.user_token_account.to_account_info(),
        authority: ctx.accounts.user.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(ctx.accounts.token_program.key(), cpi_accounts);
    token::burn(cpi_ctx, amount)?;

    let bridge = &mut ctx.accounts.bridge_config;
    let nonce = bridge.lock_nonce;
    bridge.lock_nonce = nonce.checked_add(1).unwrap();

    msg!(
        "RedeemWrapped: user={}, amount={}, evm_recipient={}, nonce={}",
        ctx.accounts.user.key(),
        amount,
        hex::encode(evm_recipient),
        nonce
    );

    emit!(RedeemWrappedEvent {
        user: ctx.accounts.user.key(),
        amount,
        evm_recipient,
        nonce,
    });

    Ok(())
}

#[event]
pub struct RedeemWrappedEvent {
    pub user: Pubkey,
    pub amount: u64,
    pub evm_recipient: [u8; 20],
    pub nonce: u64,
}
