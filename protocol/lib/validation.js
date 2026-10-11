"use strict";
/**
 * VEILPORT Withdrawal Safety & Validation Module (Protocol Node.js build)
 * Enforces cryptographic root checks, 3-state nullifier spent queries,
 * parameter validation, fee & payout conservation, and failsafe execution.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkNullifierStatus = checkNullifierStatus;
exports.validateWithdrawalParameters = validateWithdrawalParameters;
exports.validateWithdrawalPreparation = validateWithdrawalPreparation;

const { isAddress } = require("viem");

/**
 * Checks on-chain nullifier spent status with strict 3-state discrimination:
 * 1. CONFIRMED_UNSPENT (safe to proceed)
 * 2. CONFIRMED_SPENT (double-spend attempt, reject)
 * 3. UNKNOWN_RPC_ERROR (network/RPC failure, withdrawal MUST be blocked)
 */
async function checkNullifierStatus(publicClient, poolAddress, nullifierHash) {
    if (!publicClient || !poolAddress) {
        return {
            status: "UNKNOWN_RPC_ERROR",
            isSpent: false,
            canProceed: false,
            errorMessage: "No active RPC client or pool address provided.",
        };
    }
    try {
        const isSpent = await publicClient.readContract({
            address: poolAddress,
            abi: [
                {
                    inputs: [{ internalType: "bytes32", name: "", type: "bytes32" }],
                    name: "nullifierSpent",
                    outputs: [{ internalType: "bool", name: "", type: "bool" }],
                    stateMutability: "view",
                    type: "function",
                },
            ],
            functionName: "nullifierSpent",
            args: [nullifierHash],
        });
        if (isSpent === true) {
            return {
                status: "CONFIRMED_SPENT",
                isSpent: true,
                canProceed: false,
                errorMessage: "This private note has already been spent/unshielded.",
            };
        }
        return {
            status: "CONFIRMED_UNSPENT",
            isSpent: false,
            canProceed: true,
        };
    }
    catch (err) {
        return {
            status: "UNKNOWN_RPC_ERROR",
            isSpent: false,
            canProceed: false,
            errorMessage: `Failed to query nullifier status on-chain: ${err.message || "RPC connection error"}. Withdrawal blocked for safety.`,
        };
    }
}

/**
 * Validates withdrawal parameters and enforces fee and payout conservation.
 */
function validateWithdrawalParameters(params) {
    const { recipient, relayer, fee, denomination } = params;

    if (!recipient || !isAddress(recipient)) {
        return {
            valid: false,
            payout: 0n,
            fee: 0n,
            recipient: "0x0000000000000000000000000000000000000000",
            relayer: "0x0000000000000000000000000000000000000000",
            error: "Recipient must be a valid EVM address.",
        };
    }
    if (recipient.toLowerCase() === "0x0000000000000000000000000000000000000000") {
        return {
            valid: false,
            payout: 0n,
            fee: 0n,
            recipient: recipient,
            relayer: "0x0000000000000000000000000000000000000000",
            error: "Recipient cannot be the zero address (0x0).",
        };
    }
    if (!relayer || !isAddress(relayer)) {
        return {
            valid: false,
            payout: 0n,
            fee: 0n,
            recipient: recipient,
            relayer: "0x0000000000000000000000000000000000000000",
            error: "Relayer must be a valid EVM address.",
        };
    }
    if (denomination <= 0n) {
        return {
            valid: false,
            payout: 0n,
            fee: 0n,
            recipient: recipient,
            relayer: relayer,
            error: "Pool denomination must be greater than zero.",
        };
    }
    if (fee < 0n) {
        return {
            valid: false,
            payout: 0n,
            fee: 0n,
            recipient: recipient,
            relayer: relayer,
            error: "Relayer fee cannot be negative.",
        };
    }
    if (fee > denomination) {
        return {
            valid: false,
            payout: 0n,
            fee,
            recipient: recipient,
            relayer: relayer,
            error: `Relayer fee (${fee}) cannot exceed pool denomination (${denomination}).`,
        };
    }

    const payout = denomination - fee;
    if (payout + fee !== denomination) {
        return {
            valid: false,
            payout: 0n,
            fee: 0n,
            recipient: recipient,
            relayer: relayer,
            error: "Conservation invariant violation: payout + fee does not equal denomination.",
        };
    }

    return {
        valid: true,
        payout,
        fee,
        recipient: recipient,
        relayer: relayer,
    };
}

/**
 * Validates the complete withdrawal preparation before proof generation.
 */
async function validateWithdrawalPreparation(params) {
    const { note, expectedAsset, expectedChainId, indexer, poolAddress, publicClient } = params;

    if (note.asset !== expectedAsset) {
        return {
            valid: false,
            error: `Note asset (${note.asset}) does not match selected pool asset (${expectedAsset}).`,
        };
    }
    if (note.chainId !== expectedChainId) {
        return {
            valid: false,
            error: `Note chain ID (${note.chainId}) does not match active chain (${expectedChainId}). Cross-chain unshielding is prohibited.`,
        };
    }

    let path;
    try {
        path = indexer.getMerklePath(note.commitment);
    }
    catch (err) {
        return {
            valid: false,
            error: `Deposit commitment not found in indexed pool history: ${err.message}`,
        };
    }

    const isPathValid = indexer.verifyMerklePath(note.commitment, path);
    if (!isPathValid) {
        return {
            valid: false,
            error: "Local Merkle path recomputation failed. Recomputed root does not match indexer root.",
        };
    }

    if (publicClient && poolAddress) {
        try {
            const isKnown = await publicClient.readContract({
                address: poolAddress,
                abi: [
                    {
                        inputs: [{ internalType: "bytes32", name: "_root", type: "bytes32" }],
                        name: "isKnownRoot",
                        outputs: [{ internalType: "bool", name: "", type: "bool" }],
                        stateMutability: "view",
                        type: "function",
                    },
                ],
                functionName: "isKnownRoot",
                args: [path.root],
            });
            if (!isKnown) {
                return {
                    valid: false,
                    error: `Merkle root ${path.root} is not recognized by on-chain pool contract historical roots.`,
                };
            }
        }
        catch (err) {
            return {
                valid: false,
                error: `Failed to verify Merkle root on-chain: ${err.message}`,
            };
        }
    }

    return {
        valid: true,
        path,
        root: path.root,
        nullifierHash: note.nullifierHash,
    };
}
