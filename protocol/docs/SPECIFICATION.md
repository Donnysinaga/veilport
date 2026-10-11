# VEILPORT Privacy Protocol — Core Specification (v1.0)

## 1. Introduction & Mission

VEILPORT is a non-custodial privacy protocol providing on-chain financial privacy for digital assets on EVM-compatible networks. This document specifies the cryptographic architecture, smart contract mechanics, zero-knowledge circuit constraints, threat model, and security boundaries for **Phase 1** of the VEILPORT protocol.

---

## 2. Threat Model & Privacy Guarantees

### 2.1 Threat Model
* **The Public Observer / Chain Analyst:** Has comprehensive visibility into:
  - All on-chain transactions, event logs, gas fees, and transaction timestamps.
  - Public block explorer data and transaction graphs.
  - Mempool broadcasts and pending transactions.
* **Malicious Relayers:** May attempt to inspect, re-order, censor, or front-run withdrawal transactions, or substitute recipient addresses.
* **Adversarial Depositors / Withdrawees:** May attempt double-spending, replay attacks, forged proofs, or draining contract liquidity.

### 2.2 What Remains Publicly Observable
1. The **deposit transaction origin** (`msg.sender`), deposited asset (ETH or USDG), pool denomination, and exact block timestamp.
2. The **commitment hash ($C$)** and its insertion index into the on-chain Merkle tree.
3. The **withdrawal transaction**, including:
   - The **nullifier hash ($N$)**.
   - The **recipient address ($A$)** receiving the unshielded funds.
   - The **relayer address ($R$)** and the fee amount ($F$).
   - The targeted Merkle root ($Root$).

### 2.3 What Remains Strictly Private (Zero-Knowledge)
1. **The Link Between Deposit and Withdrawal:** No computationally bounded adversary can link a specific withdrawal to its originating deposit.
2. **The Depositor's Secret ($k$) and Nullifier Secret ($\rho$):** Never revealed on-chain or transmitted off-chain.
3. **The Leaf Position in the Merkle Tree:** Zero-knowledge proof proves membership in the tree without revealing the leaf index or Merkle sibling path.

---

## 3. Supported Assets & Denomination Policy

### 3.1 Why Fixed Denominations Are Mandatory
Arbitrary-amount shielded pools allow adversaries to correlate transactions via unique balances (e.g., depositing and later withdrawing $1,482.39 USDG uniquely identifies the party). Therefore, VEILPORT Phase 1 enforces **discrete fixed denominations per pool**:

* **Native ETH Pools:**
  - Tier 1: `0.1 ETH` ($10^{17}$ wei)
  - Tier 2: `1.0 ETH` ($10^{18}$ wei)
  - Tier 3: `10.0 ETH` ($10^{19}$ wei)
* **USDG (ERC-20, 6 Decimals, `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168`):**
  - Tier 1: `100 USDG` ($100 \times 10^6 = 10^8$ units)
  - Tier 2: `1,000 USDG` ($10^9$ units)
  - Tier 3: `10,000 USDG` ($10^{10}$ units)

### 3.2 ERC-20 Safe Transfer Semantics
The contract uses defensive transfer routines (`SafeERC20`) to safely interact with standard and non-standard ERC-20 implementations, verifying returned boolean flags and handling revert conditions cleanly.

---

## 4. Cryptographic Primitives & Field Bounds

### 4.1 Elliptic Curve & Scalar Field
* **Curve:** BN254 (alt_bn128), supported by EVM precompiles `0x06` (`ecAdd`), `0x07` (`ecMul`), and `0x08` (`ecPairing`).
* **Scalar Field Modulus ($r$):**
  $$r = 21888242871839275222246405745257275088548364400416034343698204186575808495617$$
* All secrets, commitments, nullifiers, and Merkle nodes are elements of $\mathbb{F}_r$. Any value passed from Solidity into Circom must satisfy $x < r$.

### 4.2 Hash Function
* **Primitive:** **Poseidon Hash** parameterized for $\mathbb{F}_r$.
* **PoseidonT3 (2 inputs):** Used for 2-to-1 binary Merkle tree node hashing and 2-input commitment generation.
* **PoseidonT2 (1 input):** Used for domain-separated nullifier derivation.

### 4.3 Commitment & Nullifier Derivation
1. Client generates two random 256-bit field elements using a cryptographically secure random number generator:
   $$\rho \in \mathbb{F}_r^* \quad (\text{nullifier secret})$$
   $$k \in \mathbb{F}_r^* \quad (\text{blinding secret})$$
2. **Commitment ($C$):**
   $$C = \text{Poseidon}_2(\rho, k)$$
