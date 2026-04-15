// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title CyberSol
/// @notice Bridged CYBER.sol token on EVM.
///         Only the bridge contract (owner) can mint and burn.
contract WrappedCyberSol is ERC20, Ownable {
    constructor(address bridge) ERC20("CYBER.sol", "CYBER.sol") Ownable() {
        _transferOwnership(bridge);
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external onlyOwner {
        _burn(from, amount);
    }
}
