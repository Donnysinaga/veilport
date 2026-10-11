# VEILPORT Groth16 Zero-Knowledge Trusted Setup Guide

## 1. Overview of Groth16 Trusted Setup

Groth16 is an asymmetric pairing-based zero-knowledge SNARK proof system over the BN254 (alt_bn128) elliptic curve. It achieves the smallest proof size (128 bytes: two $G_1$ points and one $G_2$ point) and the lowest on-chain EVM verification cost ($\sim 230,000$ gas).

However, Groth16 requires a **two-phase trusted setup** ceremony to generate proving and verification keys:
1. **Phase 1 (Powers of Tau):** Universal and circuit-independent.
2. **Phase 2 (Circuit-Specific Ceremony):** Specific to `withdraw.circom` and its exact R1CS constraint matrix.

---

## 2. Key Lifecycle & Environment Classification

To maintain cryptographic integrity, keys are strictly categorized into three tiers:

| Tier | Purpose | Generation Procedure | Production Suitability |
| :--- | :--- | :--- | :--- |
| **Tier 1: Local Development Artifacts** | Unit testing & circuit syntax validation | Generated locally on developer hardware using dummy entropy (`snarkjs r1cs info`). | **UNSAFE FOR MAINNET.** Trapdoor toxic waste is held on a single local machine. |
| **Tier 2: Testnet Pre-Ceremony Keys** | Testnet deployment & integration testing (Chain 4663) | Generated using a public perpetual Powers of Tau beacon (e.g., Hermez/Polygon Phase 1) with local Phase 2 contribution. | **TESTNET ONLY.** Not secure for irreversible real funds. |
| **Tier 3: Multi-Party Ceremony (MPC) Production Keys** | Mainnet protocol deployment | Coordinated multi-party Phase 2 ceremony with $N > 30$ independent, reputable participants. Trapdoor toxic waste is destroyed if at least one participant acts honestly. | **PRODUCTION READY.** |

---

## 3. Trusted Setup Reproduction Pipeline

### Step 1: Circuit Compilation (Circom)
Compile the parameterized `withdraw.circom` circuit to generate R1CS constraints, WebAssembly witness calculator, and symbol files:
```bash
circom protocol/circuits/withdraw.circom --r1cs --wasm --sym -o protocol/build/
```

### Step 2: Phase 1 — Universal Powers of Tau
Download or verify the official perpetual Powers of Tau ceremony transcript for BN254 ($2^{14}$ constraints or larger):
```bash
# Example: Using public hermez powersOfTauBN254_timeline14
snarkjs powersoftau new bn128 14 pot14_0000.ptau -v
snarkjs powersoftau contribute pot14_0000.ptau pot14_0001.ptau --name="First Contribution" -v
snarkjs powersoftau prepare phase2 pot14_0001.ptau pot14_final.ptau -v
```

### Step 3: Phase 2 — Circuit-Specific Ceremony
Bind the circuit constraints to the ceremony:
```bash
# 1. Initialize Phase 2
snarkjs groth16 setup protocol/build/withdraw.r1cs pot14_final.ptau protocol/build/withdraw_0000.zkey

# 2. Multi-Party Contributions
snarkjs zkey contribute protocol/build/withdraw_0000.zkey protocol/build/withdraw_0001.zkey --name="Participant 1" -v
# [Subsequent contributions 2..N]

# 3. Apply Random Beacon (e.g. Drand or Bitcoin Block Hash)
snarkjs zkey beacon protocol/build/withdraw_0001.zkey protocol/build/withdraw_final.zkey 0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f 10 -n="Final Beacon"

# 4. Verify Final ZKey
snarkjs zkey verify protocol/build/withdraw.r1cs pot14_final.ptau protocol/build/withdraw_final.zkey
```

### Step 4: Exporting Verification Key & Solidity Verifier
Export the mathematical verification key and generate the standalone Solidity verifier:
```bash
# Export JSON verification key for off-chain / client-side verification
snarkjs zkey export verification_key protocol/build/withdraw_final.zkey protocol/build/verification_key.json

# Export on-chain Groth16Verifier.sol compatible with EVM
snarkjs zkey export solidityverifier protocol/build/withdraw_final.zkey protocol/contracts/Groth16Verifier.sol
```

---

## 4. Toxic Waste Destruction & Cryptographic Guarantees

In Groth16, if the toxic waste scalars $(\alpha, \beta, \gamma, \delta, x)$ are known to an adversary, they can forge arbitrary proofs and drain the pool without possessing valid deposit notes.

1. **Multi-Party Computation (MPC):** As long as **at least one** participant in the Phase 2 ceremony securely deletes their contribution entropy, the toxic waste cannot be reconstructed.
2. **Air-Gapped Devices:** Production ceremony contributors must run ceremony scripts on ephemeral, air-gapped hardware with verifiable hardware RNGs.
3. **Attestation Log:** All contribution signatures and public hashes must be published openly for public cryptographic verification before contracts are deployed.
