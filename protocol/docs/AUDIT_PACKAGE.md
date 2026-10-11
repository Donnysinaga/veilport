# VEILPORT — External Security Review & Audit Package
**Protocol Baseline Specification & Architecture Document**  
**Version**: 1.0.0-rc2  
**Status**: `LOCAL DEVELOPMENT BASELINE — EXTERNAL AUDIT REQUIRED`  
**Network Target**: Robinhood Chain (EVM, Chain ID 4663)  
**Classification**: Non-Production / Local Development Baseline Only  

> [!CAUTION]
> **PRE-AUDIT PROTOCOL NOTICE**:  
> This package represents a frozen local-development baseline for the VEILPORT zero-knowledge privacy protocol.  
> **No contracts are deployed on public networks.**  
> **No public-network transactions have been broadcast.**  
> **No real user funds are managed by the protocol.**  
> **The proving key is strictly a development artifact and MUST NOT be used in production.**  
> **Formal independent third-party auditor sign-off has NOT yet occurred.**

---

## 1. Executive Summary & Purpose

This document constitutes the official pre-audit review package for **VEILPORT**, an on-chain zero-knowledge privacy protocol implementing discrete-denomination shielded pools on EVM-compatible networks.

This package establishes a frozen, reproducible baseline of:
1. Core smart contracts and interfaces (`Solidity 0.8.20`).
2. Zero-knowledge circuits (`Circom 2.0.0` + `Groth16`).
3. Client-side note generation, authenticated AES-GCM backup encryption, and incremental Merkle tree indexing.
4. Cryptographic parameter references and artifact SHA-256 integrity hashes.
5. End-to-end integration and adversarial test suites.
6. A multi-party trusted setup plan and production infrastructure roadmap.

---

## 2. Frozen Protocol Inventory & Cryptographic Hashes

### 2.1 Smart Contracts (`protocol/contracts/`)

| File | Compiler | SHA-256 Hash |
| :--- | :---: | :--- |
| `protocol/contracts/VeilportBasePool.sol` | Solidity 0.8.20 | `7D1F24E8EB906917673F4CCF12A8B6B910F0E60AB166A9B075DE17F0E3904016` |
| `protocol/contracts/VeilportPoolETH.sol` | Solidity 0.8.20 | `7F99D26D4232EF313EAA2D4732422FD13ACEBA2B2549FBA828BDF14BFD60B232` |
| `protocol/contracts/VeilportPoolUSDG.sol` | Solidity 0.8.20 | `0032510138C954452D6AFF855C36B3D33FA2B0936F126F132378DDF655F6164A` |
| `protocol/contracts/MerkleTreeWithHistory.sol` | Solidity 0.8.20 | `56EBFB83723EB6C8D24CAD143F1DC30E46B3FA0E3DA4893B1CB131690738F24C` |
| `protocol/contracts/interfaces/IPoseidon.sol` | Solidity 0.8.20 | `9974346B714741BE731A7C06AAAF005A35D0AEA2412916DCA9A70D71DDD185E1` |
| `protocol/contracts/interfaces/IVerifier.sol` | Solidity 0.8.20 | `68C3B3DD1EEC5DF6A4623416897BA2CFA16C28AC6B9121197E1EDFF110C8EBFF` |
| `protocol/contracts/test/Groth16VerifierAdapter.sol`| Solidity 0.8.20 | `4DAEB022DB72FC60522C929D05B6C4E79C6A567DA66B1920066E37E369C4E5AF` |
| `protocol/contracts/test/Groth16Verifier.sol` | Solidity 0.8.20 | `E19192D492477E8F9559A8F00D13A2587011B6990EB76B629FB01A86F75AFA90` |

### 2.2 Circuits and Proving Artifacts (`protocol/circuits/` & `protocol/build/`)

| Artifact | Toolchain | Size | SHA-256 Hash |
| :--- | :---: | :---: | :--- |
| `protocol/circuits/withdraw.circom` | Circom 2.0.0 | 4,404 B | `71F1BA2E90C208F3B9619B36F124031D01EBCAAE6FF811F70BD4C9EFC18D1536` |
| `protocol/build/withdraw_final.zkey` | SnarkJS 0.7.6 | ~4.2 MB | `1EE7E864963944D68CA89A9798B41402E45325CE2D05622F1D5A6B5B934D4FC4` |
| `protocol/build/withdraw_js/withdraw.wasm` | Circom 2.0.0 | ~1.8 MB | `CB17ACBB8097378CA18974FAC0E74665D4A4F3BD2C1D89EDE819AFBEDE0C29AC` |
| `protocol/build/verification_key.json` | SnarkJS 0.7.6 | 3,462 B | `D6955C59AC76D09FEB2EAA3E17EBA2F4C6539ACD2534C7AC0F5CB74BC90167C5` |

