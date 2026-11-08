// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
/// Minimal test tokens for the InWIF token check: one with a 5% transfer tax, one that blocks
/// transfers from everyone except the owner (a "honeypot"). Test-only, never deployed to mainnet.
contract TestToken {
    string public name; string public symbol; uint8 public constant decimals = 18; uint256 public totalSupply;
    mapping(address => uint256) public balanceOf; mapping(address => mapping(address => uint256)) public allowance;
    address public owner; uint256 public taxBps; bool public honeypot;
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    constructor(string memory n, string memory s, uint256 tax, bool hp, address holder) {
        name = n; symbol = s; taxBps = tax; honeypot = hp; owner = msg.sender;
        totalSupply = 1_000_000 ether; balanceOf[holder] = totalSupply / 2; balanceOf[msg.sender] = totalSupply / 2;
        emit Transfer(address(0), holder, totalSupply / 2); emit Transfer(address(0), msg.sender, totalSupply / 2);
    }
    function approve(address s, uint256 v) external returns (bool) { allowance[msg.sender][s] = v; emit Approval(msg.sender, s, v); return true; }
    function transfer(address to, uint256 v) external returns (bool) { _move(msg.sender, to, v); return true; }
    function transferFrom(address f, address to, uint256 v) external returns (bool) { allowance[f][msg.sender] -= v; _move(f, to, v); return true; }
    function _move(address f, address to, uint256 v) internal {
        require(!honeypot || f == owner, "trading disabled");
        balanceOf[f] -= v; uint256 fee = v * taxBps / 10_000; balanceOf[to] += v - fee; balanceOf[owner] += fee;
        emit Transfer(f, to, v - fee);
    }
}
