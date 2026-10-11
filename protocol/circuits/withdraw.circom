pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/bitify.circom";

/**
 * @title DualMux
 * @notice Routes two inputs based on a 1-bit selector signal.
 *         If s == 0: out[0] = in[0], out[1] = in[1]
 *         If s == 1: out[0] = in[1], out[1] = in[0]
 */
template DualMux() {
    signal input in[2];
    signal input s;
    signal output out[2];

    s * (1 - s) === 0;
    out[0] <== (in[1] - in[0]) * s + in[0];
    out[1] <== (in[0] - in[1]) * s + in[1];
}

/**
 * @title MerkleTreeInclusionChecker
 * @notice Verifies membership of a leaf in an incremental Merkle tree of depth `levels`.
 */
template MerkleTreeInclusionChecker(levels) {
    signal input leaf;
    signal input root;
    signal input pathElements[levels];
    signal input pathIndices[levels];

    component hashers[levels];
    component muxes[levels];

    signal currentHash[levels + 1];
    currentHash[0] <== leaf;

    for (var i = 0; i < levels; i++) {
        muxes[i] = DualMux();
        muxes[i].in[0] <== currentHash[i];
        muxes[i].in[1] <== pathElements[i];
        muxes[i].s <== pathIndices[i];

        hashers[i] = Poseidon(2);
        hashers[i].inputs[0] <== muxes[i].out[0];
        hashers[i].inputs[1] <== muxes[i].out[1];

        currentHash[i + 1] <== hashers[i].out;
    }

    // Constraint: computed root must match public root
    root === currentHash[levels];
}

/**
 * @title Withdraw
 * @notice Core zero-knowledge circuit for VEILPORT shielded withdrawals.
 * @dev Parameterized with depth = 20 (accommodating 1,048,576 commitments).
 *
 * Public signals array (in exact order expected by Solidity verifier):
 * [0] root
 * [1] nullifierHash
 * [2] recipient
 * [3] relayer
 * [4] fee
 */
template Withdraw(levels) {
    // ------------------------------------------------------------------------
    // Public Signals
    // ------------------------------------------------------------------------
    signal input root;
    signal input nullifierHash;
    signal input recipient; // Receiver of unshielded funds (address as field element)
    signal input relayer;   // Relayer fee recipient (address as field element)
    signal input fee;       // Authorized relayer fee (in pool denomination units)

    // ------------------------------------------------------------------------
    // Private Signals (Witness)
    // ------------------------------------------------------------------------
    signal input nullifierSecret;
    signal input secret;
    signal input pathElements[levels];
    signal input pathIndices[levels];

    // ------------------------------------------------------------------------
    // 1. Commitment & Nullifier Integrity Checks
    // ------------------------------------------------------------------------
    // Leaf Commitment: C = Poseidon(nullifierSecret, secret)
    component commitmentHasher = Poseidon(2);
    commitmentHasher.inputs[0] <== nullifierSecret;
    commitmentHasher.inputs[1] <== secret;

    // Nullifier Hash: N = Poseidon(nullifierSecret)
    component nullifierHasher = Poseidon(1);
    nullifierHasher.inputs[0] <== nullifierSecret;
    nullifierHash === nullifierHasher.out;

    // ------------------------------------------------------------------------
    // 2. Merkle Tree Membership Proof
    // ------------------------------------------------------------------------
    component treeChecker = MerkleTreeInclusionChecker(levels);
    treeChecker.leaf <== commitmentHasher.out;
    treeChecker.root <== root;
    for (var i = 0; i < levels; i++) {
        treeChecker.pathElements[i] <== pathElements[i];
        treeChecker.pathIndices[i] <== pathIndices[i];
    }

    // ------------------------------------------------------------------------
    // 3. Anti-Malleability & Public Signal Constraint Binding
    // ------------------------------------------------------------------------
    // Prevent parameter tampering and front-running by strictly binding
    // recipient, relayer, and fee as independent, non-trivial quadratic constraints.
    signal recipientSquare;
    recipientSquare <== recipient * recipient;

    signal relayerSquare;
    relayerSquare <== relayer * relayer;

    signal feeSquare;
    feeSquare <== fee * fee;
}

component main {public [root, nullifierHash, recipient, relayer, fee]} = Withdraw(20);