### 2.3 Circuit R1CS Complexity Metrics
- **Non-linear Constraints (`nConstraints`)**: **11,335**
- **Variables (`nVars`)**: **11,361**
- **Public Signals (`nPubInputs`)**: **5** (`root`, `nullifierHash`, `recipient`, `relayer`, `fee`)
- **Private Witness Inputs (`nPrvInputs`)**: **42** (`nullifierSecret`, `secret`, `pathElements[20]`, `pathIndices[20]`)
- **Minimum Powers-of-Tau Degree**: **14** ($2^{14} = 16,384 > 11,335$)

### 2.4 Public Signal Binding & Circuit Semantics (Source-Verified)
In `protocol/circuits/withdraw.circom`:
```circom
signal recipientSquare;
recipientSquare <== recipient * recipient;

signal relayerSquare;
relayerSquare <== relayer * relayer;

signal feeSquare;
feeSquare <== fee * fee;
```

- **Source-Verified Verification**: The quadratic dummy constraints force Circom to include `recipient`, `relayer`, and `fee` into the R1CS constraint matrix. SnarkJS derives non-zero group points $IC_3, IC_4, IC_5 \in G_1$ in the verification key. In the Groth16 pairing check, $\text{vk\_x} = IC_0 + \sum_{i=1}^5 x_i IC_i$. Tampering with `recipient`, `relayer`, or `fee` invalidates the pairing equation $e(A, B) = e(\alpha, \beta) + e(\text{vk\_x}, \gamma) + e(C, \delta)$, guaranteeing transaction intent binding.
- **Circuit vs. Contract Partitioning**:
  - The circuit does **not** constrain $recipient < 2^{160}$ or $fee \le denomination$.
  - These bounds are strictly enforced by `VeilportBasePool.sol`: `address payable` parameter typing limits addresses to 160 bits; zero address is rejected; $fee \le denomination$ is enforced; and $netPayout = denomination - fee$ enforces asset conservation.
  - Assembly `checkField` in `Groth16Verifier.sol` ensures all 5 public input evaluations are strictly $< r$ (scalar field order).

---

## 3. Threat Model & Trust Assumptions

### 3.1 Security Invariants
1. **Solvency & Asset Conservation**:
   - Every deposit of denomination $D$ increases contract balance by exactly $D$.
   - Every withdrawal of $(recipient, relayer, fee)$ transfers exactly $D - fee$ to $recipient$ and $fee$ to $relayer$.
   - Invariant: $\text{payout} + \text{fee} \equiv D$ at all times.
2. **Double-Spend Freedom (Nullifier Uniqueness)**:
   - A commitment $C$ can only be spent once.
   - The contract records `nullifierSpent[nullifierHash] = true` before transferring funds.
   - Any replayed withdrawal with an already-spent nullifier hash unconditionally reverts.
3. **Membership Validity**:
   - Funds can only be withdrawn if the commitment was inserted into the on-chain Merkle tree and the root is accepted by `isKnownRoot(root)`.
4. **Anti-Front-Running & Intent Binding**:
   - The zero-knowledge proof strictly binds `recipient`, `relayer`, and `fee`.
   - An adversary intercepting a mempool withdrawal transaction cannot redirect funds to a different recipient address without invalidating the proof.
5. **Secret Confidentiality**:
   - Note secrets (`nullifierSecret`, `secret`) never leave the client environment in plaintext.
   - Exported backup files are encrypted with authenticated PBKDF2 (600,000 iterations) + 256-bit AES-GCM.

### 3.2 Adversary Assumptions
- **Malicious Relayer**: A relayer may inspect transactions, attempt front-running, or drop transactions. They cannot steal funds or alter the withdrawal recipient because `recipient` is bound in the zk-SNARK proof.
- **Malicious RPC Node**: An RPC provider may serve stale or corrupted block logs. The client indexer independently reconstructs the tree, validates contiguous leaf indices, and checks the computed root against `isKnownRoot(root)`.
- **EVM Reorganizations**: If orphaned blocks occur, the indexer supports `rollbackToBlock` to purge unconfirmed logs and restore canonical state.

---

## 4. Reproducible Local Verification Instructions

### 4.1 Prerequisites
- **Node.js**: v20.x or v22.x
- **Package Manager**: `pnpm` (v9+)
- **OS**: Windows, macOS, or Linux

