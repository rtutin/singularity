use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self as token, TokenAccount, TokenInterface, Transfer};

use crate::constants::*;
use crate::error::BridgeError;
use crate::state::{BridgeConfig, ProcessedNonce};

/// Relayer unlocks native CYBER.sol when user burns wCYBER.sol on EVM.
#[derive(Accounts)]
#[instruction(amount: u64, nonce: u64)]
pub struct ReleaseNative<'info> {
    #[account(
        mut,
        constraint = authority.key() == bridge_config.authority @ BridgeError::Unauthorized,
    )]
    pub authority: Signer<'info>,

    #[account(
        seeds = [BRIDGE_SEED],
        bump = bridge_config.bump,
        constraint = !bridge_config.paused @ BridgeError::BridgePaused,
    )]
    pub bridge_config: Account<'info, BridgeConfig>,

    /// Track processed nonce to prevent replay.
    #[account(
        init,
        payer = authority,
        space = 8 + ProcessedNonce::INIT_SPACE,
        seeds = [PROCESSED_SEED, b"release_native", &nonce.to_le_bytes()],
        bump,
    )]
    pub processed_nonce: Account<'info, ProcessedNonce>,

    /// Recipient's token account for the native mint.
    #[account(
        mut,
        token::mint = bridge_config.native_mint,
    )]
    pub recipient_token_account: InterfaceAccount<'info, TokenAccount>,

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
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<ReleaseNative>, amount: u64, nonce: u64) -> Result<()> {
    require!(amount > 0, BridgeError::ZeroAmount);

    ctx.accounts.processed_nonce.processed = true;

    // Transfer from vault to recipient using PDA signer
    let seeds = &[BRIDGE_SEED, &[ctx.accounts.bridge_config.bump]];
    let signer_seeds = &[&seeds[..]];

    let cpi_accounts = Transfer {
        from: ctx.accounts.vault.to_account_info(),
        to: ctx.accounts.recipient_token_account.to_account_info(),
        authority: ctx.accounts.bridge_config.to_account_info(),
    };
    let cpi_ctx =
        CpiContext::new_with_signer(ctx.accounts.token_program.key(), cpi_accounts, signer_seeds);
    token::transfer(cpi_ctx, amount)?;

    msg!(
        "ReleaseNative: recipient={}, amount={}, nonce={}",
        ctx.accounts.recipient_token_account.key(),
        amount,
        nonce
    );

    Ok(())
}
