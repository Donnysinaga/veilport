const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const { parseEther, encodeAbiParameters, parseAbiParameters } = require('viem');
const snarkjs = require('snarkjs');
const path = require('path');
const { setupTestEnvironment } = require('./test-helpers');

const WASM_PATH = path.resolve(__dirname, '../build/withdraw_js/withdraw.wasm');
const ZKEY_PATH = path.resolve(__dirname, '../build/withdraw_final.zkey');
const VKEY_PATH = path.resolve(__dirname, '../build/verification_key.json');

describe('Genuine Groth16 Adversarial Verification & Merkle Hardening Suite', () => {
  let env;
  let poolETHAddress;
  let poolUSDGAddress;
  let ethArtifact;
  let usdgArtifact;
  let zeros = [];
  let rootIndex0;
  let nullifierHash0;
  let commitment0;
  let genuineProof0;
  let publicSignals0;
  let proofBytes0;

  const nullifierSecret0 = 12345678901234567890n;
  const secret0 = 98765432109876543210n;

  it('initializes genuine Groth16 environment and deploys verified pools', async () => {
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

    // 2. Deploy USDG pool with GENUINE Groth16 Verifier (6 decimals, 100 USDG)
    const denominationUSDG = 100n * 10n ** 6n;
    const usdgTx = await env.deployer.client.deployContract({
      abi: usdgArtifact.abi,
      bytecode: usdgArtifact.bytecode,
      args: [env.genuineVerifierAddress, env.hasherAddress, denominationUSDG, env.usdgAddress],
    });
    const usdgReceipt = await env.publicClient.waitForTransactionReceipt({ hash: usdgTx });
    poolUSDGAddress = usdgReceipt.contractAddress;

    // Read precomputed tree zero values
    for (let i = 0; i < 20; i++) {
      const z = await env.publicClient.readContract({
        address: poolETHAddress,
        abi: ethArtifact.abi,
        functionName: 'zeros',
        args: [i],
      });
      zeros.push(BigInt(z));
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

  it('BASELINE: generates valid Groth16 proof for deposit at index 0', async () => {
    const F = env.poseidon.F;
    commitment0 = F.toObject(env.poseidon([nullifierSecret0, secret0]));
    nullifierHash0 = F.toObject(env.poseidon([nullifierSecret0]));

    // Deposit 1 ETH into ETH pool
    await env.depositor.client.writeContract({
      address: poolETHAddress,
      abi: ethArtifact.abi,
      functionName: 'deposit',
      args: ['0x' + commitment0.toString(16).padStart(64, '0')],
      value: parseEther('1.0'),
    });

    rootIndex0 = await env.publicClient.readContract({
      address: poolETHAddress,
      abi: ethArtifact.abi,
      functionName: 'getLastRoot',
    });

    const circuitInput = {
      root: BigInt(rootIndex0).toString(),
      nullifierHash: nullifierHash0.toString(),
      recipient: BigInt(env.recipient.address).toString(),
      relayer: BigInt(env.relayer.address).toString(),
      fee: parseEther('0.05').toString(),
      nullifierSecret: nullifierSecret0.toString(),
      secret: secret0.toString(),
      pathElements: zeros.map((z) => z.toString()),
      pathIndices: Array(20).fill(0),
    };

    const res = await snarkjs.groth16.fullProve(circuitInput, WASM_PATH, ZKEY_PATH);
    genuineProof0 = res.proof;
    publicSignals0 = res.publicSignals;

    // Off-chain check
    const vKey = require(VKEY_PATH);
    const valid = await snarkjs.groth16.verify(vKey, publicSignals0, genuineProof0);
    assert.equal(valid, true, 'Original proof must be valid off-chain');

    const a = [BigInt(genuineProof0.pi_a[0]), BigInt(genuineProof0.pi_a[1])];
    const b = [
      [BigInt(genuineProof0.pi_b[0][1]), BigInt(genuineProof0.pi_b[0][0])],
      [BigInt(genuineProof0.pi_b[1][1]), BigInt(genuineProof0.pi_b[1][0])],
    ];
    const c = [BigInt(genuineProof0.pi_c[0]), BigInt(genuineProof0.pi_c[1])];

    proofBytes0 = encodeAbiParameters(
      parseAbiParameters('uint256[2], uint256[2][2], uint256[2]'),
      [a, b, c]
    );
  });

  it('AUDIT 2.1: tampering with individual public input signals fails Groth16 cryptographic verification', async () => {
    const vKey = require(VKEY_PATH);

    // 1. Altered Root (publicSignals[0])
    const tamperedRootSignals = [...publicSignals0];
    tamperedRootSignals[0] = (BigInt(publicSignals0[0]) + 1n).toString();
    const isRootValid = await snarkjs.groth16.verify(vKey, tamperedRootSignals, genuineProof0);
    assert.equal(isRootValid, false, 'Altered root must fail Groth16 verification');

    // 2. Altered Nullifier Hash (publicSignals[1])
    const tamperedNullifierSignals = [...publicSignals0];
    tamperedNullifierSignals[1] = (BigInt(publicSignals0[1]) + 1n).toString();
    const isNullifierValid = await snarkjs.groth16.verify(vKey, tamperedNullifierSignals, genuineProof0);
    assert.equal(isNullifierValid, false, 'Altered nullifier hash must fail Groth16 verification');

    // 3. Altered Recipient (publicSignals[2])
    const tamperedRecipientSignals = [...publicSignals0];
    tamperedRecipientSignals[2] = BigInt(env.attacker.address).toString();
    const isRecipientValid = await snarkjs.groth16.verify(vKey, tamperedRecipientSignals, genuineProof0);
    assert.equal(isRecipientValid, false, 'Altered recipient must fail Groth16 verification');

    // 4. Altered Relayer (publicSignals[3])
    const tamperedRelayerSignals = [...publicSignals0];
    tamperedRelayerSignals[3] = BigInt(env.attacker.address).toString();
    const isRelayerValid = await snarkjs.groth16.verify(vKey, tamperedRelayerSignals, genuineProof0);
    assert.equal(isRelayerValid, false, 'Altered relayer must fail Groth16 verification');

    // 5. Altered Fee (publicSignals[4])
    const tamperedFeeSignals = [...publicSignals0];
    tamperedFeeSignals[4] = parseEther('0.10').toString();
    const isFeeValid = await snarkjs.groth16.verify(vKey, tamperedFeeSignals, genuineProof0);
    assert.equal(isFeeValid, false, 'Altered fee must fail Groth16 verification');
  });

  it('AUDIT 2.2: circuit rejects witness calculation on altered Merkle path elements and path directions', async () => {
    // 1. Altered path element
    const alteredPathElements = [...zeros.map((z) => z.toString())];
    alteredPathElements[0] = '9999999999999999';

    const inputAlteredElement = {
      root: BigInt(rootIndex0).toString(),
      nullifierHash: nullifierHash0.toString(),
      recipient: BigInt(env.recipient.address).toString(),
      relayer: BigInt(env.relayer.address).toString(),
      fee: parseEther('0.05').toString(),
      nullifierSecret: nullifierSecret0.toString(),
      secret: secret0.toString(),
      pathElements: alteredPathElements,
      pathIndices: Array(20).fill(0),
    };

    await assert.rejects(
      async () => {
        await snarkjs.groth16.fullProve(inputAlteredElement, WASM_PATH, ZKEY_PATH);
      },
      /Error in template MerkleTreeInclusionChecker|Assert Failed/i,
      'Altered path element must fail constraint check during witness generation'
    );

    // 2. Altered path direction (using 1 instead of 0 at index 0)
    const alteredPathIndices = [1, ...Array(19).fill(0)];
    const inputAlteredDirection = {
      root: BigInt(rootIndex0).toString(),
      nullifierHash: nullifierHash0.toString(),
      recipient: BigInt(env.recipient.address).toString(),
      relayer: BigInt(env.relayer.address).toString(),
      fee: parseEther('0.05').toString(),
      nullifierSecret: nullifierSecret0.toString(),
      secret: secret0.toString(),
      pathElements: zeros.map((z) => z.toString()),
      pathIndices: alteredPathIndices,
    };

    await assert.rejects(
      async () => {
        await snarkjs.groth16.fullProve(inputAlteredDirection, WASM_PATH, ZKEY_PATH);
      },
      /Error in template MerkleTreeInclusionChecker|Assert Failed/i,
      'Altered path direction must fail constraint check during witness generation'
    );

    // 3. Out-of-range path direction (selector s = 2, violating s * (1 - s) === 0)
    const invalidSelectorIndices = [2, ...Array(19).fill(0)];
    const inputInvalidSelector = {
      root: BigInt(rootIndex0).toString(),
      nullifierHash: nullifierHash0.toString(),
      recipient: BigInt(env.recipient.address).toString(),
      relayer: BigInt(env.relayer.address).toString(),
      fee: parseEther('0.05').toString(),
      nullifierSecret: nullifierSecret0.toString(),
      secret: secret0.toString(),
      pathElements: zeros.map((z) => z.toString()),
      pathIndices: invalidSelectorIndices,
    };

    await assert.rejects(
      async () => {
        await snarkjs.groth16.fullProve(inputInvalidSelector, WASM_PATH, ZKEY_PATH);
      },
      /Error in template DualMux|Assert Failed/i,
      'Non-binary path direction selector must fail DualMux constraint'
    );
  });

  it('AUDIT 3: verifies Merkle tree compatibility at non-zero leaf index 1 and executes on-chain withdrawal', async () => {
    const F = env.poseidon.F;
    const nullifierSecret1 = 55555555555n;
    const secret1 = 77777777777n;
    const commitment1 = F.toObject(env.poseidon([nullifierSecret1, secret1]));
    const nullifierHash1 = F.toObject(env.poseidon([nullifierSecret1]));

    // Deposit second leaf (index 1)
    await env.depositor.client.writeContract({
      address: poolETHAddress,
      abi: ethArtifact.abi,
      functionName: 'deposit',
      args: ['0x' + commitment1.toString(16).padStart(64, '0')],
      value: parseEther('1.0'),
    });

    const rootIndex1 = await env.publicClient.readContract({
      address: poolETHAddress,
      abi: ethArtifact.abi,
      functionName: 'getLastRoot',
    });

    // Path for leaf index 1:
    // Level 0: sibling is leaf 0 (commitment0). Direction is 1 (left is c0, right is c1).
    // Levels 1..19: sibling is zeros[i]. Direction is 0.
    const pathElements1 = [commitment0, ...zeros.slice(1)].map((x) => x.toString());
    const pathIndices1 = [1, ...Array(19).fill(0)];

    const circuitInput1 = {
      root: BigInt(rootIndex1).toString(),
      nullifierHash: nullifierHash1.toString(),
      recipient: BigInt(env.recipient.address).toString(),
      relayer: BigInt(env.relayer.address).toString(),
      fee: parseEther('0.03').toString(),
      nullifierSecret: nullifierSecret1.toString(),
      secret: secret1.toString(),
      pathElements: pathElements1,
      pathIndices: pathIndices1,
    };

    const { proof, publicSignals } = await snarkjs.groth16.fullProve(circuitInput1, WASM_PATH, ZKEY_PATH);

    const a = [BigInt(proof.pi_a[0]), BigInt(proof.pi_a[1])];
    const b = [
      [BigInt(proof.pi_b[0][1]), BigInt(proof.pi_b[0][0])],
      [BigInt(proof.pi_b[1][1]), BigInt(proof.pi_b[1][0])],
    ];
    const c = [BigInt(proof.pi_c[0]), BigInt(proof.pi_c[1])];

    const proofBytes1 = encodeAbiParameters(
      parseAbiParameters('uint256[2], uint256[2][2], uint256[2]'),
      [a, b, c]
    );

    // On-chain withdrawal from leaf index 1
    const tx = await env.relayer.client.writeContract({
      address: poolETHAddress,
      abi: ethArtifact.abi,
      functionName: 'withdraw',
      args: [
        proofBytes1,
        rootIndex1,
        '0x' + nullifierHash1.toString(16).padStart(64, '0'),
        env.recipient.address,
        env.relayer.address,
        parseEther('0.03'),
      ],
    });
    const receipt = await env.publicClient.waitForTransactionReceipt({ hash: tx });
    assert.equal(receipt.status, 'success', 'Withdrawal from non-zero leaf index 1 must succeed');

    const isSpent = await env.publicClient.readContract({
      address: poolETHAddress,
      abi: ethArtifact.abi,
      functionName: 'nullifierSpent',
      args: ['0x' + nullifierHash1.toString(16).padStart(64, '0')],
    });
    assert.equal(isSpent, true, 'Nullifier for leaf 1 must be spent');
  });

  it('AUDIT 4.1: on-chain pool rejects tampered recipient with genuine proof without burning nullifier', async () => {
    // Attempt withdrawal where caller passes attacker as recipient, but proofBytes0 was generated for recipient
    await assert.rejects(
      async () => {
        await env.attacker.client.writeContract({
          address: poolETHAddress,
          abi: ethArtifact.abi,
          functionName: 'withdraw',
          args: [
            proofBytes0,
            rootIndex0,
            '0x' + nullifierHash0.toString(16).padStart(64, '0'),
            env.attacker.address, // Tampered recipient!
            env.relayer.address,
            parseEther('0.05'),
          ],
        });
      },
      /revert/i,
      'Pool must revert with InvalidProof when recipient is substituted'
    );

    // Verify nullifier was NOT burned
    const isSpent = await env.publicClient.readContract({
      address: poolETHAddress,
      abi: ethArtifact.abi,
      functionName: 'nullifierSpent',
      args: ['0x' + nullifierHash0.toString(16).padStart(64, '0')],
    });
    assert.equal(isSpent, false, 'Nullifier must remain unspent after reverted invalid proof withdrawal');
  });

  it('AUDIT 4.2: on-chain pool rejects tampered relayer address with genuine proof without burning nullifier', async () => {
    // Attempt withdrawal where caller passes attacker as relayer, but proofBytes0 was generated for env.relayer
    await assert.rejects(
      async () => {
        await env.relayer.client.writeContract({
          address: poolETHAddress,
          abi: ethArtifact.abi,
          functionName: 'withdraw',
          args: [
            proofBytes0,
            rootIndex0,
            '0x' + nullifierHash0.toString(16).padStart(64, '0'),
            env.recipient.address,
            env.attacker.address, // Tampered relayer!
            parseEther('0.05'),
          ],
        });
      },
      /revert/i,
      'Pool must revert with InvalidProof when relayer address is substituted'
    );

    const isSpent = await env.publicClient.readContract({
      address: poolETHAddress,
      abi: ethArtifact.abi,
      functionName: 'nullifierSpent',
      args: ['0x' + nullifierHash0.toString(16).padStart(64, '0')],
    });
    assert.equal(isSpent, false, 'Nullifier must remain unspent after relayer tampering rejection');
  });

  it('AUDIT 4.3: on-chain pool rejects tampered fee amounts with genuine proof without burning nullifier', async () => {
    // 1. Lower fee: caller passes 0.01 ETH instead of proven 0.05 ETH
    await assert.rejects(
      async () => {
        await env.relayer.client.writeContract({
          address: poolETHAddress,
          abi: ethArtifact.abi,
          functionName: 'withdraw',
          args: [
            proofBytes0,
            rootIndex0,
            '0x' + nullifierHash0.toString(16).padStart(64, '0'),
            env.recipient.address,
            env.relayer.address,
            parseEther('0.01'), // Tampered fee!
          ],
        });
      },
      /revert/i,
      'Pool must revert with InvalidProof when fee is reduced'
    );

    // 2. Higher fee: caller passes 0.10 ETH instead of proven 0.05 ETH
    await assert.rejects(
      async () => {
        await env.relayer.client.writeContract({
          address: poolETHAddress,
          abi: ethArtifact.abi,
          functionName: 'withdraw',
          args: [
            proofBytes0,
            rootIndex0,
            '0x' + nullifierHash0.toString(16).padStart(64, '0'),
            env.recipient.address,
            env.relayer.address,
            parseEther('0.10'), // Tampered fee!
          ],
        });
      },
      /revert/i,
      'Pool must revert with InvalidProof when fee is increased'
    );

    const isSpent = await env.publicClient.readContract({
      address: poolETHAddress,
      abi: ethArtifact.abi,
      functionName: 'nullifierSpent',
      args: ['0x' + nullifierHash0.toString(16).padStart(64, '0')],
    });
    assert.equal(isSpent, false, 'Nullifier must remain unspent after fee tampering rejection');
  });

  it('AUDIT 4.4: on-chain pool rejects unknown Merkle root and out-of-range parameters', async () => {
    // 1. Unknown Merkle root
    const fakeRoot = '0x' + '1234567890abcdef'.repeat(4);
    await assert.rejects(
      async () => {
        await env.relayer.client.writeContract({
          address: poolETHAddress,
          abi: ethArtifact.abi,
          functionName: 'withdraw',
          args: [
            proofBytes0,
            fakeRoot,
            '0x' + nullifierHash0.toString(16).padStart(64, '0'),
            env.recipient.address,
            env.relayer.address,
            parseEther('0.05'),
          ],
        });
      },
      /revert/i,
      'Pool must revert with InvalidMerkleRoot when root is unknown'
    );

    // 2. Excessive fee (> denomination 1.0 ETH)
    await assert.rejects(
      async () => {
        await env.relayer.client.writeContract({
          address: poolETHAddress,
          abi: ethArtifact.abi,
          functionName: 'withdraw',
          args: [
            proofBytes0,
            rootIndex0,
            '0x' + nullifierHash0.toString(16).padStart(64, '0'),
            env.recipient.address,
            env.relayer.address,
            parseEther('1.5'), // fee > 1.0 ETH denomination
          ],
        });
      },
      /revert/i,
      'Pool must revert with InvalidFee when fee exceeds denomination'
    );

    // 3. Zero-address recipient
    await assert.rejects(
      async () => {
        await env.relayer.client.writeContract({
          address: poolETHAddress,
          abi: ethArtifact.abi,
          functionName: 'withdraw',
          args: [
            proofBytes0,
            rootIndex0,
            '0x' + nullifierHash0.toString(16).padStart(64, '0'),
            '0x0000000000000000000000000000000000000000',
            env.relayer.address,
            parseEther('0.05'),
          ],
        });
      },
      /revert/i,
      'Pool must revert with InvalidFee when recipient is zero address'
    );

    // 4. Nullifier hash exceeding BN254 scalar field order (FIELD_SIZE)
    const overflowNullifier = '0x' + (21888242871839275222246405745257275088548364400416034343698204186575808495617n + 100n).toString(16).padStart(64, '0');
    await assert.rejects(
      async () => {
        await env.relayer.client.writeContract({
          address: poolETHAddress,
          abi: ethArtifact.abi,
          functionName: 'withdraw',
          args: [
            proofBytes0,
            rootIndex0,
            overflowNullifier,
            env.recipient.address,
            env.relayer.address,
            parseEther('0.05'),
          ],
        });
      },
      /revert/i,
      'Pool must revert with FieldElementOverflow when nullifierHash >= FIELD_SIZE'
    );
  });

  it('AUDIT 4.5: underlying Groth16Verifier assembly strictly rejects public inputs >= scalar field order r', async () => {
    const adapterArtifact = env.loadArtifact('Groth16VerifierAdapter');
    const r = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

    // Public inputs with root = r (violating field bound)
    const overflowInputs = [
      r, // root >= r
      nullifierHash0,
      BigInt(env.recipient.address),
      BigInt(env.relayer.address),
      parseEther('0.05'),
    ];

    const isValid = await env.publicClient.readContract({
      address: env.genuineVerifierAddress,
      abi: adapterArtifact.abi,
      functionName: 'verifyProof',
      args: [proofBytes0, overflowInputs],
    });

    assert.equal(isValid, false, 'Verifier checkField assembly must return false for public inputs >= r');
  });

  it('AUDIT 4.6: executes valid withdrawal and rejects replay of spent nullifier', async () => {
    // Legitimate withdrawal with matching recipient and fee
    const tx = await env.relayer.client.writeContract({
      address: poolETHAddress,
      abi: ethArtifact.abi,
      functionName: 'withdraw',
      args: [
        proofBytes0,
        rootIndex0,
        '0x' + nullifierHash0.toString(16).padStart(64, '0'),
        env.recipient.address,
        env.relayer.address,
        parseEther('0.05'),
      ],
    });
    const receipt = await env.publicClient.waitForTransactionReceipt({ hash: tx });
    assert.equal(receipt.status, 'success', 'Valid withdrawal must succeed');

    // Immediate replay must revert with NullifierAlreadySpent
    await assert.rejects(
      async () => {
        await env.relayer.client.writeContract({
          address: poolETHAddress,
          abi: ethArtifact.abi,
          functionName: 'withdraw',
          args: [
            proofBytes0,
            rootIndex0,
            '0x' + nullifierHash0.toString(16).padStart(64, '0'),
            env.recipient.address,
            env.relayer.address,
            parseEther('0.05'),
          ],
        });
      },
      /revert/i,
      'Replay must revert'
    );
  });
});
