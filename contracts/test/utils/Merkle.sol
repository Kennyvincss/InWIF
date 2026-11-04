// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @dev Minimal sorted-pair Merkle tree for tests (compatible with OZ MerkleProof).
library Merkle {
    function leaf(uint256 id, address account, uint256 amount) internal pure returns (bytes32) {
        return keccak256(bytes.concat(keccak256(abi.encode(id, account, amount))));
    }

    function hashPair(bytes32 a, bytes32 b) internal pure returns (bytes32) {
        return a < b ? keccak256(abi.encodePacked(a, b)) : keccak256(abi.encodePacked(b, a));
    }

    function root(bytes32[] memory leaves) internal pure returns (bytes32) {
        bytes32[] memory layer = leaves;
        while (layer.length > 1) {
            bytes32[] memory next = new bytes32[]((layer.length + 1) / 2);
            for (uint256 i = 0; i < layer.length; i += 2) {
                next[i / 2] = i + 1 < layer.length ? hashPair(layer[i], layer[i + 1]) : layer[i];
            }
            layer = next;
        }
        return layer[0];
    }

    function proof(bytes32[] memory leaves, uint256 index) internal pure returns (bytes32[] memory) {
        bytes32[] memory tmp = new bytes32[](32);
        uint256 n;
        bytes32[] memory layer = leaves;
        while (layer.length > 1) {
            uint256 sib = index ^ 1;
            if (sib < layer.length) tmp[n++] = layer[sib];
            bytes32[] memory next = new bytes32[]((layer.length + 1) / 2);
            for (uint256 i = 0; i < layer.length; i += 2) {
                next[i / 2] = i + 1 < layer.length ? hashPair(layer[i], layer[i + 1]) : layer[i];
            }
            layer = next;
            index /= 2;
        }
        bytes32[] memory out = new bytes32[](n);
        for (uint256 i = 0; i < n; i++) out[i] = tmp[i];
        return out;
    }
}