### 4.2 Step-by-Step Test Execution
```bash
# 1. Clone repository and navigate to protocol directory
cd protocol

# 2. Install dependencies
pnpm install

# 3. Compile Solidity contracts
node scripts/compile-contracts.js

# 4. Run Groth16 Adversarial Verification Suite (Phase 2B-7A)
node --test test/groth16-adversarial.test.js

# 5. Run full End-to-End Integration Suite (Phase A, B, D)
node --test test/e2e-integration.test.js

# 6. Run Adversarial Indexer & Backup Hardening Suite (Phase 2B-4)
node --test test/indexer-adversarial.test.js

# 7. Run Note Lifecycle & Cryptographic Parity Suites
node --test test/client-note.test.js
node --test test/indexer-backup.test.js
```

### 4.3 Expected Results
- Total Tests: **39 automated test cases across 5 test suites**
- Expected Exit Code: **`0`** (0 failures, 0 skipped)
  - `test/groth16-adversarial.test.js`: 11 / 11 passed
  - `test/e2e-integration.test.js`: 13 / 13 passed
  - `test/indexer-adversarial.test.js`: 5 / 5 passed
  - `test/client-note.test.js`: 5 / 5 passed
  - `test/indexer-backup.test.js`: 5 / 5 passed
- Total Execution Duration: ~3.5 minutes (including Ganache deployments and Groth16 witness calculations)

---

## 5. Trusted Setup Ceremony Plan

### 5.1 Powers-of-Tau Phase 1 Requirements
- Current circuit requires order **14** ($2^{14} = 16,384$ constraints).
- Production will utilize the community-verified Hermez / Perpetual Powers-of-Tau ceremony (order 15 or 16) with publicly published Blake2b and SHA-256 beacon hashes.

### 5.2 Phase 2 Circuit-Specific Ceremony
1. **Initialization**: Initialize `withdraw_0000.zkey` using official Powers-of-Tau `powersOfTau28_hez_final_15.ptau` and `withdraw.r1cs`.
2. **Multi-Party Contributions**:
   - Minimum 10 independent participants across varied geographic regions and operating systems.
   - Each participant contributes entropy, records transcript hash, and publishes an attested contribution.
3. **Random Beacon**: Apply a verifiable public random beacon (e.g., future Ethereum block hash or Drand beacon round) to finalize the ceremony:
   ```bash
   snarkjs zkey beacon withdraw_0010.zkey withdraw_final.zkey <BEACON_HASH> 10 -n="VEILPORT Production Beacon"
   ```
4. **Verification Key Export & Solidity Verifier Generation**:
   ```bash
   snarkjs zkey export verificationkey withdraw_final.zkey verification_key.json
   snarkjs zkey export solidityverifier withdraw_final.zkey Groth16Verifier.sol
   ```
5. **Public Release**: Publish the complete ceremony transcript, contribution hashes, and dockerized verification script to IPFS and GitHub.

---

## 6. Production Infrastructure Architecture

### 6.1 Transactional Checkpoint Merkle Indexer
- **Client & Relayer Engine**:
  - Implements transactional checkpointing with local storage (IndexedDB on browser, PostgreSQL/Redis on relayer).
  - Storage Schema:
    - `blocks`: `(block_number, block_hash, parent_hash, status)`
    - `deposits`: `(commitment, leaf_index, block_number, tx_hash, log_index)`
    - `checkpoints`: `(last_synced_block, root_hash, filled_subtrees)`
  - Reorg Resolution: On detecting `parent_hash != previous_block_hash`, rollback to the common ancestor block and replay canonical logs.

### 6.2 Relayer API & Abuse Protection
- **Architecture**:
  - Endpoint: `POST /api/v1/relay/withdraw`
  - Pre-flight Validation:
    1. Query contract `isKnownRoot(root)` — reject immediately if false.
    2. Query contract `nullifierSpent(nullifierHash)` — reject immediately if true.
    3. Verify `fee >= minRelayerFee && fee <= poolDenomination`.
    4. Simulate transaction via `eth_call`.
  - Anti-DDoS & Nonce Management:
    - Distributed task queue (Redis + BullMQ) with FIFO execution per pool address to prevent nonce race conditions.
    - IP and recipient rate limits (maximum 5 withdrawal requests per IP per minute).

### 6.3 Browser Proof Worker Isolation
- **Web Worker Pipeline**:
  - Proving computation runs inside an isolated dedicated Web Worker (`public/workers/prover.worker.js`).
  - Protects the main UI thread from frame drops or browser "Page Unresponsive" warnings during the witness calculation.
  - Progressive download and cache storage of `withdraw_final.zkey` via browser Cache API.

