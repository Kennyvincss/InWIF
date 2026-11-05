// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {InWIFRewards} from "../src/InWIFRewards.sol";
import {TestRewardToken} from "../src/TestRewardToken.sol";

/// One-shot testnet setup, broadcast from a throwaway deployer:
///   1. deploy TestRewardToken (no value) and InWIFRewards (deployer as temporary admin)
///   2. create campaign #1 with the given Merkle root and claims-file URI, and fund it
///   3. grant every role to ADMIN (the owner's wallet) and renounce all deployer roles,
///      so the deployer key ends with no power over the contract.
///
///   ADMIN=0x… ROOT=0x… TOTAL=<base units> CLAIMS_URI=https://… DEADLINE_DAYS=30 \
///   forge script script/SetupTestnetRewards.s.sol --rpc-url <testnet> --broadcast --private-key …
contract SetupTestnetRewards is Script {
    uint256 constant ROBINHOOD_MAINNET = 4663;

    struct Result {
        address token;
        address rewards;
        uint256 campaignId;
    }

    function run() external returns (Result memory r) {
        require(block.chainid != ROBINHOOD_MAINNET, "testnet only: InWIFRewards is unaudited");
        address admin = vm.envAddress("ADMIN");
        bytes32 root = vm.envBytes32("ROOT");
        uint256 total = vm.envUint("TOTAL");
        string memory uri = vm.envString("CLAIMS_URI");
        uint256 days_ = vm.envOr("DEADLINE_DAYS", uint256(30));
        require(admin != address(0) && root != bytes32(0) && total > 0, "ADMIN, ROOT and TOTAL are required");

        vm.startBroadcast();
        // The broadcasting account (from --private-key / --account), not the script's msg.sender.
        (, address deployer,) = vm.readCallers();
        r = _setup(admin, root, total, uri, uint64(block.timestamp + days_ * 1 days), deployer);
        vm.stopBroadcast();

        console2.log("TestRewardToken", r.token);
        console2.log("InWIFRewards", r.rewards);
        console2.log("campaignId", r.campaignId);
        console2.log("admin", admin);
    }

    function _setup(address admin, bytes32 root, uint256 total, string memory uri, uint64 deadline, address deployer)
        internal
        returns (Result memory r)
    {
        TestRewardToken token = new TestRewardToken(total);
        InWIFRewards rewards = new InWIFRewards(deployer);
        uint256 id = rewards.createCampaign(IERC20(address(token)), root, deadline, uri);
        token.approve(address(rewards), total);
        rewards.fund(id, total);

        rewards.grantRole(rewards.DEFAULT_ADMIN_ROLE(), admin);
        rewards.grantRole(rewards.CAMPAIGN_MANAGER_ROLE(), admin);
        rewards.grantRole(rewards.PAUSER_ROLE(), admin);
        rewards.renounceRole(rewards.PAUSER_ROLE(), deployer);
        rewards.renounceRole(rewards.CAMPAIGN_MANAGER_ROLE(), deployer);
        rewards.renounceRole(rewards.DEFAULT_ADMIN_ROLE(), deployer);
        return Result(address(token), address(rewards), id);
    }
}
