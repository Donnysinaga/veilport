// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IVerifier
 * @notice Interface for the zero-knowledge Groth16 proof verifier.
 * @dev Public inputs ordering must strictly match the Circom circuit public signals.
 */
interface IVerifier {
    /**
     * @notice Verifies a Groth16 zero-knowledge withdrawal proof.
     * @param proof The serialized Groth16 proof [a_x, a_y, b_x1, b_x2, b_y1, b_y2, c_x, c_y].
     * @param publicInputs The public signals array:
     *        [0]: Merkle root (uint256)
     *        [1]: Nullifier hash (uint256)
     *        [2]: Recipient address cast to uint256
     *        [3]: Relayer address cast to uint256
     *        [4]: Relayer fee (uint256)
     * @return True if the cryptographic proof is valid, false otherwise.
     */
    function verifyProof(
        bytes calldata proof,
        uint256[5] calldata publicInputs
    ) external view returns (bool);
}
