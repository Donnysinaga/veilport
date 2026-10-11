const { describe, it, before } = require('node:test');
const assert = require('node:assert');
const { parseEther, padHex, toHex } = require('viem');
const { setupTestEnvironment, loadArtifact } = require('./test-helpers');

describe('VeilportPoolETH — Native Ether Shielded Pool', () => {
  let env;
  let poolAddress;
  let poolArtifact;
  let verifierArtifact;
  const DENOMINATION = parseEther('1.0'); // 1 ETH fixed denomination

  before(async () => {
    env = await setupTestEnvironment();
    poolArtifact = loadArtifact('VeilportPoolETH');
    verifierArtifact = loadArtifact('MockVerifier');

    const poolTx = await env.deployer.client.deployContract({
      abi: poolArtifact.abi,
      bytecode: poolArtifact.bytecode,
      args: [env.verifierAddress, env.hasherAddress, DENOMINATION],
    });
    const receipt = await env.publicClient.waitForTransactionReceipt({ hash: poolTx });
    poolAddress = receipt.contractAddress;
  });

  it('correctly initializes the pool parameters', async () => {
    const denom = await env.publicClient.readContract({
      address: poolAddress,
      abi: poolArtifact.abi,
      functionName: 'denomination',
    });
    const verifier = await env.publicClient.readContract({
      address: poolAddress,
      abi: poolArtifact.abi,
      functionName: 'verifier',
    });
    const nextIndex = await env.publicClient.readContract({
      address: poolAddress,
      abi: poolArtifact.abi,
      functionName: 'nextIndex',
    });

    assert.strictEqual(denom, DENOMINATION);
    assert.strictEqual(verifier.toLowerCase(), env.verifierAddress.toLowerCase());
    assert.strictEqual(nextIndex, 0);
  });

  it('accepts valid deposit and inserts commitment into Merkle tree', async () => {
    const commitment = padHex(toHex(123456789n), { size: 32 });

    const tx = await env.depositor.client.writeContract({
      address: poolAddress,
      abi: poolArtifact.abi,
      functionName: 'deposit',
      args: [commitment],
      value: DENOMINATION,
    });
    const receipt = await env.publicClient.waitForTransactionReceipt({ hash: tx });
    assert.strictEqual(receipt.status, 'success');

    const nextIndex = await env.publicClient.readContract({
      address: poolAddress,
      abi: poolArtifact.abi,
      functionName: 'nextIndex',
    });
    assert.strictEqual(nextIndex, 1);

    const root = await env.publicClient.readContract({
      address: poolAddress,
      abi: poolArtifact.abi,
      functionName: 'getLastRoot',
    });
    const isKnown = await env.publicClient.readContract({
      address: poolAddress,
      abi: poolArtifact.abi,
      functionName: 'isKnownRoot',
      args: [root],
    });

    assert.strictEqual(isKnown, true, 'New root must be recognized in active historical root buffer');
  });

  it('rejects deposit with incorrect ETH value', async () => {
    const commitment = padHex(toHex(999111n), { size: 32 });

    await assert.rejects(
      async () => {
        await env.depositor.client.writeContract({
          address: poolAddress,
          abi: poolArtifact.abi,
          functionName: 'deposit',
          args: [commitment],
          value: parseEther('0.5'), // Incorrect value
        });
      },
      /revert/i,
      'Deposit with incorrect value must revert'
    );
  });

  it('rejects deposit with commitment exceeding BN254 scalar field modulus', async () => {
    const FIELD_SIZE = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
    const overflowingCommitment = padHex(toHex(FIELD_SIZE + 1n), { size: 32 });

    await assert.rejects(
      async () => {
        await env.depositor.client.writeContract({
          address: poolAddress,
          abi: poolArtifact.abi,
          functionName: 'deposit',
          args: [overflowingCommitment],
          value: DENOMINATION,
        });
      },
      /revert/i,
      'Commitment exceeding scalar field must revert'
    );
  });

  it('executes valid withdrawal with payout to recipient and fee to relayer', async () => {
    // 1. Make deposit
    const commitment = padHex(toHex(999999n), { size: 32 });
    await env.depositor.client.writeContract({
      address: poolAddress,
      abi: poolArtifact.abi,
      functionName: 'deposit',
      args: [commitment],
      value: DENOMINATION,
    });

    const root = await env.publicClient.readContract({
      address: poolAddress,
      abi: poolArtifact.abi,
      functionName: 'getLastRoot',
    });

    const nullifierHash = padHex(toHex(888888n), { size: 32 });
    const fakeProof = '0x12345678';
    const fee = parseEther('0.05'); // 0.05 ETH relayer fee

    const recipientBalanceBefore = await env.publicClient.getBalance({ address: env.recipient.address });

    // 2. Execute withdrawal
    const tx = await env.relayer.client.writeContract({
      address: poolAddress,
      abi: poolArtifact.abi,
      functionName: 'withdraw',
      args: [fakeProof, root, nullifierHash, env.recipient.address, env.relayer.address, fee],
    });
    const receipt = await env.publicClient.waitForTransactionReceipt({ hash: tx });
    assert.strictEqual(receipt.status, 'success');

    // 3. Verify nullifier marked spent
    const isSpent = await env.publicClient.readContract({
      address: poolAddress,
      abi: poolArtifact.abi,
      functionName: 'nullifierSpent',
      args: [nullifierHash],
    });
    assert.strictEqual(isSpent, true);

    // 4. Verify recipient balance received net payout
    const recipientBalanceAfter = await env.publicClient.getBalance({ address: env.recipient.address });
    const expectedPayout = DENOMINATION - fee;
    assert.strictEqual(
      recipientBalanceAfter - recipientBalanceBefore,
      expectedPayout,
      'Recipient must receive exact net payout (denomination - fee)'
    );
  });

  it('prevents double spending: rejects reuse of spent nullifier', async () => {
    const root = await env.publicClient.readContract({
      address: poolAddress,
      abi: poolArtifact.abi,
      functionName: 'getLastRoot',
    });

    const alreadySpentNullifier = padHex(toHex(888888n), { size: 32 }); // Spent in previous test
    const fakeProof = '0x1234';

    await assert.rejects(
      async () => {
        await env.relayer.client.writeContract({
          address: poolAddress,
          abi: poolArtifact.abi,
          functionName: 'withdraw',
          args: [fakeProof, root, alreadySpentNullifier, env.recipient.address, env.relayer.address, 0n],
        });
      },
      /revert/i,
      'Reusing spent nullifier must revert'
    );
  });

  it('rejects withdrawal asserting an unknown or fabricated Merkle root', async () => {
    const unknownRoot = padHex(toHex(0xbadf00dn), { size: 32 });
    const nullifierHash = padHex(toHex(222222n), { size: 32 });

    await assert.rejects(
      async () => {
        await env.relayer.client.writeContract({
          address: poolAddress,
          abi: poolArtifact.abi,
          functionName: 'withdraw',
          args: ['0x1234', unknownRoot, nullifierHash, env.recipient.address, env.relayer.address, 0n],
        });
      },
      /revert/i,
      'Withdrawal with unknown Merkle root must revert'
    );
  });

  it('rejects withdrawal if the zero-knowledge proof verification fails', async () => {
    const root = await env.publicClient.readContract({
      address: poolAddress,
      abi: poolArtifact.abi,
      functionName: 'getLastRoot',
    });

    // Configure mock verifier to reject proofs
    await env.deployer.client.writeContract({
      address: env.verifierAddress,
      abi: verifierArtifact.abi,
      functionName: 'setShouldPass',
      args: [false],
    });

    const nullifierHash = padHex(toHex(444444n), { size: 32 });

    await assert.rejects(
      async () => {
        await env.relayer.client.writeContract({
          address: poolAddress,
          abi: poolArtifact.abi,
          functionName: 'withdraw',
          args: ['0x1234', root, nullifierHash, env.recipient.address, env.relayer.address, 0n],
        });
      },
      /revert/i,
      'Withdrawal with failing ZK proof must revert'
    );

    // Restore verifier to pass for subsequent tests
    await env.deployer.client.writeContract({
      address: env.verifierAddress,
      abi: verifierArtifact.abi,
      functionName: 'setShouldPass',
      args: [true],
    });
  });

  it('rejects withdrawal with excessive relayer fee exceeding pool denomination', async () => {
    const root = await env.publicClient.readContract({
      address: poolAddress,
      abi: poolArtifact.abi,
      functionName: 'getLastRoot',
    });

    const nullifierHash = padHex(toHex(666666n), { size: 32 });
    const excessiveFee = parseEther('1.5'); // Exceeds 1.0 ETH denomination

    await assert.rejects(
      async () => {
        await env.relayer.client.writeContract({
          address: poolAddress,
          abi: poolArtifact.abi,
          functionName: 'withdraw',
          args: ['0x1234', root, nullifierHash, env.recipient.address, env.relayer.address, excessiveFee],
        });
      },
      /revert/i,
      'Relayer fee greater than denomination must revert'
    );
  });

  it('enforces access control: pausing and unauthorized operations', async () => {
    // Non-owner cannot pause
    await assert.rejects(
      async () => {
        await env.attacker.client.writeContract({
          address: poolAddress,
          abi: poolArtifact.abi,
          functionName: 'pause',
        });
      },
      /revert/i,
      'Non-owner pause attempt must revert'
    );

    // Owner pauses
    await env.deployer.client.writeContract({
      address: poolAddress,
      abi: poolArtifact.abi,
      functionName: 'pause',
    });

    const isPaused = await env.publicClient.readContract({
      address: poolAddress,
      abi: poolArtifact.abi,
      functionName: 'paused',
    });
    assert.strictEqual(isPaused, true);

    // Deposits blocked while paused
    const commitment = padHex(toHex(123456n), { size: 32 });
    await assert.rejects(
      async () => {
        await env.depositor.client.writeContract({
          address: poolAddress,
          abi: poolArtifact.abi,
          functionName: 'deposit',
          args: [commitment],
          value: DENOMINATION,
        });
      },
      /revert/i,
      'Deposit while paused must revert'
    );

    // Owner unpauses
    await env.deployer.client.writeContract({
      address: poolAddress,
      abi: poolArtifact.abi,
      functionName: 'unpause',
    });

    // Deposit succeeds after unpause
    const tx = await env.depositor.client.writeContract({
      address: poolAddress,
      abi: poolArtifact.abi,
      functionName: 'deposit',
      args: [commitment],
      value: DENOMINATION,
    });
    const receipt = await env.publicClient.waitForTransactionReceipt({ hash: tx });
    assert.strictEqual(receipt.status, 'success');
  });

  it('preserves historical roots buffer across multiple deposits', async () => {
    const commitments = [101n, 102n, 103n].map((c) => padHex(toHex(c), { size: 32 }));
    const recordedRoots = [];

    for (const c of commitments) {
      await env.depositor.client.writeContract({
        address: poolAddress,
        abi: poolArtifact.abi,
        functionName: 'deposit',
        args: [c],
        value: DENOMINATION,
      });
      const root = await env.publicClient.readContract({
        address: poolAddress,
        abi: poolArtifact.abi,
        functionName: 'getLastRoot',
      });
      recordedRoots.push(root);
    }

    // Every recorded intermediate root must still be recognized by isKnownRoot
    for (const r of recordedRoots) {
      const isKnown = await env.publicClient.readContract({
        address: poolAddress,
        abi: poolArtifact.abi,
        functionName: 'isKnownRoot',
        args: [r],
      });
      assert.strictEqual(isKnown, true, 'Historical intermediate roots must remain valid in buffer');
    }
  });
});
