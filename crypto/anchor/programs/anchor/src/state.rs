use anchor_lang::prelude::*;

/// Global bridge configuration. PDA seed: ["bridge"].
#[account]
#[derive(InitSpace)]
pub struct BridgeConfig {
    /// The authority (relayer) that can release/unlock tokens.
    pub authority: Pubkey,
    /// The SPL mint of the native token being bridged (CYBER.sol).
    pub native_mint: Pubkey,
    /// The SPL mint of the wrapped token from EVM (wCYBER).
    /// This mint's authority is the bridge PDA.
    pub wrapped_mint: Pubkey,
    /// Monotonically increasing nonce for lock events.
    pub lock_nonce: u64,
    /// Bump seed for the bridge PDA.
    pub bump: u8,
    /// Whether the bridge is paused.
    pub paused: bool,
}

/// Tracks processed nonces to prevent replay. PDA seed: ["processed", nonce_type, nonce_bytes].
#[account]
#[derive(InitSpace)]
pub struct ProcessedNonce {
    /// Whether this nonce has been processed.
    pub processed: bool,
}
