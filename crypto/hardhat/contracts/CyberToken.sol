// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title CYBER.sol — the native token on Cyberia EVM.
contract CyberToken is ERC20, Ownable {
    constructor() ERC20("CYBER.sol", "CYBER.sol") Ownable() {
        // Mint initial supply to deployer
        _mint(msg.sender, 1_000_000 ether);
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
