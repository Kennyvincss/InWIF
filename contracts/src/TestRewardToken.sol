// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title TestRewardToken
/// @notice TESTNET-ONLY reward token with no monetary value, used to demonstrate InWIF reward
///         campaigns on Robinhood Chain Testnet (real $WIF exists only on mainnet).
///         Fixed supply minted once to the deployer; no mint function, no owner.
contract TestRewardToken is ERC20 {
    error MainnetNotAllowed();

    constructor(uint256 supply) ERC20("InWIF Test Reward (testnet, no value)", "tWIF") {
        if (block.chainid == 4663) revert MainnetNotAllowed();
        _mint(msg.sender, supply);
    }
}
