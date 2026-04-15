// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Test} from "forge-std/Test.sol";
import {CyberBridge} from "./CyberBridge.sol";
import {WrappedCyberSol} from "./WrappedCyberSol.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev Minimal ERC20 to simulate the native CYBER token.
contract MockCyber is ERC20 {
    constructor() ERC20("CYBER", "CYBER") {
        _mint(msg.sender, 1_000_000 ether);
    }
}

contract CyberBridgeTest is Test {
    CyberBridge bridge;
    MockCyber cyber;
    WrappedCyberSol wCyberSol;

    address relayer = address(0xBEEF);
    address user = address(0xCAFE);
    bytes32 solRecipient = bytes32(uint256(1));

    function setUp() public {
        cyber = new MockCyber();
        bridge = new CyberBridge(address(cyber), relayer);
        wCyberSol = bridge.wrappedCyberSol();

        // Fund user with CYBER
        cyber.transfer(user, 10_000 ether);
    }

    // --- lockCyber ---

    function test_lockCyber() public {
        vm.startPrank(user);
        cyber.approve(address(bridge), 100 ether);
        bridge.lockCyber(100 ether, solRecipient);
        vm.stopPrank();

        assertEq(cyber.balanceOf(address(bridge)), 100 ether);
        assertEq(cyber.balanceOf(user), 9_900 ether);
        assertEq(bridge.lockNonce(), 1);
    }

    function test_lockCyber_zeroAmount() public {
        vm.startPrank(user);
        cyber.approve(address(bridge), 100 ether);
        vm.expectRevert("Bridge: zero amount");
        bridge.lockCyber(0, solRecipient);
        vm.stopPrank();
    }

    function test_lockCyber_zeroRecipient() public {
        vm.startPrank(user);
        cyber.approve(address(bridge), 100 ether);
        vm.expectRevert("Bridge: zero recipient");
        bridge.lockCyber(100 ether, bytes32(0));
        vm.stopPrank();
    }

    // --- unlockCyber (relayer) ---

    function test_unlockCyber() public {
        // First lock some CYBER into the bridge
        vm.startPrank(user);
        cyber.approve(address(bridge), 100 ether);
        bridge.lockCyber(100 ether, solRecipient);
        vm.stopPrank();

        // Relayer unlocks
        vm.prank(relayer);
        bridge.unlockCyber(user, 50 ether, 0);

        assertEq(cyber.balanceOf(user), 9_950 ether);
        assertEq(cyber.balanceOf(address(bridge)), 50 ether);
    }

    function test_unlockCyber_replayProtection() public {
        vm.startPrank(user);
        cyber.approve(address(bridge), 100 ether);
        bridge.lockCyber(100 ether, solRecipient);
        vm.stopPrank();

        vm.startPrank(relayer);
        bridge.unlockCyber(user, 50 ether, 0);
        vm.expectRevert("Bridge: already processed");
        bridge.unlockCyber(user, 50 ether, 0);
        vm.stopPrank();
    }

    function test_unlockCyber_onlyOwner() public {
        vm.prank(user);
        vm.expectRevert("Ownable: caller is not the owner");
        bridge.unlockCyber(user, 50 ether, 0);
    }

    // --- releaseCyberSol (relayer mints wCYBER.sol) ---

    function test_releaseCyberSol() public {
        vm.prank(relayer);
        bridge.releaseCyberSol(user, 200 ether, 0);

        assertEq(wCyberSol.balanceOf(user), 200 ether);
    }

    function test_releaseCyberSol_replayProtection() public {
        vm.startPrank(relayer);
        bridge.releaseCyberSol(user, 200 ether, 0);
        vm.expectRevert("Bridge: already processed");
        bridge.releaseCyberSol(user, 200 ether, 0);
        vm.stopPrank();
    }

    // --- redeemCyberSol (user burns wCYBER.sol) ---

    function test_redeemCyberSol() public {
        // Mint some wCYBER.sol to user first
        vm.prank(relayer);
        bridge.releaseCyberSol(user, 200 ether, 0);

        vm.prank(user);
        bridge.redeemCyberSol(100 ether, solRecipient);

        assertEq(wCyberSol.balanceOf(user), 100 ether);
        assertEq(bridge.lockNonce(), 1);
    }

    function test_redeemCyberSol_zeroAmount() public {
        vm.prank(user);
        vm.expectRevert("Bridge: zero amount");
        bridge.redeemCyberSol(0, solRecipient);
    }
}
