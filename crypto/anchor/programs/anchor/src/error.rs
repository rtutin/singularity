use anchor_lang::prelude::*;

#[error_code]
pub enum BridgeError {
    #[msg("Bridge is paused")]
    BridgePaused,
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Invalid EVM recipient address")]
    InvalidEvmRecipient,
    #[msg("Nonce already processed")]
    NonceAlreadyProcessed,
    #[msg("Unauthorized")]
    Unauthorized,
}
