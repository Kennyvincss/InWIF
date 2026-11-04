// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {DeployRewards} from "../script/DeployRewards.s.sol";

contract DeployRewardsTest is Test {
    function test_refusesMainnet() public {
        DeployRewards s = new DeployRewards();
        vm.chainId(4663);
        vm.expectRevert("InWIFRewards is unaudited: mainnet deployment is disabled");
        s.run(address(1));
    }

    function test_deploysOnTestnet() public {
        DeployRewards s = new DeployRewards();
        vm.chainId(46630);
        assertTrue(address(s.run(address(1))) != address(0));
    }
}