---

## 7. Severity-Ranked Security Findings & Recommendations

### [VP-01] [HIGH] Development-Only Proving Key (Trusted Setup Blocker)
- **Component**: `protocol/build/withdraw_final.zkey`
- **Impact**: The current proving key was created via a local single-party ceremony for development testing. Anyone with access to the toxic waste from that run could theoretically forge proofs.
- **Remediation**: Conduct the multi-party trusted setup ceremony described in Section 5 prior to deploying on public networks.

### [VP-02] [MEDIUM] Historical Root Expiry During High Deposit Volumes
- **Component**: [`protocol/contracts/MerkleTreeWithHistory.sol#L13`](file:///C:/Users/Donny/.gemini/antigravity/scratch/veilport/protocol/contracts/MerkleTreeWithHistory.sol#L13)
- **Constraint**: `uint32 public constant ROOT_HISTORY_SIZE = 30;`
- **Impact**: If 30 deposits occur between proof generation and on-chain mining, the proof's asserted root is overwritten in the ring buffer, causing `isKnownRoot(root)` to revert.
- **Remediation**: Increase `ROOT_HISTORY_SIZE` to 100 or 256 for testnet/mainnet, and implement an automated indexer root freshness check in the relayer service.

### [VP-03] [LOW] Single-Step Ownership Transfer Pattern
- **Component**: [`protocol/contracts/VeilportBasePool.sol#L150`](file:///C:/Users/Donny/.gemini/antigravity/scratch/veilport/protocol/contracts/VeilportBasePool.sol#L150)
- **Function**: `transferOwnership(address newOwner)`
- **Impact**: Accidental transfer to an incorrect address permanently compromises contract administrative control.
- **Remediation**: Adopt a two-step `transferOwnership` pattern with `acceptOwnership` or OpenZeppelin's `Ownable2Step`.

### [VP-04] [INFORMATIONAL] Centralized Pause Authority
- **Component**: [`protocol/contracts/VeilportBasePool.sol#L140`](file:///C:/Users/Donny/.gemini/antigravity/scratch/veilport/protocol/contracts/VeilportBasePool.sol#L140)
- **Function**: `pause()` and `unpause()`
- **Impact**: Contract owner can halt deposits and withdrawals.
- **Remediation**: Transfer contract ownership to a multi-signature wallet (e.g., Safe 3-of-5) with a timelock before mainnet deployment.

### [VP-05] [ARCHITECTURAL] Circuit Public Signal Count Optimization Proposal
- **Component**: `protocol/circuits/withdraw.circom`
- **Proposal**: Replacing the three separate quadratic dummy constraints (`recipient`, `relayer`, `fee`) with a single parameter commitment hash $H = \text{Poseidon}(recipient, relayer, fee)$ reduces public signals from 5 to 3. This saves scalar multiplications during on-chain verification. Considered for V2 protocol upgrade.

---

## 8. Explicit Blockers Before Testnet / Mainnet Deployment

1. **Trusted Setup Ceremony**: Completion of public multi-party ceremony for `withdraw.circom`.
2. **Third-Party Smart Contract Audit**: Independent external security review of `VeilportBasePool.sol`, `VeilportPoolETH.sol`, and `VeilportPoolUSDG.sol`.
3. **Production Relayer Service**: Deployment of production relayer infrastructure with transaction queuing and fee quotation.
4. **Contract Address Deployment**: Deployment of audited contracts to Robinhood Testnet (Chain ID 4663) and population of [`SUPPORTED_POOLS`](file:///C:/Users/Donny/.gemini/antigravity/scratch/veilport/src/config/pools.ts).

---

## 9. Independent Auditor Sign-Off Checklist

> [!NOTE]
> All items below remain **PENDING** independent external security firm sign-off. None have been marked completed.

- [ ] Verify Circom circuit constraint system (`11,335` constraints, `5` public inputs).
- [ ] Verify BN254 scalar field checks and field overflow guards in contracts.
- [ ] Verify Merkle tree zero precomputations matching `keccak256("veilport") % FIELD_SIZE`.
- [ ] Verify checks-effects-interactions order (`nullifierSpent = true` prior to payouts).
- [ ] Verify ERC-20 `_safeTransferFrom` and `_safeTransfer` token balance conservation.
- [ ] Verify PBKDF2/AES-GCM client backup encryption authenticated data binding.
- [ ] Verify multi-party trusted setup transcript and beacon attestation.
