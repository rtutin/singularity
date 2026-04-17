use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self as token, TokenAccount, TokenInterface, Transfer};

use crate::constants::*;
use crate::error::BridgeError;
use crate::state::BridgeConfig;

/// User locks native CYBER.sol to bridge to EVM.
/// The backend relayer detects the LockNative event and mints wCYBER.sol on EVM.
#[derive(Accounts)]
pub struct LockNative<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [BRIDGE_SEED],
        bump = bridge_config.bump,
        constraint = !bridge_config.paused @ BridgeError::BridgePaused,
    )]
    pub bridge_config: Account<'info, BridgeConfig>,

    /// User's token account for the native mint.
    #[account(
        mut,
        token::mint = bridge_config.native_mint,
        token::authority = user,
    )]
    pub user_token_account: InterfaceAccount<'info, TokenAccount>,

    /// Bridge vault holding locked native tokens.
    #[account(
        mut,
        seeds = [VAULT_SEED, bridge_config.native_mint.as_ref()],
        bump,
        token::mint = bridge_config.native_mint,
        token::authority = bridge_config,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handler(ctx: Context<LockNative>, amount: u64, evm_recipient: [u8; 20]) -> Result<()> {
    require!(amount > 0, BridgeError::ZeroAmount);
    require!(evm_recipient != [0u8; 20], BridgeError::InvalidEvmRecipient);

    // Transfer native tokens from user to vault
    let cpi_accounts = Transfer {
        from: ctx.accounts.user_token_account.to_account_info(),
        to: ctx.accounts.vault.to_account_info(),
        authority: ctx.accounts.user.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(ctx.accounts.token_program.key(), cpi_accounts);
    token::transfer(cpi_ctx, amount)?;

    let bridge = &mut ctx.accounts.bridge_config;
    let nonce = bridge.lock_nonce;
    bridge.lock_nonce = nonce.checked_add(1).unwrap();

    msg!(
        "LockNative: user={}, amount={}, evm_recipient={}, nonce={}",
        ctx.accounts.user.key(),
        amount,
        hex::encode(evm_recipient),
        nonce
    );

    emit!(LockNativeEvent {
        user: ctx.accounts.user.key(),
        amount,
        evm_recipient,
        nonce,
    });

    Ok(())
}

#[event]
pub struct LockNativeEvent {
    pub user: Pubkey,
    pub amount: u64,
    pub evm_recipient: [u8; 20],
    pub nonce: u64,
}
