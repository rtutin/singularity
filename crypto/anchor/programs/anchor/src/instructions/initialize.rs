use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::constants::*;
use crate::state::BridgeConfig;

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// The native SPL token mint being bridged (e.g. CYBER.sol).
    pub native_mint: InterfaceAccount<'info, Mint>,

    /// The wrapped SPL token mint (wCYBER). Must be created beforehand
    /// with the bridge PDA as mint authority.
    pub wrapped_mint: InterfaceAccount<'info, Mint>,

    /// Bridge config PDA.
    #[account(
        init,
        payer = authority,
        space = 8 + BridgeConfig::INIT_SPACE,
        seeds = [BRIDGE_SEED],
        bump,
    )]
    pub bridge_config: Account<'info, BridgeConfig>,

    /// Vault token account to hold locked native tokens.
    /// Owned by the bridge PDA.
    #[account(
        init,
        payer = authority,
        token::mint = native_mint,
        token::authority = bridge_config,
        seeds = [VAULT_SEED, native_mint.key().as_ref()],
        bump,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
    pub token_program: Interface<'info, TokenInterface>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<Initialize>) -> Result<()> {
    let bridge = &mut ctx.accounts.bridge_config;
    bridge.authority = ctx.accounts.authority.key();
    bridge.native_mint = ctx.accounts.native_mint.key();
    bridge.wrapped_mint = ctx.accounts.wrapped_mint.key();
    bridge.lock_nonce = 0;
    bridge.bump = ctx.bumps.bridge_config;
    bridge.paused = false;

    msg!("Bridge initialized");
    Ok(())
}
