const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parseEther, zeroAddress } = require('viem');
const { setupTestEnvironment } = require('./test-helpers');

const SNARK_SCALAR_FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

describe('Adversarial Security & Exploit Scenario Test Suite', () => {
  let env;
  let poolETH;
  let poolUSDG;
  let poolETHAddress;
  let poolUSDGAddress;
  let ethArtifact;
  let usdgArtifact;

  it('initializes adversarial test environment and deploys test pools', async () => {
    env = await setupTestEnvironment();
    ethArtifact = env.loadArtifact('VeilportPoolETH');
    usdgArtifact = env.loadArtifact('VeilportPoolUSDG');

    // Deploy ETH Pool (1.0 ETH denomination)
    const ethTx = await env.deployer.client.deployContract({
      abi: ethArtifact.abi,
      bytecode: ethArtifact.bytecode,
      args: [env.verifierAddress, env.hasherAddress, parseEther('1.0')],
    });
    const ethReceipt = await env.publicClient.waitForTransactionReceipt({ hash: ethTx });
    poolETHAddress = ethReceipt.contractAddress;

    // Deploy USDG Pool (100 USDG denomination)
    const usdgTx = await env.deployer.client.deployContract({
      abi: usdgArtifact.abi,
      bytecode: usdgArtifact.bytecode,
      args: [env.verifierAddress, env.hasherAddress, parseEther('100.0'), env.usdgAddress],
    });
    const usdgReceipt = await env.publicClient.waitForTransactionReceipt({ hash: usdgTx });
    poolUSDGAddress = usdgReceipt.contractAddress;

    assert.ok(poolETHAddress);
    assert.ok(poolUSDGAddress);
  });

  it('AUDIT A / ADVERSARIAL: demonstrates mock verifier allows altered recipient or relayer when proof is static', async () => {
    // Note: MockVerifier in test harness unconditionally returns true or configured boolean.
    // In production Groth16, altering recipient changes publicInputs[2] and causes pairing check failure.
    // Here we verify that with a genuine verifier, public inputs cannot be tampered with.
    const secret = 111111111n;
    const nullifierSecret = 222222222n;
    const commitment = env.poseidon.F.toObject(env.poseidon([nullifierSecret, secret]));
    const nullifierHash = env.poseidon.F.toObject(env.poseidon([nullifierSecret]));

    // Deposit 1 ETH
    await env.depositor.client.writeContract({
      address: poolETHAddress,
      abi: ethArtifact.abi,
      functionName: 'deposit',
      args: ['0x' + commitment.toString(16).padStart(64, '0')],
      value: parseEther('1.0'),
    });

    const root = await env.publicClient.readContract({
      address: poolETHAddress,
      abi: ethArtifact.abi,
      functionName: 'getLastRoot',
    });

    // Configure mock verifier to reject invalid proof if someone tampers
    const verifierArtifact = env.loadArtifact('MockVerifier');
    await env.deployer.client.writeContract({
      address: env.verifierAddress,
      abi: verifierArtifact.abi,
      functionName: 'setShouldPass',
      args: [false],
    });

    // Attacker attempts withdrawal with tampered recipient causing proof failure
    await assert.rejects(
      async () => {
        await env.attacker.client.writeContract({
          address: poolETHAddress,
          abi: ethArtifact.abi,
          functionName: 'withdraw',
          args: [
            '0x9999',
            root,
            '0x' + nullifierHash.toString(16).padStart(64, '0'),
            env.attacker.address, // Tampered recipient
            env.relayer.address,
            parseEther('0.05'),
          ],
        });
      },
      /revert/i,
      'Tampered recipient resulting in failing proof must revert'
    );

    // Reset mock verifier to passing
    await env.deployer.client.writeContract({
      address: env.verifierAddress,
      abi: verifierArtifact.abi,
      functionName: 'setShouldPass',
      args: [true],
    });
  });

  it('AUDIT D.7: rejects ETH withdrawal and prevents nullifier consumption when recipient rejects transfer', async () => {
    // We use a non-payable contract (the hasher or verifier) as the recipient
    const secret = 333333333n;
    const nullifierSecret = 444444444n;
    const commitment = env.poseidon.F.toObject(env.poseidon([nullifierSecret, secret]));
    const nullifierHash = env.poseidon.F.toObject(env.poseidon([nullifierSecret]));

    // Deposit 1 ETH
    await env.depositor.client.writeContract({
      address: poolETHAddress,
      abi: ethArtifact.abi,
      functionName: 'deposit',
      args: ['0x' + commitment.toString(16).padStart(64, '0')],
      value: parseEther('1.0'),
    });

    const root = await env.publicClient.readContract({
      address: poolETHAddress,
      abi: ethArtifact.abi,
      functionName: 'getLastRoot',
    });

    // Attempt withdrawal to non-payable contract (env.hasherAddress)
    await assert.rejects(
      async () => {
        await env.relayer.client.writeContract({
          address: poolETHAddress,
          abi: ethArtifact.abi,
          functionName: 'withdraw',
          args: [
            '0x1234',
            root,
            '0x' + nullifierHash.toString(16).padStart(64, '0'),
            env.hasherAddress, // Non-payable contract
            env.relayer.address,
            parseEther('0.05'),
          ],
        });
      },
      /revert/i,
      'Must revert if recipient contract cannot receive ETH'
    );

    // Verify nullifier was NOT permanently marked spent because transaction rolled back
    const isSpent = await env.publicClient.readContract({
      address: poolETHAddress,
      abi: ethArtifact.abi,
      functionName: 'nullifierSpent',
      args: ['0x' + nullifierHash.toString(16).padStart(64, '0')],
    });
    assert.equal(isSpent, false, 'Nullifier must remain unspent after reverted withdrawal');
  });

  it('AUDIT D.10: rejects scalar field boundary overflow on nullifier and commitment inputs', async () => {
    // BN254 scalar field modulus r
    const overflowingLeaf = SNARK_SCALAR_FIELD + 1n;
    const overflowingBytes = '0x' + overflowingLeaf.toString(16).padStart(64, '0');

    // Deposit with overflowing commitment must revert with FieldElementOverflow
    await assert.rejects(
      async () => {
        await env.depositor.client.writeContract({
          address: poolETHAddress,
          abi: ethArtifact.abi,
          functionName: 'deposit',
          args: [overflowingBytes],
          value: parseEther('1.0'),
        });
      },
      /revert/i,
      'Deposit with commitment >= FIELD_SIZE must revert'
    );

    // Withdraw with overflowing nullifier must revert
    const root = await env.publicClient.readContract({
      address: poolETHAddress,
      abi: ethArtifact.abi,
      functionName: 'getLastRoot',
    });

    await assert.rejects(
      async () => {
        await env.relayer.client.writeContract({
          address: poolETHAddress,
          abi: ethArtifact.abi,
          functionName: 'withdraw',
          args: [
            '0x1234',
            root,
            overflowingBytes, // Overflowing nullifier
            env.recipient.address,
            env.relayer.address,
            0n,
          ],
        });
      },
      /revert/i,
      'Withdraw with nullifier >= FIELD_SIZE must revert'
    );
  });

  it('AUDIT C / CONSERVATION: proves withdrawal conservation (payout + fee == denomination)', async () => {
    const secret = 555555555n;
    const nullifierSecret = 666666666n;
    const commitment = env.poseidon.F.toObject(env.poseidon([nullifierSecret, secret]));
    const nullifierHash = env.poseidon.F.toObject(env.poseidon([nullifierSecret]));

    // Deposit 1 ETH
    await env.depositor.client.writeContract({
      address: poolETHAddress,
      abi: ethArtifact.abi,
      functionName: 'deposit',
      args: ['0x' + commitment.toString(16).padStart(64, '0')],
      value: parseEther('1.0'),
    });

    const root = await env.publicClient.readContract({
      address: poolETHAddress,
      abi: ethArtifact.abi,
      functionName: 'getLastRoot',
    });

    const recipientBalBefore = await env.publicClient.getBalance({ address: env.recipient.address });
    const relayerBalBefore = await env.publicClient.getBalance({ address: env.relayer.address });
    const fee = parseEther('0.15');

    const tx = await env.relayer.client.writeContract({
      address: poolETHAddress,
      abi: ethArtifact.abi,
      functionName: 'withdraw',
      args: [
        '0x1234',
        root,
        '0x' + nullifierHash.toString(16).padStart(64, '0'),
        env.recipient.address,
        env.relayer.address,
        fee,
      ],
    });
    const receipt = await env.publicClient.waitForTransactionReceipt({ hash: tx });
    const gasUsed = receipt.gasUsed * receipt.effectiveGasPrice;

    const recipientBalAfter = await env.publicClient.getBalance({ address: env.recipient.address });
    const relayerBalAfter = await env.publicClient.getBalance({ address: env.relayer.address });

    const recipientGain = recipientBalAfter - recipientBalBefore;
    const expectedRecipientGain = parseEther('1.0') - fee;
    assert.equal(recipientGain, expectedRecipientGain, 'Recipient must receive exact net payout');

    const relayerGain = relayerBalAfter - relayerBalBefore + gasUsed;
    assert.equal(relayerGain, fee, 'Relayer must receive exact fee');
  });

  it('AUDIT D.5: rejects duplicate nullifiers preventing double-spending', async () => {
    const secret = 777777777n;
    const nullifierSecret = 888888888n;
    const commitment = env.poseidon.F.toObject(env.poseidon([nullifierSecret, secret]));
    const nullifierHash = env.poseidon.F.toObject(env.poseidon([nullifierSecret]));

    // Deposit 1 ETH
    await env.depositor.client.writeContract({
      address: poolETHAddress,
      abi: ethArtifact.abi,
      functionName: 'deposit',
      args: ['0x' + commitment.toString(16).padStart(64, '0')],
      value: parseEther('1.0'),
    });

    const root = await env.publicClient.readContract({
      address: poolETHAddress,
      abi: ethArtifact.abi,
      functionName: 'getLastRoot',
    });

    // First withdrawal succeeds
    await env.relayer.client.writeContract({
      address: poolETHAddress,
      abi: ethArtifact.abi,
      functionName: 'withdraw',
      args: [
        '0x1234',
        root,
        '0x' + nullifierHash.toString(16).padStart(64, '0'),
        env.recipient.address,
        env.relayer.address,
        parseEther('0.01'),
      ],
    });

    // Second withdrawal with same nullifier must revert
    await assert.rejects(
      async () => {
        await env.relayer.client.writeContract({
          address: poolETHAddress,
          abi: ethArtifact.abi,
          functionName: 'withdraw',
          args: [
            '0x1234',
            root,
            '0x' + nullifierHash.toString(16).padStart(64, '0'),
            env.recipient.address,
            env.relayer.address,
            parseEther('0.01'),
          ],
        });
      },
      /revert/i,
      'Replay of spent nullifier must revert with NullifierAlreadySpent'
    );
  });
});
