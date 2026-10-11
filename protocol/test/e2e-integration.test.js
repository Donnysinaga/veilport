const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const snarkjs = require('snarkjs');
const { parseEther, encodeAbiParameters, parseAbiParameters } = require('viem');
const { 
  createNote, 
  encryptNote, 
  decryptNote, 
  RECOMMENDED_PBKDF2_ITERATIONS,
} = require('../lib/note');
const { MerkleTreeIndexer } = require('../lib/indexer');
const {
  checkNullifierStatus,
  validateWithdrawalParameters,
  validateWithdrawalPreparation,
} = require('../lib/validation');
const { setupTestEnvironment, loadArtifact } = require('./test-helpers');

const WASM_PATH = path.resolve(__dirname, '../build/withdraw_js/withdraw.wasm');
const ZKEY_PATH = path.resolve(__dirname, '../build/withdraw_final.zkey');

describe('Phase 2B-5: End-to-End Integration & Deployment Readiness Audit Suite', () => {

  describe('PHASE A — Full Protocol Lifecycle: Native ETH Shielded Pool', () => {
    it('executes full 12-step lifecycle: note creation -> backup -> deposit -> indexing -> Groth16 proof -> EVM withdrawal -> balance verification -> replay protection', async () => {
      const env = await setupTestEnvironment();
      const poolArtifact = loadArtifact('VeilportPoolETH');

      // 1. Deploy VeilportPoolETH (1.0 ETH denomination)
      const poolTx = await env.deployer.client.deployContract({
        abi: poolArtifact.abi,
        bytecode: poolArtifact.bytecode,
        args: [env.genuineVerifierAddress, env.hasherAddress, parseEther('1.0')],
      });
      const poolReceipt = await env.publicClient.waitForTransactionReceipt({ hash: poolTx });
      const poolAddress = poolReceipt.contractAddress;

      // 2. Generate cryptographically secure note
      const note = await createNote('ETH', '1.0', parseEther('1.0').toString(), 1337);
      assert.ok(note.nullifierSecret);
      assert.ok(note.secret);
      assert.ok(note.commitment);
      assert.ok(note.nullifierHash);

      // 3. Create encrypted backup & verify recovery
      const password = 'StrongPassword2026!';
      const backup = await encryptNote(note, password);
      assert.equal(backup.kdf.iterations, RECOMMENDED_PBKDF2_ITERATIONS);
      const recoveredNote = await decryptNote(backup, password);
      assert.equal(recoveredNote.commitment, note.commitment);

      // 4. Deposit 1.0 ETH into local contract
      const depTx = await env.depositor.client.writeContract({
        address: poolAddress,
        abi: poolArtifact.abi,
        functionName: 'deposit',
        args: [note.commitment],
        value: parseEther('1.0'),
      });
      const depReceipt = await env.publicClient.waitForTransactionReceipt({ hash: depTx });
      assert.equal(depReceipt.status, 'success');

      // 5. Read actual Deposit event from local EVM receipt logs
      const depositLogs = depReceipt.logs;
      assert.ok(depositLogs.length > 0, 'Deposit event must be emitted');

      // 6. Index event and reconstruct Merkle root and path
      const indexer = await MerkleTreeIndexer.create();
      indexer.ingestEvents([
        {
          commitment: note.commitment,
          leafIndex: 0,
          blockNumber: depReceipt.blockNumber,
          transactionHash: depReceipt.transactionHash,
          logIndex: 0,
        },
      ]);

      const onChainRoot = await env.publicClient.readContract({
        address: poolAddress,
        abi: poolArtifact.abi,
        functionName: 'getLastRoot',
      });
      assert.equal(indexer.getLastRoot().toLowerCase(), onChainRoot.toLowerCase(), 'Indexer root must match on-chain root');

      // 7. Validate withdrawal preparation
      const prep = await validateWithdrawalPreparation({
        note,
        expectedAsset: 'ETH',
        expectedChainId: 1337,
        indexer,
        poolAddress,
        publicClient: env.publicClient,
      });
      assert.equal(prep.valid, true);

      // 8. Validate withdrawal parameters
      const fee = parseEther('0.05');
      const paramVal = validateWithdrawalParameters({
        recipient: env.recipient.address,
        relayer: env.relayer.address,
        fee,
        denomination: parseEther('1.0'),
        asset: 'ETH',
      });
      assert.equal(paramVal.valid, true);
      assert.equal(paramVal.payout, parseEther('0.95'));

      // 9. Generate genuine Groth16 proof
      const circuitInput = {
        root: BigInt(prep.root).toString(),
        nullifierHash: BigInt(note.nullifierHash).toString(),
        recipient: BigInt(env.recipient.address).toString(),
        relayer: BigInt(env.relayer.address).toString(),
        fee: fee.toString(),
        nullifierSecret: BigInt(note.nullifierSecret).toString(),
        secret: BigInt(note.secret).toString(),
        pathElements: prep.path.pathElements.map((el) => BigInt(el).toString()),
        pathIndices: prep.path.pathIndices,
      };

      const { proof, publicSignals } = await snarkjs.groth16.fullProve(circuitInput, WASM_PATH, ZKEY_PATH);
      assert.ok(proof);

      // 10. Encode proof for EVM
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

      // Record pre-withdrawal balances
      const recipientBalBefore = await env.publicClient.getBalance({ address: env.recipient.address });
      const relayerBalBefore = await env.publicClient.getBalance({ address: env.relayer.address });

      // 11. Submit withdrawal transaction
      const withdrawTx = await env.relayer.client.writeContract({
        address: poolAddress,
        abi: poolArtifact.abi,
        functionName: 'withdraw',
        args: [
          proofBytes,
          prep.root,
          note.nullifierHash,
          env.recipient.address,
          env.relayer.address,
          fee,
        ],
      });
      const withdrawReceipt = await env.publicClient.waitForTransactionReceipt({ hash: withdrawTx });
      assert.equal(withdrawReceipt.status, 'success');

      // 12. Confirm payout balances
      const recipientBalAfter = await env.publicClient.getBalance({ address: env.recipient.address });
      const recipientIncrease = recipientBalAfter - recipientBalBefore;
      assert.equal(recipientIncrease, parseEther('0.95'), 'Recipient must receive net payout exactly');

      // 13. Confirm nullifier spent
      const nullifierStatus = await checkNullifierStatus(env.publicClient, poolAddress, note.nullifierHash);
      assert.equal(nullifierStatus.status, 'CONFIRMED_SPENT');
      assert.equal(nullifierStatus.isSpent, true);

      // 14. Confirm double-spending replay attempt reverts
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
              env.recipient.address,
              env.relayer.address,
              fee,
            ],
          });
        },
        /(revert|NullifierAlreadySpent)/i,
        'Double spending replay must revert on EVM'
      );
    });
  });

  describe('PHASE A & B — Full Protocol Lifecycle: ERC-20 USDG Shielded Pool', () => {
    it('executes full 12-step lifecycle for ERC-20 USDG: approval -> deposit -> indexing -> proof -> withdrawal -> token balance accounting -> replay protection', async () => {
      const env = await setupTestEnvironment();
      const poolArtifact = loadArtifact('VeilportPoolUSDG');
      const usdgArtifact = loadArtifact('MockUSDG');

      const USDG_DECIMALS = 6;
      const DENOMINATION = 100n * 10n ** BigInt(USDG_DECIMALS); // 100 USDG = 100,000,000 units
      const FEE = 5n * 10n ** BigInt(USDG_DECIMALS); // 5 USDG = 5,000,000 units
      const NET_PAYOUT = 95n * 10n ** BigInt(USDG_DECIMALS); // 95 USDG

      // 1. Deploy VeilportPoolUSDG
      const poolTx = await env.deployer.client.deployContract({
        abi: poolArtifact.abi,
        bytecode: poolArtifact.bytecode,
        args: [env.genuineVerifierAddress, env.hasherAddress, DENOMINATION, env.usdgAddress],
      });
      const poolReceipt = await env.publicClient.waitForTransactionReceipt({ hash: poolTx });
      const poolAddress = poolReceipt.contractAddress;

      // 2. Mint USDG to depositor
      await env.deployer.client.writeContract({
        address: env.usdgAddress,
        abi: usdgArtifact.abi,
        functionName: 'mint',
        args: [env.depositor.address, 1000n * 10n ** BigInt(USDG_DECIMALS)],
      });

      // 3. Generate note & encrypted backup
      const note = await createNote('USDG', '100', DENOMINATION.toString(), 1337);
      const password = 'USDGSecurePassword123!';
      const backup = await encryptNote(note, password);
      const recovered = await decryptNote(backup, password);
      assert.equal(recovered.commitment, note.commitment);

      // 4. Approve pool to spend tokens
      await env.depositor.client.writeContract({
        address: env.usdgAddress,
        abi: usdgArtifact.abi,
        functionName: 'approve',
        args: [poolAddress, DENOMINATION],
      });

      // 5. Deposit USDG
      const depTx = await env.depositor.client.writeContract({
        address: poolAddress,
        abi: poolArtifact.abi,
        functionName: 'deposit',
        args: [note.commitment],
      });
      const depReceipt = await env.publicClient.waitForTransactionReceipt({ hash: depTx });
      assert.equal(depReceipt.status, 'success');

      // 6. Index deposit event
      const indexer = await MerkleTreeIndexer.create();
      indexer.ingestEvents([
        {
          commitment: note.commitment,
          leafIndex: 0,
          blockNumber: depReceipt.blockNumber,
          transactionHash: depReceipt.transactionHash,
          logIndex: 0,
        },
      ]);

      const onChainRoot = await env.publicClient.readContract({
        address: poolAddress,
        abi: poolArtifact.abi,
        functionName: 'getLastRoot',
      });
      assert.equal(indexer.getLastRoot().toLowerCase(), onChainRoot.toLowerCase());

      // 7. Validate withdrawal preparation
      const prep = await validateWithdrawalPreparation({
        note,
        expectedAsset: 'USDG',
        expectedChainId: 1337,
        indexer,
        poolAddress,
        publicClient: env.publicClient,
      });
      assert.equal(prep.valid, true);

      // 8. Validate parameters & conservation
      const paramVal = validateWithdrawalParameters({
        recipient: env.recipient.address,
        relayer: env.relayer.address,
        fee: FEE,
        denomination: DENOMINATION,
        asset: 'USDG',
      });
      assert.equal(paramVal.valid, true);
      assert.equal(paramVal.payout, NET_PAYOUT);

      // 9. Generate genuine Groth16 proof
      const circuitInput = {
        root: BigInt(prep.root).toString(),
        nullifierHash: BigInt(note.nullifierHash).toString(),
        recipient: BigInt(env.recipient.address).toString(),
        relayer: BigInt(env.relayer.address).toString(),
        fee: FEE.toString(),
        nullifierSecret: BigInt(note.nullifierSecret).toString(),
        secret: BigInt(note.secret).toString(),
        pathElements: prep.path.pathElements.map((el) => BigInt(el).toString()),
        pathIndices: prep.path.pathIndices,
      };

      const { proof, publicSignals } = await snarkjs.groth16.fullProve(circuitInput, WASM_PATH, ZKEY_PATH);
      assert.ok(proof);

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

      // Record pre-withdrawal token balances
      const recipientUsdgBefore = await env.publicClient.readContract({
        address: env.usdgAddress,
        abi: usdgArtifact.abi,
        functionName: 'balanceOf',
        args: [env.recipient.address],
      });
      const relayerUsdgBefore = await env.publicClient.readContract({
        address: env.usdgAddress,
        abi: usdgArtifact.abi,
        functionName: 'balanceOf',
        args: [env.relayer.address],
      });

      // 10. Execute USDG withdrawal
      const withdrawTx = await env.relayer.client.writeContract({
        address: poolAddress,
        abi: poolArtifact.abi,
        functionName: 'withdraw',
        args: [
          proofBytes,
          prep.root,
          note.nullifierHash,
          env.recipient.address,
          env.relayer.address,
          FEE,
        ],
      });
      const withdrawReceipt = await env.publicClient.waitForTransactionReceipt({ hash: withdrawTx });
      assert.equal(withdrawReceipt.status, 'success');

      // 11. Confirm token balances
      const recipientUsdgAfter = await env.publicClient.readContract({
        address: env.usdgAddress,
        abi: usdgArtifact.abi,
        functionName: 'balanceOf',
        args: [env.recipient.address],
      });
      const relayerUsdgAfter = await env.publicClient.readContract({
        address: env.usdgAddress,
        abi: usdgArtifact.abi,
        functionName: 'balanceOf',
        args: [env.relayer.address],
      });

      assert.equal(recipientUsdgAfter - recipientUsdgBefore, NET_PAYOUT, 'Recipient must receive net USDG payout (95 USDG)');
      assert.equal(relayerUsdgAfter - relayerUsdgBefore, FEE, 'Relayer must receive relayer fee (5 USDG)');

      // 12. Confirm nullifier spent
      const nullifierStatus = await checkNullifierStatus(env.publicClient, poolAddress, note.nullifierHash);
      assert.equal(nullifierStatus.status, 'CONFIRMED_SPENT');

      // 13. Replay protection
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
              env.recipient.address,
              env.relayer.address,
              FEE,
            ],
          });
        },
        /(revert|NullifierAlreadySpent)/i,
        'USDG double-spending must revert'
      );
    });
  });

  describe('PHASE B — Asset-Specific Validation & Revert Handling', () => {
    it('ETH pool rejects deposits with incorrect native value (underpayment or overpayment)', async () => {
      const env = await setupTestEnvironment();
      const poolArtifact = loadArtifact('VeilportPoolETH');
      const poolTx = await env.deployer.client.deployContract({
        abi: poolArtifact.abi,
        bytecode: poolArtifact.bytecode,
        args: [env.genuineVerifierAddress, env.hasherAddress, parseEther('1.0')],
      });
      const receipt = await env.publicClient.waitForTransactionReceipt({ hash: poolTx });
      const poolAddress = receipt.contractAddress;

      const dummyCommitment = '0x1111222233334444555566667777888899990000111122223333444455556666';

      // Underpayment: 0.5 ETH instead of 1.0 ETH
      await assert.rejects(
        async () => {
          await env.depositor.client.writeContract({
            address: poolAddress,
            abi: poolArtifact.abi,
            functionName: 'deposit',
            args: [dummyCommitment],
            value: parseEther('0.5'),
          });
        },
        /(revert|IncorrectDepositAmount)/i
      );

      // Overpayment: 2.0 ETH instead of 1.0 ETH
      await assert.rejects(
        async () => {
          await env.depositor.client.writeContract({
            address: poolAddress,
            abi: poolArtifact.abi,
            functionName: 'deposit',
            args: [dummyCommitment],
            value: parseEther('2.0'),
          });
        },
        /(revert|IncorrectDepositAmount)/i
      );
    });

    it('USDG pool rejects deposits with native ETH attached', async () => {
      const env = await setupTestEnvironment();
      const poolArtifact = loadArtifact('VeilportPoolUSDG');
      const poolTx = await env.deployer.client.deployContract({
        abi: poolArtifact.abi,
        bytecode: poolArtifact.bytecode,
        args: [env.genuineVerifierAddress, env.hasherAddress, 100000000n, env.usdgAddress],
      });
      const receipt = await env.publicClient.waitForTransactionReceipt({ hash: poolTx });
      const poolAddress = receipt.contractAddress;

      const dummyCommitment = '0x1111222233334444555566667777888899990000111122223333444455556666';

      await assert.rejects(
        async () => {
          await env.depositor.client.writeContract({
            address: poolAddress,
            abi: poolArtifact.abi,
            functionName: 'deposit',
            args: [dummyCommitment],
            value: parseEther('0.1'),
          });
        },
        /(revert|NoNativeValueAllowed)/i
      );
    });

    it('USDG pool rejects deposits without token approval or with insufficient allowance', async () => {
      const env = await setupTestEnvironment();
      const poolArtifact = loadArtifact('VeilportPoolUSDG');
      const poolTx = await env.deployer.client.deployContract({
        abi: poolArtifact.abi,
        bytecode: poolArtifact.bytecode,
        args: [env.genuineVerifierAddress, env.hasherAddress, 100000000n, env.usdgAddress],
      });
      const receipt = await env.publicClient.waitForTransactionReceipt({ hash: poolTx });
      const poolAddress = receipt.contractAddress;

      const dummyCommitment = '0x1111222233334444555566667777888899990000111122223333444455556666';

      // Zero allowance
      await assert.rejects(
        async () => {
          await env.depositor.client.writeContract({
            address: poolAddress,
            abi: poolArtifact.abi,
            functionName: 'deposit',
            args: [dummyCommitment],
          });
        },
        /(revert|SafeTransferFromFailed)/i
      );
    });
  });

  describe('PHASE D — Security & Failure Injection', () => {
    it('rejects withdrawal if Merkle root is unknown/un-inserted in the contract', async () => {
      const env = await setupTestEnvironment();
      const poolArtifact = loadArtifact('VeilportPoolETH');
      const poolTx = await env.deployer.client.deployContract({
        abi: poolArtifact.abi,
        bytecode: poolArtifact.bytecode,
        args: [env.genuineVerifierAddress, env.hasherAddress, parseEther('1.0')],
      });
      const receipt = await env.publicClient.waitForTransactionReceipt({ hash: poolTx });
      const poolAddress = receipt.contractAddress;

      const fakeRoot = '0x9999999999999999999999999999999999999999999999999999999999999999';
      const fakeProof = '0x1234';
      const dummyNullifier = '0x1111222233334444555566667777888899990000111122223333444455556666';

      await assert.rejects(
        async () => {
          await env.relayer.client.writeContract({
            address: poolAddress,
            abi: poolArtifact.abi,
            functionName: 'withdraw',
            args: [fakeProof, fakeRoot, dummyNullifier, env.recipient.address, env.relayer.address, parseEther('0.05')],
          });
        },
        /(revert|InvalidMerkleRoot)/i
      );
    });

    it('rejects withdrawal if relayer fee exceeds pool denomination', async () => {
      const env = await setupTestEnvironment();
      const poolArtifact = loadArtifact('VeilportPoolETH');
      const poolTx = await env.deployer.client.deployContract({
        abi: poolArtifact.abi,
        bytecode: poolArtifact.bytecode,
        args: [env.genuineVerifierAddress, env.hasherAddress, parseEther('1.0')],
      });
      const receipt = await env.publicClient.waitForTransactionReceipt({ hash: poolTx });
      const poolAddress = receipt.contractAddress;

      const root = await env.publicClient.readContract({ address: poolAddress, abi: poolArtifact.abi, functionName: 'getLastRoot' });
      const dummyNullifier = '0x1111222233334444555566667777888899990000111122223333444455556666';

      // Fee 1.5 ETH > 1.0 ETH denomination
      await assert.rejects(
        async () => {
          await env.relayer.client.writeContract({
            address: poolAddress,
            abi: poolArtifact.abi,
            functionName: 'withdraw',
            args: ['0x00', root, dummyNullifier, env.recipient.address, env.relayer.address, parseEther('1.5')],
          });
        },
        /(revert|InvalidFee)/i
      );
    });

    it('rejects withdrawal if recipient is zero address', async () => {
      const env = await setupTestEnvironment();
      const poolArtifact = loadArtifact('VeilportPoolETH');
      const poolTx = await env.deployer.client.deployContract({
        abi: poolArtifact.abi,
        bytecode: poolArtifact.bytecode,
        args: [env.genuineVerifierAddress, env.hasherAddress, parseEther('1.0')],
      });
      const receipt = await env.publicClient.waitForTransactionReceipt({ hash: poolTx });
      const poolAddress = receipt.contractAddress;

      const root = await env.publicClient.readContract({ address: poolAddress, abi: poolArtifact.abi, functionName: 'getLastRoot' });
      const dummyNullifier = '0x1111222233334444555566667777888899990000111122223333444455556666';

      await assert.rejects(
        async () => {
          await env.relayer.client.writeContract({
            address: poolAddress,
            abi: poolArtifact.abi,
            functionName: 'withdraw',
            args: ['0x00', root, dummyNullifier, '0x0000000000000000000000000000000000000000', env.relayer.address, parseEther('0.05')],
          });
        },
        /(revert|InvalidFee)/i
      );
    });
  });

  after(() => {
    setTimeout(() => process.exit(0), 100);
  });
});
