const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const { parseEther, encodeAbiParameters, parseAbiParameters } = require('viem');
const snarkjs = require('snarkjs');
const path = require('path');
const { setupTestEnvironment } = require('./test-helpers');

const WASM_PATH = path.resolve(__dirname, '../build/withdraw_js/withdraw.wasm');
const ZKEY_PATH = path.resolve(__dirname, '../build/withdraw_final.zkey');
const VKEY_PATH = path.resolve(__dirname, '../build/verification_key.json');

describe('Genuine Groth16 zk-SNARK End-to-End Pipeline & Adversarial Proof Tests', () => {
  let env;
  let poolETHAddress;
  let poolUSDGAddress;
  let ethArtifact;
  let usdgArtifact;
  let zeros = [];

  it('deploys pools bound to genuine Groth16 verifier and reads Merkle tree zero values', async () => {
    env = await setupTestEnvironment();
    ethArtifact = env.loadArtifact('VeilportPoolETH');
    usdgArtifact = env.loadArtifact('VeilportPoolUSDG');

    // 1. Deploy native ETH pool with GENUINE Groth16 Verifier
    const ethTx = await env.deployer.client.deployContract({
      abi: ethArtifact.abi,
      bytecode: ethArtifact.bytecode,
      args: [env.genuineVerifierAddress, env.hasherAddress, parseEther('1.0')],
    });
    const ethReceipt = await env.publicClient.waitForTransactionReceipt({ hash: ethTx });
    poolETHAddress = ethReceipt.contractAddress;

    // 2. Deploy USDG pool with GENUINE Groth16 Verifier and 6 decimals denomination (100 USDG)
    const denominationUSDG = 100n * 10n ** 6n; // 100 USDG in 6 decimals
    const usdgTx = await env.deployer.client.deployContract({
      abi: usdgArtifact.abi,
      bytecode: usdgArtifact.bytecode,
      args: [env.genuineVerifierAddress, env.hasherAddress, denominationUSDG, env.usdgAddress],
    });
    const usdgReceipt = await env.publicClient.waitForTransactionReceipt({ hash: usdgTx });
    poolUSDGAddress = usdgReceipt.contractAddress;

    // Read precomputed zeros
    for (let i = 0; i < 20; i++) {
      const z = await env.publicClient.readContract({
        address: poolETHAddress,
        abi: ethArtifact.abi,
        functionName: 'zeros',
        args: [i],
      });
      zeros.push(BigInt(z).toString());
    }

    assert.equal(zeros.length, 20);
    assert.ok(poolETHAddress);
    assert.ok(poolUSDGAddress);
  });

  after(async () => {
    if (env && env.provider && env.provider.disconnect) {
      await env.provider.disconnect();
    }
    setTimeout(() => process.exit(0), 100);
  });

  it('CASE 1: generates genuine proof for valid note & Merkle path, executes on-chain ETH withdrawal', async () => {
    const F = env.poseidon.F;
    const nullifierSecret = 11112222333344445555n;
    const secret = 66667777888899990000n;
    const commitment = F.toObject(env.poseidon([nullifierSecret, secret]));
    const nullifierHash = F.toObject(env.poseidon([nullifierSecret]));

    // Deposit 1 ETH into ETH pool
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

    const recipient = env.recipient.address;
    const relayer = env.relayer.address;
    const fee = parseEther('0.05');

    const circuitInput = {
      root: BigInt(root).toString(),
      nullifierHash: nullifierHash.toString(),
      recipient: BigInt(recipient).toString(),
      relayer: BigInt(relayer).toString(),
      fee: fee.toString(),
      nullifierSecret: nullifierSecret.toString(),
      secret: secret.toString(),
      pathElements: zeros,
      pathIndices: Array(20).fill(0),
    };

    // 1. Generate real witness & Groth16 proof
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(circuitInput, WASM_PATH, ZKEY_PATH);

    // 2. Off-chain verification check
    const vKey = require(VKEY_PATH);
    const isOffchainValid = await snarkjs.groth16.verify(vKey, publicSignals, proof);
    assert.equal(isOffchainValid, true, 'Cryptographic proof must be valid off-chain');

    // 3. Format proof as ABI encoded bytes: (uint[2] a, uint[2][2] b, uint[2] c)
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

    // 4. On-chain withdrawal
    const tx = await env.relayer.client.writeContract({
      address: poolETHAddress,
      abi: ethArtifact.abi,
      functionName: 'withdraw',
      args: [
        proofBytes,
        root,
        '0x' + nullifierHash.toString(16).padStart(64, '0'),
        recipient,
        relayer,
        fee,
      ],
    });
    const receipt = await env.publicClient.waitForTransactionReceipt({ hash: tx });
    assert.equal(receipt.status, 'success', 'On-chain withdrawal with genuine Groth16 proof must succeed');

    const isSpent = await env.publicClient.readContract({
      address: poolETHAddress,
      abi: ethArtifact.abi,
      functionName: 'nullifierSpent',
      args: ['0x' + nullifierHash.toString(16).padStart(64, '0')],
    });
    assert.equal(isSpent, true, 'Nullifier must be marked spent on-chain');
  });

  it('CASE 2: rejects witness calculation with incorrect secret or nullifier secret', async () => {
    const F = env.poseidon.F;
    const nullifierSecret = 123456789n;
    const secret = 987654321n;
    const commitment = F.toObject(env.poseidon([nullifierSecret, secret]));
    const nullifierHash = F.toObject(env.poseidon([nullifierSecret]));

    // Asserting commitment into Merkle tree root calculation
    let currentHash = commitment;
    for (let i = 0; i < 20; i++) {
      currentHash = F.toObject(env.poseidon([currentHash, BigInt(zeros[i])]));
    }
    const root = currentHash;

    // Witness with wrong secret (circuit constraint failure: root !== computedRoot)
    const invalidInput = {
      root: root.toString(),
      nullifierHash: nullifierHash.toString(),
      recipient: BigInt(env.recipient.address).toString(),
      relayer: BigInt(env.relayer.address).toString(),
      fee: '0',
      nullifierSecret: nullifierSecret.toString(),
      secret: (secret + 1n).toString(), // Altered secret!
      pathElements: zeros,
      pathIndices: Array(20).fill(0),
    };

    await assert.rejects(
      async () => {
        await snarkjs.groth16.fullProve(invalidInput, WASM_PATH, ZKEY_PATH);
      },
      /Error in template MerkleTreeInclusionChecker|Assert Failed/i,
      'Circuit constraint root === currentHash[levels] must reject incorrect secret at witness stage'
    );
  });

  it('CASE 3: rejects witness calculation with incorrect nullifier hash', async () => {
    const F = env.poseidon.F;
    const nullifierSecret = 123456789n;
    const secret = 987654321n;
    const commitment = F.toObject(env.poseidon([nullifierSecret, secret]));

    let currentHash = commitment;
    for (let i = 0; i < 20; i++) {
      currentHash = F.toObject(env.poseidon([currentHash, BigInt(zeros[i])]));
    }
    const root = currentHash;

    const invalidInput = {
      root: root.toString(),
      nullifierHash: '9999999999', // Incorrect nullifier hash!
      recipient: BigInt(env.recipient.address).toString(),
      relayer: BigInt(env.relayer.address).toString(),
      fee: '0',
      nullifierSecret: nullifierSecret.toString(),
      secret: secret.toString(),
      pathElements: zeros,
      pathIndices: Array(20).fill(0),
    };

    await assert.rejects(
      async () => {
        await snarkjs.groth16.fullProve(invalidInput, WASM_PATH, ZKEY_PATH);
      },
      /Error in template Withdraw|Assert Failed/i,
      'Circuit constraint nullifierHash === nullifierHasher.out must reject incorrect nullifierHash'
    );
  });

  it('CASE 4: prevents parameter hijacking: proof generated for recipient A fails verification for recipient B', async () => {
    const F = env.poseidon.F;
    const nullifierSecret = 5555555555n;
    const secret = 6666666666n;
    const commitment = F.toObject(env.poseidon([nullifierSecret, secret]));
    const nullifierHash = F.toObject(env.poseidon([nullifierSecret]));

    let currentHash = commitment;
    for (let i = 0; i < 20; i++) {
      currentHash = F.toObject(env.poseidon([currentHash, BigInt(zeros[i])]));
    }
    const root = currentHash;

    // Generate valid proof specifically for env.recipient.address
    const circuitInput = {
      root: root.toString(),
      nullifierHash: nullifierHash.toString(),
      recipient: BigInt(env.recipient.address).toString(),
      relayer: BigInt(env.relayer.address).toString(),
      fee: '0',
      nullifierSecret: nullifierSecret.toString(),
      secret: secret.toString(),
      pathElements: zeros,
      pathIndices: Array(20).fill(0),
    };

    const { proof, publicSignals } = await snarkjs.groth16.fullProve(circuitInput, WASM_PATH, ZKEY_PATH);

    // Cryptographic verification test: verify with substituted recipient (Attacker)
    const tamperedSignals = [...publicSignals];
    tamperedSignals[2] = BigInt(env.attacker.address).toString(); // Substituted recipient!

    const vKey = require(VKEY_PATH);
    const isTamperedValid = await snarkjs.groth16.verify(vKey, tamperedSignals, proof);
    assert.equal(isTamperedValid, false, 'Altered recipient public signal must fail Groth16 cryptographic verification');
  });

  it('CASE 5: USDG 6-decimal pool deposit, genuine proof, and payout conservation', async () => {
    const F = env.poseidon.F;
    const nullifierSecret = 7777777777n;
    const secret = 8888888888n;
    const commitment = F.toObject(env.poseidon([nullifierSecret, secret]));
    const nullifierHash = F.toObject(env.poseidon([nullifierSecret]));

    const denominationUSDG = 100n * 10n ** 6n; // 100 USDG in 6 decimals
    const feeUSDG = 5n * 10n ** 6n; // 5 USDG relayer fee

    // Mint and approve USDG to depositor
    const usdgArtifact = env.loadArtifact('MockUSDG');
    await env.deployer.client.writeContract({
      address: env.usdgAddress,
      abi: usdgArtifact.abi,
      functionName: 'mint',
      args: [env.depositor.address, denominationUSDG],
    });
    await env.depositor.client.writeContract({
      address: env.usdgAddress,
      abi: usdgArtifact.abi,
      functionName: 'approve',
      args: [poolUSDGAddress, denominationUSDG],
    });

    // Deposit 100 USDG into USDG pool
    await env.depositor.client.writeContract({
      address: poolUSDGAddress,
      abi: env.loadArtifact('VeilportPoolUSDG').abi,
      functionName: 'deposit',
      args: ['0x' + commitment.toString(16).padStart(64, '0')],
    });

    const root = await env.publicClient.readContract({
      address: poolUSDGAddress,
      abi: env.loadArtifact('VeilportPoolUSDG').abi,
      functionName: 'getLastRoot',
    });

    const circuitInput = {
      root: BigInt(root).toString(),
      nullifierHash: nullifierHash.toString(),
      recipient: BigInt(env.recipient.address).toString(),
      relayer: BigInt(env.relayer.address).toString(),
      fee: feeUSDG.toString(),
      nullifierSecret: nullifierSecret.toString(),
      secret: secret.toString(),
      pathElements: zeros,
      pathIndices: Array(20).fill(0),
    };

    const { proof } = await snarkjs.groth16.fullProve(circuitInput, WASM_PATH, ZKEY_PATH);

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

    const recipientBalBefore = await env.publicClient.readContract({
      address: env.usdgAddress,
      abi: usdgArtifact.abi,
      functionName: 'balanceOf',
      args: [env.recipient.address],
    });

    const relayerBalBefore = await env.publicClient.readContract({
      address: env.usdgAddress,
      abi: usdgArtifact.abi,
      functionName: 'balanceOf',
      args: [env.relayer.address],
    });

    // Execute genuine Groth16 USDG withdrawal on-chain
    await env.relayer.client.writeContract({
      address: poolUSDGAddress,
      abi: env.loadArtifact('VeilportPoolUSDG').abi,
      functionName: 'withdraw',
      args: [
        proofBytes,
        root,
        '0x' + nullifierHash.toString(16).padStart(64, '0'),
        env.recipient.address,
        env.relayer.address,
        feeUSDG,
      ],
    });

    const recipientBalAfter = await env.publicClient.readContract({
      address: env.usdgAddress,
      abi: usdgArtifact.abi,
      functionName: 'balanceOf',
      args: [env.recipient.address],
    });

    const relayerBalAfter = await env.publicClient.readContract({
      address: env.usdgAddress,
      abi: usdgArtifact.abi,
      functionName: 'balanceOf',
      args: [env.relayer.address],
    });

    assert.equal(
      recipientBalAfter - recipientBalBefore,
      denominationUSDG - feeUSDG,
      'Recipient must receive exact 95 USDG (6 decimals)'
    );
    assert.equal(
      relayerBalAfter - relayerBalBefore,
      feeUSDG,
      'Relayer must receive exact 5 USDG (6 decimals)'
    );
  });
});
