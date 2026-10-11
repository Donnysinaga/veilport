/**
 * VEILPORT Withdrawal Safety & Validation Module
 * Enforces cryptographic root checks, 3-state nullifier spent queries,
 * parameter validation, fee & payout conservation, and failsafe execution.
 */

import { isAddress } from "viem";
import { MerkleTreeIndexer, MerklePathResult } from "./indexer";
import { VeilportNote } from "./note";

export type NullifierStatus = "CONFIRMED_UNSPENT" | "CONFIRMED_SPENT" | "UNKNOWN_RPC_ERROR";

export interface NullifierCheckResult {
  status: NullifierStatus;
  isSpent: boolean;
  canProceed: boolean;
  errorMessage?: string;
}

export interface WithdrawalValidationResult {
  valid: boolean;
  payout: bigint;
  fee: bigint;
  recipient: `0x${string}`;
  relayer: `0x${string}`;
  error?: string;
}

export interface WithdrawalPreparationResult {
  valid: boolean;
  path?: MerklePathResult;
  root?: `0x${string}`;
  nullifierHash?: `0x${string}`;
  error?: string;
}

/**
 * Checks on-chain nullifier spent status with strict 3-state discrimination:
 * 1. CONFIRMED_UNSPENT (safe to proceed)
 * 2. CONFIRMED_SPENT (double-spend attempt, reject)
 * 3. UNKNOWN_RPC_ERROR (network/RPC failure, withdrawal MUST be blocked)
 */
export async function checkNullifierStatus(
  publicClient: any,
  poolAddress: `0x${string}`,
  nullifierHash: `0x${string}`
): Promise<NullifierCheckResult> {
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
  } catch (err: any) {
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
 * Matches VeilportBasePool.sol requirements.
 */
export function validateWithdrawalParameters(params: {
  recipient: string;
  relayer: string;
  fee: bigint;
  denomination: bigint;
  asset: "ETH" | "USDG";
}): WithdrawalValidationResult {
  const { recipient, relayer, fee, denomination } = params;

  // 1. Recipient address validation
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
      recipient: recipient as `0x${string}`,
      relayer: "0x0000000000000000000000000000000000000000",
      error: "Recipient cannot be the zero address (0x0).",
    };
  }

  // 2. Relayer address validation
  if (!relayer || !isAddress(relayer)) {
    return {
      valid: false,
      payout: 0n,
      fee: 0n,
      recipient: recipient as `0x${string}`,
      relayer: "0x0000000000000000000000000000000000000000",
      error: "Relayer must be a valid EVM address.",
    };
  }

  // 3. Denomination checks
  if (denomination <= 0n) {
    return {
      valid: false,
      payout: 0n,
      fee: 0n,
      recipient: recipient as `0x${string}`,
      relayer: relayer as `0x${string}`,
      error: "Pool denomination must be greater than zero.",
    };
  }

  // 4. Fee & Payout Conservation
  if (fee < 0n) {
    return {
      valid: false,
      payout: 0n,
      fee: 0n,
      recipient: recipient as `0x${string}`,
      relayer: relayer as `0x${string}`,
      error: "Relayer fee cannot be negative.",
    };
  }

  if (fee > denomination) {
    return {
      valid: false,
      payout: 0n,
      fee,
      recipient: recipient as `0x${string}`,
      relayer: relayer as `0x${string}`,
      error: `Relayer fee (${fee}) cannot exceed pool denomination (${denomination}).`,
    };
  }

  const payout = denomination - fee;
  if (payout + fee !== denomination) {
    return {
      valid: false,
      payout: 0n,
      fee: 0n,
      recipient: recipient as `0x${string}`,
      relayer: relayer as `0x${string}`,
      error: "Conservation invariant violation: payout + fee does not equal denomination.",
    };
  }

  return {
    valid: true,
    payout,
    fee,
    recipient: recipient as `0x${string}`,
    relayer: relayer as `0x${string}`,
  };
}

/**
 * Validates the complete withdrawal preparation before proof generation:
 * - Checks commitment existence in pool indexer.
 * - Extracts Merkle path.
 * - Locally verifies path produces the exact indexed root.
 * - Confirms root is accepted by on-chain pool contract if client is connected.
 */
export async function validateWithdrawalPreparation(params: {
  note: VeilportNote;
  expectedAsset: "ETH" | "USDG";
  expectedChainId: number;
  indexer: MerkleTreeIndexer;
  poolAddress?: `0x${string}`;
  publicClient?: any;
}): Promise<WithdrawalPreparationResult> {
  const { note, expectedAsset, expectedChainId, indexer, poolAddress, publicClient } = params;

  // 1. Metadata matches
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

  // 2. Commitment exists in indexer
  let path: MerklePathResult;
  try {
    path = indexer.getMerklePath(note.commitment as `0x${string}`);
  } catch (err: any) {
    return {
      valid: false,
      error: `Deposit commitment not found in indexed pool history: ${err.message}`,
    };
  }

  // 3. Local root recomputation & path verification
  const isPathValid = indexer.verifyMerklePath(note.commitment as `0x${string}`, path);
  if (!isPathValid) {
    return {
      valid: false,
      error: "Local Merkle path recomputation failed. Recomputed root does not match indexer root.",
    };
  }

  // 4. On-chain root validation
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
    } catch (err: any) {
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
    nullifierHash: note.nullifierHash as `0x${string}`,
  };
}
