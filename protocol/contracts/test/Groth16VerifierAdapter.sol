// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/IVerifier.sol";
import "./Groth16Verifier.sol";

/**
 * @title Groth16VerifierAdapter
 * @notice Adapts snarkjs generated Groth16Verifier to the IVerifier interface expected by VeilportBasePool.
 * @dev Decodes bytes proof into uint[2] _pA, uint[2][2] _pB, uint[2] _pC.
 */
contract Groth16VerifierAdapter is IVerifier {
    Groth16Verifier public immutable underlyingVerifier;

    constructor() {
        underlyingVerifier = new Groth16Verifier();
    }

    /**
     * @notice Verifies a Groth16 proof using the underlying auto-generated verifier.
     * @param proof ABI encoded tuple: (uint256[2] a, uint256[2][2] b, uint256[2] c)
     * @param publicInputs [root, nullifierHash, recipient, relayer, fee]
     */
    function verifyProof(
        bytes calldata proof,
        uint256[5] calldata publicInputs
    ) external view override returns (bool) {
        if (proof.length < 256) return false;

        (uint256[2] memory a, uint256[2][2] memory b, uint256[2] memory c) = abi.decode(
            proof,
            (uint256[2], uint256[2][2], uint256[2])
        );

        return underlyingVerifier.verifyProof(a, b, c, publicInputs);
    }
}
