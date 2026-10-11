// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/IVerifier.sol";

/**
 * @title MockVerifier
 * @notice Test verifier that simulates Groth16 proof verification for unit and integration testing.
 */
contract MockVerifier is IVerifier {
    bool public shouldPass = true;
    bytes public requiredProof;

    function setShouldPass(bool _pass) external {
        shouldPass = _pass;
    }

    function setRequiredProof(bytes calldata _proof) external {
        requiredProof = _proof;
    }

    function verifyProof(
        bytes calldata proof,
        uint256[5] calldata publicInputs
    ) external view override returns (bool) {
        // Prevent compiler unused warnings
        publicInputs[0];

        if (requiredProof.length > 0) {
            bool matches = keccak256(proof) == keccak256(requiredProof);
            return matches && shouldPass;
        }

        return shouldPass;
    }
}
