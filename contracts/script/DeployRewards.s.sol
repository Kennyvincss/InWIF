// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {InWIFRewards} from "../src/InWIFRewards.sol";

/// Deploys InWIFRewards to Robinhood Chain TESTNET or a local Anvil node.
///
///   forge script script/DeployRewards.s.sol --rpc-url $RH_TESTNET_RPC --broadcast \
///     --account <keystore-name> --sig "run(address)" <adminAddress>
///
/// Mainnet deployment is deliberately blocked until an independent audit exists.
contract DeployRewards is Script {
    uint256 constant ROBINHOOD_MAINNET = 4663;

    function run(address admin) external returns (InWIFRewards rewards) {
        require(block.chainid != ROBINHOOD_MAINNET, "InWIFRewards is unaudited: mainnet deployment is disabled");
        require(admin != address(0), "admin required");
        vm.startBroadcast();
        rewards = new InWIFRewards(admin);
        vm.stopBroadcast();
        console2.log("InWIFRewards deployed at", address(rewards));
        console2.log("chainId", block.chainid);
    }
}
