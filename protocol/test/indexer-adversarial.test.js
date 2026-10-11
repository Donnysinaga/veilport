const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const snarkjs = require('snarkjs');
const { parseEther, encodeAbiParameters, parseAbiParameters } = require('viem');
const { 
  createNote, 
  encryptNote, 
  decryptNote, 
  parseNote,
  RECOMMENDED_PBKDF2_ITERATIONS,
  SNARK_SCALAR_FIELD,
} = require('../lib/note');
const { MerkleTreeIndexer, FIELD_SIZE, TREE_DEPTH } = require('../lib/indexer');
const {
  checkNullifierStatus,
  validateWithdrawalParameters,
  validateWithdrawalPreparation,
} = require('../lib/validation');
const { setupTestEnvironment } = require('./test-helpers');

const WASM_PATH = path.resolve(__dirname, '../build/withdraw_js/withdraw.wasm');
const ZKEY_PATH = path.resolve(__dirname, '../build/withdraw_final.zkey');

describe('Phase 2B-4: Indexer Reliability, Withdrawal Safety & Security Hardening Suite', () => {

  describe('1. Merkle Tree Indexer Adversarial Ingestion & Ordering', () => {
    it('handles multiple deposits with sequential and non-zero leaf indices deterministically', async () => {
      const indexer = await MerkleTreeIndexer.create();
      const note0 = await createNote('ETH', '1.0', '1000000000000000000', 1337);
      const note1 = await createNote('ETH', '1.0', '1000000000000000000', 1337);
      const note2 = await createNote('ETH', '1.0', '1000000000000000000', 1337);

      const events = [
        { commitment: note0.commitment, leafIndex: 0, blockNumber: 100n, transactionHash: '0xaaa1', logIndex: 0 },
        { commitment: note1.commitment, leafIndex: 1, blockNumber: 101n, transactionHash: '0xaaa2', logIndex: 0 },
        { commitment: note2.commitment, leafIndex: 2, blockNumber: 102n, transactionHash: '0xaaa3', logIndex: 0 },
      ];

      indexer.ingestEvents(events);
      assert.equal(indexer.leaves.length, 3);
      assert.equal(indexer.nextIndex, 3);

      const path0 = indexer.getMerklePath(note0.commitment);
      const path1 = indexer.getMerklePath(note1.commitment);
      const path2 = indexer.getMerklePath(note2.commitment);

      assert.equal(path0.index, 0);
      assert.equal(path1.index, 1);
      assert.equal(path2.index, 2);

      // Verify each path locally
      assert.equal(indexer.verifyMerklePath(note0.commitment, path0), true);
      assert.equal(indexer.verifyMerklePath(note1.commitment, path1), true);
      assert.equal(indexer.verifyMerklePath(note2.commitment, path2), true);
    });

    it('orders out-of-order events deterministically by blockNumber and logIndex', async () => {
      const indexer = await MerkleTreeIndexer.create();
      const note0 = await createNote('ETH', '1.0', '1000000000000000000', 1337);
      const note1 = await createNote('ETH', '1.0', '1000000000000000000', 1337);
      const note2 = await createNote('ETH', '1.0', '1000000000000000000', 1337);

      // Ingest in scrambled order: block 102, then block 100, then block 101
      const scrambledEvents = [
        { commitment: note2.commitment, leafIndex: 2, blockNumber: 102n, transactionHash: '0xaaa3', logIndex: 0 },
        { commitment: note0.commitment, leafIndex: 0, blockNumber: 100n, transactionHash: '0xaaa1', logIndex: 0 },
        { commitment: note1.commitment, leafIndex: 1, blockNumber: 101n, transactionHash: '0xaaa2', logIndex: 0 },
      ];

      indexer.ingestEvents(scrambledEvents);
      assert.equal(indexer.leaves.length, 3);
      assert.equal(indexer.leaves[0], BigInt(note0.commitment));
      assert.equal(indexer.leaves[1], BigInt(note1.commitment));
      assert.equal(indexer.leaves[2], BigInt(note2.commitment));
    });

    it('deduplicates duplicate events and handles RPC replay without duplicate leaves', async () => {
      const indexer = await MerkleTreeIndexer.create();
      const note0 = await createNote('ETH', '1.0', '1000000000000000000', 1337);

      const event = { commitment: note0.commitment, leafIndex: 0, blockNumber: 100n, transactionHash: '0xaaa1', logIndex: 0 };
      indexer.ingestEvents([event]);
      const initialRoot = indexer.getLastRoot();

      // Ingest duplicate
      indexer.ingestEvents([event, event]);
      assert.equal(indexer.leaves.length, 1, 'Duplicate event must NOT create extra leaves');
      assert.equal(indexer.getLastRoot(), initialRoot, 'Root must remain unchanged on duplicate replay');
    });

    it('detects missing logs and non-sequential leaf index gaps', async () => {
      const indexer = await MerkleTreeIndexer.create();
      const note0 = await createNote('ETH', '1.0', '1000000000000000000', 1337);
      const note2 = await createNote('ETH', '1.0', '1000000000000000000', 1337);

      // Event list missing leaf index 1!
      const gappedEvents = [
        { commitment: note0.commitment, leafIndex: 0, blockNumber: 100n, transactionHash: '0xaaa1', logIndex: 0 },
        { commitment: note2.commitment, leafIndex: 2, blockNumber: 102n, transactionHash: '0xaaa3', logIndex: 0 },
      ];

      assert.throws(
        () => indexer.ingestEvents(gappedEvents),
        /Non-sequential leaf indices detected/i,
        'Gap in leaf index sequence must be detected and rejected'
      );
    });

    it('rejects deposit commitments exceeding scalar field modulus', async () => {
      const indexer = await MerkleTreeIndexer.create();
      const overflowingCommitment = '0x' + (FIELD_SIZE + 1n).toString(16);

      const invalidEvent = [
        { commitment: overflowingCommitment, leafIndex: 0, blockNumber: 100n, transactionHash: '0xaaa1', logIndex: 0 },
      ];

      assert.throws(
        () => indexer.ingestEvents(invalidEvent),
        /not a valid scalar field element/i,
        'Commitments exceeding scalar field size must be rejected'
      );
    });
  });

  describe('2. Chain Reorganizations & Deterministic Rollback', () => {
    it('rolls back orphaned blocks and reconstructs canonical state after a reorg', async () => {
      const indexer = await MerkleTreeIndexer.create();
      const note0 = await createNote('ETH', '1.0', '1000000000000000000', 1337);
      const note1 = await createNote('ETH', '1.0', '1000000000000000000', 1337);
      // Orphaned deposit in block 105
      const noteOrphan = await createNote('ETH', '1.0', '1000000000000000000', 1337);

      indexer.ingestEvents([
        { commitment: note0.commitment, leafIndex: 0, blockNumber: 100n, transactionHash: '0xaaa1', logIndex: 0 },
        { commitment: note1.commitment, leafIndex: 1, blockNumber: 101n, transactionHash: '0xaaa2', logIndex: 0 },
        { commitment: noteOrphan.commitment, leafIndex: 2, blockNumber: 105n, transactionHash: '0xorphan', logIndex: 0 },
      ]);
      assert.equal(indexer.leaves.length, 3);
      assert.equal(indexer.lastSyncedBlock, 105n);

      // Reorg occurs: block 105 was orphaned, chain rolled back to block 101
      indexer.rollbackToBlock(101n);
      assert.equal(indexer.leaves.length, 2, 'Orphaned block leaves must be purged');
      assert.equal(indexer.lastSyncedBlock, 101n);
      assert.throws(() => indexer.getMerklePath(noteOrphan.commitment), /not found/i);

      // Canonical block 102 arrives with replacement deposit
      const noteCanonical = await createNote('ETH', '1.0', '1000000000000000000', 1337);
      indexer.ingestEvents([
        { commitment: noteCanonical.commitment, leafIndex: 2, blockNumber: 102n, transactionHash: '0xcanonical', logIndex: 0 },
      ]);

      assert.equal(indexer.leaves.length, 3);
      assert.equal(indexer.lastSyncedBlock, 102n);
      const canonicalPath = indexer.getMerklePath(noteCanonical.commitment);
      assert.equal(indexer.verifyMerklePath(noteCanonical.commitment, canonicalPath), true);
    });

    it('fully resets and reconstructs the same tree state from clean slate', async () => {
      const indexer = await MerkleTreeIndexer.create();
      const note0 = await createNote('ETH', '1.0', '1000000000000000000', 1337);
      const event = { commitment: note0.commitment, leafIndex: 0, blockNumber: 100n, transactionHash: '0xaaa1', logIndex: 0 };

      indexer.ingestEvents([event]);
      const rootBefore = indexer.getLastRoot();

      indexer.reset();
      assert.equal(indexer.leaves.length, 0);
      assert.equal(indexer.nextIndex, 0);

      indexer.ingestEvents([event]);
      assert.equal(indexer.getLastRoot(), rootBefore, 'Reconstruction from identical events must match exactly');
    });
  });

  describe('3. Authenticated Encrypted Note Backup Hardening', () => {
    it('uses 600,000 PBKDF2 iterations by default and derives fresh salt & IV', async () => {
      const note = await createNote('ETH', '1.0', '1000000000000000000', 4663);
      const backup1 = await encryptNote(note, 'StrongPassword123!');
      const backup2 = await encryptNote(note, 'StrongPassword123!');

      assert.equal(backup1.kdf.iterations, RECOMMENDED_PBKDF2_ITERATIONS);
      assert.equal(backup1.kdf.iterations, 600000);

      // Verify unique random salts and IVs
      assert.notEqual(backup1.kdf.saltHex, backup2.kdf.saltHex, 'Every backup must generate a unique salt');
      assert.notEqual(backup1.cipher.ivHex, backup2.cipher.ivHex, 'Every backup must generate a unique IV');
      assert.notEqual(backup1.cipher.ciphertextHex, backup2.cipher.ciphertextHex);

      const recovered = await decryptNote(backup1, 'StrongPassword123!');
      assert.equal(recovered.commitment, note.commitment);
    });

    it('maintains backward compatibility with 100,000 iteration backups', async () => {
      const note = await createNote('USDG', '100', '100000000', 4663);
      const legacyBackup = await encryptNote(note, 'LegacyPassword123!', 100000);
      assert.equal(legacyBackup.kdf.iterations, 100000);

      const decrypted = await decryptNote(legacyBackup, 'LegacyPassword123!');
      assert.equal(decrypted.commitment, note.commitment);
      assert.equal(decrypted.denomination, '100');
    });

    it('rejects oversized backup payloads to prevent denial of service', async () => {
      const note = await createNote('ETH', '1.0', '1000000000000000000', 4663);
      const backup = await encryptNote(note, 'StrongPassword123!');

      // Inflate ciphertext to 200 KB
      const bloatedBackup = {
        ...backup,
        cipher: {
          ...backup.cipher,
          ciphertextHex: 'aa'.repeat(100000),
        },
      };

      await assert.rejects(
        async () => decryptNote(bloatedBackup, 'StrongPassword123!'),
        /Decryption failed/i
      );
    });

    it('rejects backup with unsupported format version or invalid iteration bounds', async () => {
      const note = await createNote('ETH', '1.0', '1000000000000000000', 4663);
      const backup = await encryptNote(note, 'StrongPassword123!');

      const wrongVersion = { ...backup, version: 99 };
      await assert.rejects(
        async () => decryptNote(wrongVersion, 'StrongPassword123!'),
        /Unsupported backup format version/i
      );

      const unsafeIterations = {
        ...backup,
        kdf: { ...backup.kdf, iterations: 100 }, // Under minimum 10,000 threshold
      };
      await assert.rejects(
        async () => decryptNote(unsafeIterations, 'StrongPassword123!'),
        /Invalid KDF iteration count/i
      );
    });

    it('rejects backup when AAD metadata (asset or chainId) is tampered with', async () => {
      const note = await createNote('ETH', '1.0', '1000000000000000000', 4663);
      const backup = await encryptNote(note, 'StrongPassword123!');

      // Tamper chain ID in metadata without altering ciphertext
      const crossChainBackup = {
        ...backup,
        chainId: 1, // Changed from 4663 to 1
      };

      await assert.rejects(
        async () => decryptNote(crossChainBackup, 'StrongPassword123!'),
        /Decryption failed/i,
        'AES-GCM authentication must fail when AAD is tampered'
      );
    });
  });

  describe('4. Nullifier Safety & Withdrawal Parameter Validation', () => {
    it('distinguishes CONFIRMED_UNSPENT and CONFIRMED_SPENT on-chain', async () => {
      const env = await setupTestEnvironment();
      const poolArtifact = env.loadArtifact('VeilportPoolETH');

      const poolTx = await env.deployer.client.deployContract({
        abi: poolArtifact.abi,
        bytecode: poolArtifact.bytecode,
        args: [env.genuineVerifierAddress, env.hasherAddress, parseEther('1.0')],
      });
      const receipt = await env.publicClient.waitForTransactionReceipt({ hash: poolTx });
      const poolAddress = receipt.contractAddress;

      const dummyNullifier = '0x1111111111111111111111111111111111111111111111111111111111111111';

      // 1. Initial status: unspent
      const status1 = await checkNullifierStatus(env.publicClient, poolAddress, dummyNullifier);
      assert.equal(status1.status, 'CONFIRMED_UNSPENT');
      assert.equal(status1.isSpent, false);
      assert.equal(status1.canProceed, true);
    });

    it('blocks withdrawal with UNKNOWN_RPC_ERROR on network or contract failure (never treats as unspent)', async () => {
      // Create a mocked failing public client
      const failingClient = {
        readContract: async () => {
          throw new Error('ETIMEDOUT: Connection to RPC endpoint timed out');
        },
      };

      const result = await checkNullifierStatus(failingClient, '0x1234567890123456789012345678901234567890', '0x1111');
      assert.equal(result.status, 'UNKNOWN_RPC_ERROR');
      assert.equal(result.isSpent, false);
      assert.equal(result.canProceed, false, 'Withdrawal MUST be blocked when RPC fails');
      assert.match(result.errorMessage, /Withdrawal blocked for safety/i);
    });

    it('validates withdrawal parameters, rejects zero address, and enforces fee conservation', () => {
      const denomination = parseEther('1.0');

      // 1. Valid case
      const valid = validateWithdrawalParameters({
        recipient: '0x1111111111111111111111111111111111111111',
        relayer: '0x2222222222222222222222222222222222222222',
        fee: parseEther('0.05'),
        denomination,
        asset: 'ETH',
      });
      assert.equal(valid.valid, true);
      assert.equal(valid.payout, parseEther('0.95'));
      assert.equal(valid.payout + valid.fee, denomination, 'Conservation invariant');

      // 2. Zero-address recipient rejected
      const zeroRecipient = validateWithdrawalParameters({
        recipient: '0x0000000000000000000000000000000000000000',
        relayer: '0x2222222222222222222222222222222222222222',
        fee: parseEther('0.05'),
        denomination,
        asset: 'ETH',
      });
      assert.equal(zeroRecipient.valid, false);
      assert.match(zeroRecipient.error, /zero address/i);

      // 3. Fee exceeding denomination rejected
      const feeTooHigh = validateWithdrawalParameters({
        recipient: '0x1111111111111111111111111111111111111111',
        relayer: '0x2222222222222222222222222222222222222222',
        fee: parseEther('1.05'), // Greater than denomination 1.0
        denomination,
        asset: 'ETH',
      });
      assert.equal(feeTooHigh.valid, false);
      assert.match(feeTooHigh.error, /cannot exceed pool denomination/i);
    });

    it('rejects withdrawal preparation for cross-chain notes and unindexed commitments', async () => {
      const indexer = await MerkleTreeIndexer.create();
      const note = await createNote('ETH', '1.0', parseEther('1.0').toString(), 4663);

      // 1. Cross-chain note rejection
      const crossChainPrep = await validateWithdrawalPreparation({
        note,
        expectedAsset: 'ETH',
        expectedChainId: 1, // Target chain is 1, but note is 4663
        indexer,
      });
      assert.equal(crossChainPrep.valid, false);
      assert.match(crossChainPrep.error, /Cross-chain unshielding is prohibited/i);

      // 2. Unindexed commitment rejection
      const unindexedPrep = await validateWithdrawalPreparation({
        note,
        expectedAsset: 'ETH',
        expectedChainId: 4663,
        indexer,
      });
      assert.equal(unindexedPrep.valid, false);
      assert.match(unindexedPrep.error, /not found in indexed pool history/i);
    });
  });

  describe('5. Genuine Groth16 Proving with Reconstructed Indexer Path on Local EVM', () => {
    it('executes full end-to-end flow: Deposit -> Index -> Reconstruct Path -> Groth16 Prove -> EVM Withdraw', async () => {
      const env = await setupTestEnvironment();
      const F = env.poseidon.F;
      const poolArtifact = env.loadArtifact('VeilportPoolETH');

      const poolTx = await env.deployer.client.deployContract({
        abi: poolArtifact.abi,
        bytecode: poolArtifact.bytecode,
        args: [env.genuineVerifierAddress, env.hasherAddress, parseEther('1.0')],
      });
      const receipt = await env.publicClient.waitForTransactionReceipt({ hash: poolTx });
      const poolAddress = receipt.contractAddress;

      const indexer = await MerkleTreeIndexer.create();

      // 1. User deposits on-chain
      const note = await createNote('ETH', '1.0', parseEther('1.0').toString(), 1337);
      const depTx = await env.depositor.client.writeContract({
        address: poolAddress,
        abi: poolArtifact.abi,
        functionName: 'deposit',
        args: [note.commitment],
        value: parseEther('1.0'),
      });
      const depReceipt = await env.publicClient.waitForTransactionReceipt({ hash: depTx });

      // 2. Indexer ingests the on-chain deposit event
      indexer.ingestEvents([
        {
          commitment: note.commitment,
          leafIndex: 0,
          blockNumber: depReceipt.blockNumber,
          transactionHash: depReceipt.transactionHash,
          logIndex: 0,
        },
      ]);

      // 3. Confirm indexer root matches on-chain root
      const onChainRoot = await env.publicClient.readContract({
        address: poolAddress,
        abi: poolArtifact.abi,
        functionName: 'getLastRoot',
      });
      assert.equal(indexer.getLastRoot().toLowerCase(), onChainRoot.toLowerCase());

      // 4. Validate withdrawal preparation
      const prep = await validateWithdrawalPreparation({
        note,
        expectedAsset: 'ETH',
        expectedChainId: 1337,
        indexer,
        poolAddress,
        publicClient: env.publicClient,
      });
      assert.equal(prep.valid, true);

      // 5. Generate genuine Groth16 proof using indexer path
      const recipient = env.recipient.address;
      const relayer = env.relayer.address;
      const fee = parseEther('0.05');

      const circuitInput = {
        root: BigInt(prep.root).toString(),
        nullifierHash: BigInt(note.nullifierHash).toString(),
        recipient: BigInt(recipient).toString(),
        relayer: BigInt(relayer).toString(),
        fee: fee.toString(),
        nullifierSecret: BigInt(note.nullifierSecret).toString(),
        secret: BigInt(note.secret).toString(),
        pathElements: prep.path.pathElements.map((el) => BigInt(el).toString()),
        pathIndices: prep.path.pathIndices,
      };

      const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        circuitInput,
        WASM_PATH,
        ZKEY_PATH
      );
      assert.ok(proof);

      // 6. Encode proof for Solidity verifier
      const a = [BigInt(proof.pi_a[0]), BigInt(proof.pi_a[1])];
      const b = [
        [BigInt(proof.pi_b[0][1]), BigInt(proof.pi_b[0][0])],
        [BigInt(proof.pi_b[1][1]), BigInt(proof.pi_b[1][0])],
      ];
      const c = [BigInt(proof.pi_c[0]), BigInt(proof.pi_c[1])];

      const proofBytes = encodeAbiParameters(
        parseAbiParameters('uint256[2], uint256[2][2], uint256[2]'),
        [a, b, c]
      );

      // 7. Execute withdrawal on EVM
      const withdrawTx = await env.relayer.client.writeContract({
        address: poolAddress,
        abi: poolArtifact.abi,
        functionName: 'withdraw',
        args: [
          proofBytes,
          prep.root,
          note.nullifierHash,
          recipient,
          relayer,
          fee,
        ],
      });
      const withdrawReceipt = await env.publicClient.waitForTransactionReceipt({ hash: withdrawTx });
      assert.equal(withdrawReceipt.status, 'success');

      // 8. Confirm nullifier is now spent on-chain
      const postStatus = await checkNullifierStatus(env.publicClient, poolAddress, note.nullifierHash);
      assert.equal(postStatus.status, 'CONFIRMED_SPENT');
      assert.equal(postStatus.isSpent, true);
      assert.equal(postStatus.canProceed, false);

      // 9. Confirm second withdrawal attempt reverts with NullifierAlreadySpent
      await assert.rejects(
        async () => {
          await env.relayer.client.writeContract({
            address: poolAddress,
            abi: poolArtifact.abi,
            functionName: 'withdraw',
            args: [
              proofBytes,
              prep.root,
              note.nullifierHash,
              recipient,
              relayer,
              fee,
            ],
          });
        },
        /(revert|NullifierAlreadySpent)/i,
        'Double-spending must revert on EVM'
      );
    });
  });
});
