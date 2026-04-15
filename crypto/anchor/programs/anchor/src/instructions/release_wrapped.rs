use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self as token, Mint, MintTo, TokenAccount, TokenInterface};

use crate::constants::*;
use crate::error::BridgeError;
use crate::state::{BridgeConfig, ProcessedNonce};

/// Relayer mints wrapped wCYBER when user locks CYBER on EVM.
#[derive(Accounts)]
#[instruction(amount: u64, nonce: u64)]
pub struct ReleaseWrapped<'info> {
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
        seeds = [PROCESSED_SEED, b"release_wrapped", &nonce.to_le_bytes()],
        bump,
    )]
    pub processed_nonce: Account<'info, ProcessedNonce>,

    /// The wrapped token mint. Bridge PDA is the mint authority.
    #[account(
        mut,
        address = bridge_config.wrapped_mint,
    )]
    pub wrapped_mint: InterfaceAccount<'info, Mint>,

    /// Recipient's token account for the wrapped mint.
    #[account(
        mut,
        token::mint = wrapped_mint,
    )]
    pub recipient_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<ReleaseWrapped>, amount: u64, nonce: u64) -> Result<()> {
    require!(amount > 0, BridgeError::ZeroAmount);

    ctx.accounts.processed_nonce.processed = true;

    // Mint wrapped tokens using bridge PDA as mint authority
    let seeds = &[BRIDGE_SEED, &[ctx.accounts.bridge_config.bump]];
    let signer_seeds = &[&seeds[..]];

    let cpi_accounts = MintTo {
        mint: ctx.accounts.wrapped_mint.to_account_info(),
        to: ctx.accounts.recipient_token_account.to_account_info(),
        authority: ctx.accounts.bridge_config.to_account_info(),
    };
    let cpi_ctx =
        CpiContext::new_with_signer(ctx.accounts.token_program.key(), cpi_accounts, signer_seeds);
    token::mint_to(cpi_ctx, amount)?;

    msg!(
        "ReleaseWrapped: recipient={}, amount={}, nonce={}",
        ctx.accounts.recipient_token_account.key(),
        amount,
        nonce
    );

    Ok(())
}
