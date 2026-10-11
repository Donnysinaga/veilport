/**
 * VEILPORT Client-Side Proving Module
 * Generates genuine Groth16 zero-knowledge proofs using snarkjs in the browser / client environment.
 * Ensures zero leakage of private secrets to any remote API or telemetry.
 */

import { encodeAbiParameters, parseAbiParameters } from "viem";

export interface ProverInput {
  root: string;
  nullifierHash: string;
  recipient: string;
  relayer: string;
  fee: string;
  nullifierSecret: string;
  secret: string;
  pathElements: string[];
  pathIndices: number[];
}

export interface ProverResult {
  proof: any;
  publicSignals: string[];
  proofBytes: `0x${string}`;
}

export async function generateWithdrawProof(
  input: ProverInput,
  wasmPath = "/circuits/withdraw.wasm",
  zkeyPath = "/circuits/withdraw_final.zkey"
): Promise<ProverResult> {
  // Dynamically load snarkjs to ensure compatibility with client bundle
  const snarkjs = await import("snarkjs");

  const SNARK_SCALAR_FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

  // Validate addresses and inputs before witness calculation
  if (!input.recipient || input.recipient === "0x0000000000000000000000000000000000000000") {
    throw new Error("Recipient address cannot be empty or zero address.");
  }
  if (!input.relayer) {
    throw new Error("Relayer address cannot be empty.");
  }

  const nullifierSecretBn = BigInt(input.nullifierSecret);
  const secretBn = BigInt(input.secret);
  if (nullifierSecretBn <= 0n || nullifierSecretBn >= SNARK_SCALAR_FIELD) {
    throw new Error("Nullifier secret must be a non-zero element within BN254 scalar field.");
  }
  if (secretBn <= 0n || secretBn >= SNARK_SCALAR_FIELD) {
    throw new Error("Note secret must be a non-zero element within BN254 scalar field.");
  }

  if (!input.pathElements || input.pathElements.length !== 20) {
    throw new Error("Merkle pathElements must have exactly 20 levels for depth-20 tree.");
  }
  if (!input.pathIndices || input.pathIndices.length !== 20) {
    throw new Error("Merkle pathIndices must have exactly 20 selectors.");
  }
  for (let i = 0; i < 20; i++) {
    if (input.pathIndices[i] !== 0 && input.pathIndices[i] !== 1) {
      throw new Error(`Invalid path index selector at level ${i}: must be 0 or 1.`);
    }
  }

  const circuitInput = {
    root: BigInt(input.root).toString(),
    nullifierHash: BigInt(input.nullifierHash).toString(),
    recipient: BigInt(input.recipient).toString(),
    relayer: BigInt(input.relayer).toString(),
    fee: BigInt(input.fee).toString(),
    nullifierSecret: nullifierSecretBn.toString(),
    secret: secretBn.toString(),
    pathElements: input.pathElements.map((el) => BigInt(el).toString()),
    pathIndices: input.pathIndices,
  };

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    circuitInput,
    wasmPath,
    zkeyPath
  );

  // Format proof as ABI encoded bytes: (uint[2] a, uint[2][2] b, uint[2] c)
  const a: readonly [bigint, bigint] = [BigInt(proof.pi_a[0]), BigInt(proof.pi_a[1])];
  const b: readonly [readonly [bigint, bigint], readonly [bigint, bigint]] = [
    [BigInt(proof.pi_b[0][1]), BigInt(proof.pi_b[0][0])],
    [BigInt(proof.pi_b[1][1]), BigInt(proof.pi_b[1][0])],
  ];
  const c: readonly [bigint, bigint] = [BigInt(proof.pi_c[0]), BigInt(proof.pi_c[1])];

  const proofBytes = encodeAbiParameters(
    parseAbiParameters("uint256[2], uint256[2][2], uint256[2]"),
    [a, b, c]
  );

  return {
    proof,
    publicSignals,
    proofBytes: proofBytes as `0x${string}`,
  };
}

export async function verifyProofLocally(
  publicSignals: string[],
  proof: any,
  vkeyUrl = "/circuits/verification_key.json"
): Promise<boolean> {
  const snarkjs = await import("snarkjs");
  const response = await fetch(vkeyUrl);
  if (!response.ok) {
    throw new Error(`Failed to load verification key: ${response.statusText}`);
  }
  const vKey = await response.json();
  return await snarkjs.groth16.verify(vKey, publicSignals, proof);
}
