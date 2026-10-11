const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { 
  createNote, 
  encryptNote, 
  decryptNote, 
  parseNote 
} = require('../lib/note');
const { MerkleTreeIndexer } = require('../lib/indexer');
const { setupTestEnvironment } = require('./test-helpers');
const { parseEther, getAbiItem } = require('viem');

describe('Note Authenticated Encryption & Merkle Tree Indexer Suite', () => {
  it('encrypts note with PBKDF2/AES-GCM and decrypts successfully with correct password', async () => {
    const note = await createNote('ETH', '1.0', '1000000000000000000', 4663);
    const password = 'CorrectPassword123!';

    const encrypted = await encryptNote(note, password);

    // Verify format and lack of plaintext secrets
    assert.equal(encrypted.version, 1);
    assert.equal(encrypted.kdf.algorithm, 'PBKDF2');
    assert.equal(encrypted.cipher.algorithm, 'AES-GCM');
    assert.equal(encrypted.commitment, note.commitment);

    const serialized = JSON.stringify(encrypted);
    assert.equal(serialized.includes(note.nullifierSecret.slice(2)), false, 'Encrypted file must NOT contain raw nullifierSecret');
    assert.equal(serialized.includes(note.secret.slice(2)), false, 'Encrypted file must NOT contain raw secret');

    // Decrypt with correct password
    const recovered = await decryptNote(encrypted, password);
    assert.equal(recovered.commitment, note.commitment);
    assert.equal(recovered.nullifierSecret, note.nullifierSecret);
    assert.equal(recovered.secret, note.secret);
    assert.equal(recovered.asset, 'ETH');
    assert.equal(recovered.denomination, '1.0');
  });

  it('rejects decryption when wrong password is supplied', async () => {
    const note = await createNote('USDG', '100', '100000000', 4663);
    const encrypted = await encryptNote(note, 'CorrectPassword123!');

    await assert.rejects(
      async () => decryptNote(encrypted, 'WrongPassword456!'),
      /Decryption failed/i,
      'Incorrect password must fail authenticated decryption'
    );
  });

  it('rejects corrupted ciphertext or tampered metadata', async () => {
    const note = await createNote('ETH', '1.0', '1000000000000000000', 4663);
    const encrypted = await encryptNote(note, 'StrongPassword123!');

    // Tampered ciphertext
    const corruptedCiphertext = {
      ...encrypted,
      cipher: {
        ...encrypted.cipher,
        ciphertextHex: encrypted.cipher.ciphertextHex.slice(0, -4) + 'abcd',
      },
    };
    await assert.rejects(
      async () => decryptNote(corruptedCiphertext, 'StrongPassword123!'),
      /Decryption failed/i,
      'Corrupted ciphertext must fail authentication'
    );

    // Tampered commitment metadata (AAD mismatch or commitment forgery)
    const tamperedMetadata = {
      ...encrypted,
      asset: 'USDG', // Swapped asset in unauthenticated JSON
    };
    await assert.rejects(
      async () => decryptNote(tamperedMetadata, 'StrongPassword123!'),
      /Decryption failed/i,
      'Tampered additional authenticated data must fail authentication'
    );
  });

  it('Merkle Tree Indexer: reconstructs tree from on-chain EVM Deposit events and matches getLastRoot', async () => {
    const env = await setupTestEnvironment();
    const poolArtifact = env.loadArtifact('VeilportPoolETH');

    const poolTx = await env.deployer.client.deployContract({
      abi: poolArtifact.abi,
      bytecode: poolArtifact.bytecode,
      args: [env.genuineVerifierAddress, env.hasherAddress, parseEther('1.0')],
    });
    const poolReceipt = await env.publicClient.waitForTransactionReceipt({ hash: poolTx });
    const poolAddress = poolReceipt.contractAddress;

    const indexer = await MerkleTreeIndexer.create();

    // 1. First deposit (index 0)
    const note0 = await createNote('ETH', '1.0', parseEther('1.0').toString(), 1337);
    const tx0 = await env.depositor.client.writeContract({
      address: poolAddress,
      abi: poolArtifact.abi,
      functionName: 'deposit',
      args: [note0.commitment],
      value: parseEther('1.0'),
    });
    const receipt0 = await env.publicClient.waitForTransactionReceipt({ hash: tx0 });

    // 2. Second deposit (index 1)
    const note1 = await createNote('ETH', '1.0', parseEther('1.0').toString(), 1337);
    const tx1 = await env.depositor.client.writeContract({
      address: poolAddress,
      abi: poolArtifact.abi,
      functionName: 'deposit',
      args: [note1.commitment],
      value: parseEther('1.0'),
    });
    const receipt1 = await env.publicClient.waitForTransactionReceipt({ hash: tx1 });

    // Read on-chain root
    const onChainRoot = await env.publicClient.readContract({
      address: poolAddress,
      abi: poolArtifact.abi,
      functionName: 'getLastRoot',
    });

    // Ingest events into indexer
    const events = [
      {
        commitment: note0.commitment,
        leafIndex: 0,
        blockNumber: receipt0.blockNumber,
        transactionHash: receipt0.transactionHash,
        logIndex: 0,
      },
      {
        commitment: note1.commitment,
        leafIndex: 1,
        blockNumber: receipt1.blockNumber,
        transactionHash: receipt1.transactionHash,
        logIndex: 0,
      },
    ];

    indexer.ingestEvents(events);

    // Verify indexer root matches on-chain root exactly
    const reconstructedRoot = indexer.getLastRoot();
    assert.equal(
      reconstructedRoot.toLowerCase(),
      onChainRoot.toLowerCase(),
      'Reconstructed indexer root must match on-chain getLastRoot'
    );

    // Verify paths at index 0 and index 1
    const path0 = indexer.getMerklePath(note0.commitment);
    assert.equal(path0.index, 0);
    assert.equal(path0.pathElements.length, 20);
    assert.equal(path0.pathIndices[0], 0);

    const path1 = indexer.getMerklePath(note1.commitment);
    assert.equal(path1.index, 1);
    assert.equal(path1.pathElements.length, 20);
    assert.equal(path1.pathIndices[0], 1);
    assert.equal(path1.pathElements[0].toLowerCase(), note0.commitment.toLowerCase(), 'Sibling for index 1 must be note 0');
  });

  it('Merkle Tree Indexer: rejects unindexed commitment queries', async () => {
    const indexer = await MerkleTreeIndexer.create();
    const unindexedCommitment = '0x1234567890123456789012345678901234567890123456789012345678901234';

    assert.throws(
      () => indexer.getMerklePath(unindexedCommitment),
      /not found in indexed Merkle tree/i
    );
  });
});
