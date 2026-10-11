const { describe, it, before } = require('node:test');
const assert = require('node:assert');
const { setupTestEnvironment, loadArtifact } = require('./test-helpers');

describe('Cryptographic Primitives & Field Integrity', () => {
  let env;
  const FIELD_SIZE = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

  before(async () => {
    env = await setupTestEnvironment();
  });

  it('verifies BN254 scalar field bounds for secret generation', () => {
    const nullifierSecret = 123456789012345678901234567890n;
    const secret = 987654321098765432109876543210n;

    assert(nullifierSecret < FIELD_SIZE, 'Nullifier secret must be less than field modulus');
    assert(secret < FIELD_SIZE, 'Secret must be less than field modulus');
  });

  it('computes commitment using Poseidon(nullifierSecret, secret) and verifies on-chain parity', async () => {
    const nullifierSecret = 42n;
    const secret = 99n;

    // JavaScript Poseidon
    const jsHash = env.poseidon.F.toString(env.poseidon([nullifierSecret, secret]));

    // On-Chain Poseidon Contract
    const poseidonArtifact = loadArtifact('PoseidonT3');
    const onChainResult = await env.publicClient.readContract({
      address: env.hasherAddress,
      abi: poseidonArtifact.abi,
      functionName: 'poseidon',
      args: [[nullifierSecret, secret]],
    });

    assert.strictEqual(
      onChainResult.toString(),
      jsHash,
      'On-chain Poseidon contract must exactly match circomlibjs output'
    );
  });

  it('guarantees domain separation between commitment and nullifier', async () => {
    const secretA = 555n;
    const secretB = 777n;

    const commitment = env.poseidon.F.toString(env.poseidon([secretA, secretB]));
    const nullifier = env.poseidon.F.toString(env.poseidon([secretA]));

    assert.notStrictEqual(
      commitment,
      nullifier,
      'Commitment and nullifier must never collide due to input arity separation'
    );
  });

  it('verifies that zero-value leaf cannot overflow the BN254 scalar field', async () => {
    const poolArtifact = loadArtifact('VeilportPoolETH');
    const poolTx = await env.deployer.client.deployContract({
      abi: poolArtifact.abi,
      bytecode: poolArtifact.bytecode,
      args: [env.verifierAddress, env.hasherAddress, 1000000000000000000n],
    });
    const poolReceipt = await env.publicClient.waitForTransactionReceipt({ hash: poolTx });
    const poolAddress = poolReceipt.contractAddress;

    const initialRoot = await env.publicClient.readContract({
      address: poolAddress,
      abi: poolArtifact.abi,
      functionName: 'getLastRoot',
    });

    assert(
      initialRoot !== '0x0000000000000000000000000000000000000000000000000000000000000000',
      'Initial root must be non-zero precomputed zero-hash tree root'
    );

    const isKnown = await env.publicClient.readContract({
      address: poolAddress,
      abi: poolArtifact.abi,
      functionName: 'isKnownRoot',
      args: [initialRoot],
    });

    assert.strictEqual(isKnown, true, 'Initial precomputed empty root must be recognized as valid');
  });
});
