// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {InWIFRewards} from "../src/InWIFRewards.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {Merkle} from "./utils/Merkle.sol";

contract RewardsHandler is Test {
    InWIFRewards public rewards;
    MockERC20 public token;
    address public admin;
    address[] public actors;
    uint256[] public amounts;
    uint256[] public ids;
    mapping(uint256 => bytes32[]) internal leavesOf;
    uint256 public totalClaimed;
    uint256 public totalFunded;
    uint256 public totalWithdrawn;

    constructor(InWIFRewards r, MockERC20 t, address a) {
        rewards = r;
        token = t;
        admin = a;
        for (uint256 i = 0; i < 5; i++) {
            actors.push(address(uint160(0x1000 + i)));
            amounts.push((i + 1) * 1e18);
        }
    }

    function create() external {
        uint256 next = rewards.campaignCount() + 1;
        bytes32[] storage l = leavesOf[next];
        for (uint256 i = 0; i < actors.length; i++) {
            l.push(Merkle.leaf(next, actors[i], amounts[i]));
        }
        vm.prank(admin);
        uint256 id = rewards.createCampaign(IERC20(address(token)), Merkle.root(l), uint64(block.timestamp + 7 days), "");
        ids.push(id);
    }

    function fund(uint256 seed, uint256 amount) external {
        if (ids.length == 0) return;
        uint256 id = ids[seed % ids.length];
        amount = bound(amount, 1, 20e18);
        token.mint(address(this), amount);
        token.approve(address(rewards), amount);
        try rewards.fund(id, amount) {
            totalFunded += amount;
        } catch {}
    }

    function claim(uint256 seed, uint256 actorSeed) external {
        if (ids.length == 0) return;
        uint256 id = ids[seed % ids.length];
        uint256 i = actorSeed % actors.length;
        bytes32[] memory p = Merkle.proof(leavesOf[id], i);
        vm.prank(actors[i]);
        try rewards.claim(id, amounts[i], p) {
            totalClaimed += amounts[i];
        } catch {}
    }

    function warp(uint256 secs) external {
        vm.warp(block.timestamp + bound(secs, 0, 3 days));
    }

    function withdraw(uint256 seed) external {
        if (ids.length == 0) return;
        uint256 id = ids[seed % ids.length];
        uint256 rem = rewards.remaining(id);
        vm.prank(admin);
        try rewards.withdrawUnclaimed(id, admin) {
            totalWithdrawn += rem;
        } catch {}
    }

    function idCount() external view returns (uint256) {
        return ids.length;
    }
}

contract InWIFRewardsInvariantTest is Test {
    InWIFRewards rewards;
    MockERC20 token;
    RewardsHandler handler;
    address admin = makeAddr("admin");

    function setUp() public {
        rewards = new InWIFRewards(admin);
        token = new MockERC20("World is Flat", "WIF");
        handler = new RewardsHandler(rewards, token, admin);
        targetContract(address(handler));
    }

    /// The contract always holds at least what it owes.
    function invariant_solvent() public view {
        assertGe(token.balanceOf(address(rewards)), rewards.liabilities(IERC20(address(token))));
    }

    /// Conservation: funded = claimed + withdrawn + outstanding.
    function invariant_conservation() public view {
        assertEq(
            handler.totalFunded(),
            handler.totalClaimed() + handler.totalWithdrawn() + rewards.liabilities(IERC20(address(token)))
        );
    }

    /// No campaign ever pays out more than was deposited for it.
    function invariant_claimedNeverExceedsFunded() public view {
        uint256 n = rewards.campaignCount();
        for (uint256 id = 1; id <= n; id++) {
            (,, uint256 funded, uint256 claimed,,,) = rewards.campaigns(id);
            assertLe(claimed, funded);
        }
    }
}
