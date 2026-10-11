// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interfaces/IPoseidon.sol";

/**
 * @title MerkleTreeWithHistory
 * @notice Fixed-depth incremental Merkle tree with a ring buffer of historical roots.
 * @dev Tree depth is 20, accommodating up to 2^20 (1,048,576) deposits.
 */
abstract contract MerkleTreeWithHistory {
    uint32 public constant TREE_DEPTH = 20;
    uint32 public constant ROOT_HISTORY_SIZE = 30;
    uint256 public constant FIELD_SIZE = 21888242871839275222246405745257275088548364400416034343698204186575808495617;

    IPoseidon public immutable hasher;

    uint32 public nextIndex = 0;
    uint32 public currentRootIndex = 0;

    // Ring buffer storing the latest 30 roots
    bytes32[ROOT_HISTORY_SIZE] public roots;

    // Filled subtrees at each level (depth 20)
    bytes32[TREE_DEPTH] public filledSubtrees;

    // Zero values for empty nodes at each level
    bytes32[TREE_DEPTH] public zeros;

    event LeafInserted(bytes32 indexed leaf, uint32 indexed leafIndex, bytes32 newRoot);

    error LeafMustBeFieldElement();
    error MerkleTreeFull();

    constructor(address _hasher) {
        require(_hasher != address(0), "Invalid hasher address");
        hasher = IPoseidon(_hasher);

        // Precompute empty tree zeros using Poseidon
        // Initial zero: keccak256("veilport") % FIELD_SIZE
        bytes32 currentZero = bytes32(uint256(keccak256("veilport")) % FIELD_SIZE);
        zeros[0] = currentZero;
        filledSubtrees[0] = currentZero;

        for (uint32 i = 1; i < TREE_DEPTH; i++) {
            currentZero = _hashPair(currentZero, currentZero);
            zeros[i] = currentZero;
            filledSubtrees[i] = currentZero;
        }

        // Initial root is the top zero hash
        bytes32 initialRoot = _hashPair(currentZero, currentZero);
        roots[0] = initialRoot;
    }

    /**
     * @dev Hash two 32-byte values using the external Poseidon hasher.
     */
    function _hashPair(bytes32 left, bytes32 right) internal view returns (bytes32) {
        uint256[2] memory input = [uint256(left), uint256(right)];
        return bytes32(hasher.poseidon(input));
    }

    /**
     * @notice Inserts a new commitment leaf into the incremental Merkle tree.
     * @param leaf The 32-byte commitment hash.
     * @return index The index position of the inserted leaf.
     */
    function _insert(bytes32 leaf) internal returns (uint32 index) {
        if (uint256(leaf) >= FIELD_SIZE) revert LeafMustBeFieldElement();
        uint32 currentIndex = nextIndex;
        if (currentIndex >= 2 ** TREE_DEPTH) revert MerkleTreeFull();

        bytes32 currentLevelHash = leaf;
        bytes32 left;
        bytes32 right;

        for (uint32 i = 0; i < TREE_DEPTH; i++) {
            if (currentIndex % 2 == 0) {
                left = currentLevelHash;
                right = zeros[i];
                filledSubtrees[i] = currentLevelHash;
            } else {
                left = filledSubtrees[i];
                right = currentLevelHash;
            }
            currentLevelHash = _hashPair(left, right);
            currentIndex /= 2;
        }

        uint32 newRootIndex = (currentRootIndex + 1) % ROOT_HISTORY_SIZE;
        currentRootIndex = newRootIndex;
        roots[newRootIndex] = currentLevelHash;

        index = nextIndex;
        nextIndex = index + 1;

        emit LeafInserted(leaf, index, currentLevelHash);
    }

    /**
     * @notice Checks whether a given root is in the active historical roots ring buffer.
     * @param _root The Merkle root to check.
     */
    function isKnownRoot(bytes32 _root) public view returns (bool) {
        if (_root == bytes32(0)) return false;
        uint32 i = currentRootIndex;
        do {
            if (_root == roots[i]) return true;
            if (i == 0) i = ROOT_HISTORY_SIZE;
            i--;
        } while (i != currentRootIndex);
        return false;
    }

    /**
     * @notice Returns the latest computed Merkle root.
     */
    function getLastRoot() public view returns (bytes32) {
        return roots[currentRootIndex];
    }
}