3. **Nullifier Hash ($N$):**
   $$N = \text{Poseidon}_1(\rho)$$
4. **Domain Separation & Collision Resistance:**
   Because $\text{Poseidon}_1(\rho)$ uses 1-input capacity ($T=2$), its state matrix is structurally orthogonal to $\text{Poseidon}_2(\rho, k)$ ($T=3$), preventing any mathematical collision between commitments and nullifiers.

---

## 5. On-Chain Merkle Tree & Root History

### 5.1 Tree Geometry
* **Depth ($H$):** $20$ levels.
* **Capacity:** $2^{20} = 1,048,576$ deposits per pool.
* **Zero Values:** Precomputed constants $Z_0, Z_1, \dots, Z_{19}$ where $Z_0 = \text{keccak256}(\text{"veilport"}) \pmod r$ and $Z_{i+1} = \text{Poseidon}_2(Z_i, Z_i)$.

### 5.2 Root History Ring Buffer
To prevent withdrawal transaction reverts caused by other users depositing while a withdrawal proof is in flight, the contract stores a circular buffer of the most recent $M = 30$ historical roots:
```solidity
uint32 public constant ROOT_HISTORY_SIZE = 30;
uint32 public currentRootIndex;
bytes32[ROOT_HISTORY_SIZE] public roots;
```
A withdrawal proof is valid if its declared Merkle root exists anywhere within the active 30-root history buffer.

---

## 6. Circuit Constraints & Proof Binding

### 6.1 Groth16 Circuit Signals (`withdraw.circom`)
* **Public Signals:**
  1. `root`: Declared Merkle root.
  2. `nullifierHash`: Declared nullifier $N$.
  3. `recipient`: Address receiving the asset.
  4. `relayer`: Address receiving the fee.
  5. `fee`: Fee allocated to the relayer.
* **Private Signals (Witness):**
  1. `nullifierSecret`: $\rho$.
  2. `secret`: $k$.
  3. `pathElements[20]`: Merkle sibling hashes.
  4. `pathIndices[20]`: Direction selector bits ($0$ for left, $1$ for right).

### 6.2 Binding Against Front-Running & Malleability
To prevent malicious relayers or mempool bots from intercepting a valid proof and redirecting funds to an attacker-controlled address:
* The circuit constrains `recipient`, `relayer`, and `fee` directly:
  $$\text{recipientConstraint} = \text{recipient} \times \text{recipient}$$
* Because `recipient`, `relayer`, and `fee` are public inputs to the Groth16 verification equation:
  $$e(A, B) = e(\alpha, \beta) + e\left(\sum_{i=0}^l x_i \cdot \gamma_i, \gamma\right) + e(C, \delta)$$
  any alteration of `recipient`, `relayer`, or `fee` invalidates the pairing check, making front-running mathematically impossible.

---

## 7. State Transitions & Security Invariants

### 7.1 Deposit Invariant
* `deposit(bytes32 commitment)`:
  - Asserts `msg.value == denomination` (ETH) or `transferFrom(msg.sender, this, denomination)` (USDG).
  - Inserts $C$ at `nextIndex`.
  - Recomputes active Merkle branch and advances `currentRootIndex`.
  - Emits `Deposit(commitment, leafIndex, timestamp)`.

### 7.2 Withdrawal Invariant
* `withdraw(bytes proof, bytes32 root, bytes32 nullifierHash, address payable recipient, address payable relayer, uint256 fee)`:
  - Reentrancy Guard locked.
  - Asserts `isKnownRoot(root) == true`.
  - Asserts `nullifierSpent[nullifierHash] == false`.
  - Asserts `fee <= denomination`.
  - Calls `IVerifier.verifyProof(proof, [root, nullifierHash, uint256(recipient), uint256(relayer), fee])`.
  - Sets `nullifierSpent[nullifierHash] = true`.
  - Transfers `denomination - fee` to `recipient`.
  - Transfers `fee` to `relayer`.
  - Emits `Withdrawal(recipient, nullifierHash, relayer, fee)`.

---

## 8. Limitations & Future Phases

1. **Relayer Infrastructure (Phase 2):** In Phase 1, withdrawals can be executed directly or with designated relayer accounts in tests. A production relayer network with anti-DoS rate limiting is part of Phase 2.
2. **Stealth Note Encryption (Phase 2):** User private notes are backed up locally by the user. Automatic stealth note scanning using viewing keys (ERC-5564) is scheduled for Phase 2.
3. **Trusted Setup (Phase 2):** Development keys are generated for automated unit and circuit testing. A formal multi-party ceremony must be completed prior to mainnet production deployment.
