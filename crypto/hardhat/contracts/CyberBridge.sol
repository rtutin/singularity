// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {WrappedCyberSol} from "./WrappedCyberSol.sol";

/// @title CyberBridge
/// @notice Bidirectional bridge between Cyberia EVM and Solana.
///
///   EVM -> Solana:
///     User calls lockCyber(amount, solanaRecipient) to lock native CYBER ERC20.
///     Backend relayer detects LockCyber event and mints wCYBER on Solana.
///
///   Solana -> EVM:
///     User locks CYBER.sol on the Solana bridge program.
///     Backend relayer calls releaseCyberSol(to, amount, nonce) to mint wCYBER.sol on EVM.
///
///   Reverse redemption:
///     User calls redeemCyberSol(amount, solanaRecipient) to burn wCYBER.sol on EVM.
///     Backend relayer unlocks CYBER.sol on Solana.
///
///     User locks wCYBER on Solana bridge program.
///     Backend relayer calls unlockCyber(to, amount, nonce) to return native CYBER ERC20.
contract CyberBridge is Ownable {
    IERC20 public immutable cyberToken;
    WrappedCyberSol public immutable wrappedCyberSol;

    mapping(bytes32 => bool) public processedNonces;

    uint64 public lockNonce;

    // --- Events ---

    /// @notice Emitted when a user locks native CYBER to bridge to Solana.
    event LockCyber(
        address indexed sender,
        uint256 amount,
        bytes32 solanaRecipient,
        uint64 nonce
    );

    /// @notice Emitted when the relayer unlocks native CYBER returning from Solana.
    event UnlockCyber(
        address indexed recipient,
        uint256 amount,
        uint64 nonce
    );

    /// @notice Emitted when the relayer mints wCYBER.sol (Solana CYBER bridged to EVM).
    event ReleaseCyberSol(
        address indexed recipient,
        uint256 amount,
        uint64 nonce
    );

    /// @notice Emitted when a user burns wCYBER.sol to redeem back on Solana.
    event RedeemCyberSol(
        address indexed sender,
        uint256 amount,
        bytes32 solanaRecipient,
        uint64 nonce
    );

    constructor(address _cyberToken, address relayer) Ownable() {
        cyberToken = IERC20(_cyberToken);
        wrappedCyberSol = new WrappedCyberSol(address(this));
        _transferOwnership(relayer);
    }

    // ---------------------------------------------------------------
    //  EVM -> Solana  (lock native CYBER)
    // ---------------------------------------------------------------

    /// @notice Lock CYBER ERC20 to bridge to Solana. Caller must approve first.
    /// @param amount      Amount of CYBER tokens (18 decimals).
    /// @param solanaRecipient  The 32-byte Solana public key that will receive wCYBER.
    function lockCyber(uint256 amount, bytes32 solanaRecipient) external {
        require(amount > 0, "Bridge: zero amount");
        require(solanaRecipient != bytes32(0), "Bridge: zero recipient");

        cyberToken.transferFrom(msg.sender, address(this), amount);

        uint64 nonce = lockNonce++;
        emit LockCyber(msg.sender, amount, solanaRecipient, nonce);
    }

    /// @notice Relayer unlocks native CYBER when user bridges wCYBER back from Solana.
    function unlockCyber(
        address to,
        uint256 amount,
        uint64 nonce
    ) external onlyOwner {
        bytes32 key = keccak256(abi.encodePacked("unlockCyber", to, amount, nonce));
        require(!processedNonces[key], "Bridge: already processed");
        processedNonces[key] = true;

        cyberToken.transfer(to, amount);
        emit UnlockCyber(to, amount, nonce);
    }

    // ---------------------------------------------------------------
    //  Solana -> EVM  (mint wCYBER.sol)
    // ---------------------------------------------------------------

    /// @notice Relayer mints wCYBER.sol when user locks CYBER.sol on Solana.
    function releaseCyberSol(
        address to,
        uint256 amount,
        uint64 nonce
    ) external onlyOwner {
        bytes32 key = keccak256(abi.encodePacked("releaseCyberSol", to, amount, nonce));
        require(!processedNonces[key], "Bridge: already processed");
        processedNonces[key] = true;

        wrappedCyberSol.mint(to, amount);
        emit ReleaseCyberSol(to, amount, nonce);
    }

    /// @notice Burn wCYBER.sol to redeem original CYBER.sol on Solana.
    /// @param amount           Amount to burn (18 decimals on EVM side).
    /// @param solanaRecipient  32-byte Solana pubkey to receive unlocked CYBER.sol.
    function redeemCyberSol(uint256 amount, bytes32 solanaRecipient) external {
        require(amount > 0, "Bridge: zero amount");
        require(solanaRecipient != bytes32(0), "Bridge: zero recipient");

        wrappedCyberSol.burn(msg.sender, amount);

        uint64 nonce = lockNonce++;
        emit RedeemCyberSol(msg.sender, amount, solanaRecipient, nonce);
    }
}
