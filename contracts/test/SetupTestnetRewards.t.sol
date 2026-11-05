// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {InWIFRewards} from "../src/InWIFRewards.sol";
import {TestRewardToken} from "../src/TestRewardToken.sol";
import {SetupTestnetRewards} from "../script/SetupTestnetRewards.s.sol";
import {Merkle} from "./utils/Merkle.sol";

contract SetupTestnetRewardsTest is Test {
    address admin = makeAddr("owner-wallet");
    address alice = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266;
    address bob = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8;

    function _env(bytes32 root, uint256 total) internal {
        vm.setEnv("ADMIN", vm.toString(admin));
        vm.setEnv("ROOT", vm.toString(root));
        vm.setEnv("TOTAL", vm.toString(total));
        vm.setEnv("CLAIMS_URI", "https://inwif.vercel.app/rewards/testnet-campaign-1.json");
        vm.setEnv("DEADLINE_DAYS", "30");
    }

    function test_setupHandsAllPowerToAdminAndClaimsWork() public {
        vm.chainId(46630);
        bytes32[] memory l = new bytes32[](2);
        l[0] = Merkle.leaf(1, alice, 100 ether);
        l[1] = Merkle.leaf(1, bob, 250 ether);
        _env(Merkle.root(l), 350 ether);

        SetupTestnetRewards s = new SetupTestnetRewards();
        SetupTestnetRewards.Result memory r = s.run();
        InWIFRewards rewards = InWIFRewards(r.rewards);
        address deployer = DEFAULT_SENDER; // the broadcaster in tests

        // Owner holds every role; the deployer holds none.
        assertTrue(rewards.hasRole(rewards.DEFAULT_ADMIN_ROLE(), admin));
        assertTrue(rewards.hasRole(rewards.CAMPAIGN_MANAGER_ROLE(), admin));
        assertTrue(rewards.hasRole(rewards.PAUSER_ROLE(), admin));
        assertFalse(rewards.hasRole(rewards.DEFAULT_ADMIN_ROLE(), deployer));
        assertFalse(rewards.hasRole(rewards.CAMPAIGN_MANAGER_ROLE(), deployer));
        assertFalse(rewards.hasRole(rewards.PAUSER_ROLE(), deployer));

        // Campaign is fully funded and claimable.
        assertEq(rewards.remaining(1), 350 ether);
        vm.prank(bob);
        rewards.claim(1, 250 ether, Merkle.proof(l, 1));
        assertEq(TestRewardToken(r.token).balanceOf(bob), 250 ether);
    }

    function test_refusesMainnet() public {
        vm.chainId(4663);
        _env(bytes32(uint256(1)), 1);
        SetupTestnetRewards s = new SetupTestnetRewards();
        vm.expectRevert("testnet only: InWIFRewards is unaudited");
        s.run();
    }

    function test_tokenRefusesMainnet() public {
        vm.chainId(4663);
        vm.expectRevert(TestRewardToken.MainnetNotAllowed.selector);
        new TestRewardToken(1);
    }
}
