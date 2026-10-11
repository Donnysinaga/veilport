// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IPoseidon
 * @notice Standard interface for on-chain 2-to-1 Poseidon hashing over BN254.
 */
interface IPoseidon {
    function poseidon(uint256[2] calldata input) external pure returns (uint256);
}
