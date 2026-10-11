import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { 
  createNote, 
  encryptNote, 
  decryptNote, 
  parseNote 
} = require('../protocol/lib/note.js');

describe('Note Authenticated Encryption & Decryption Validation Suite', () => {
  it('encrypts and decrypts note successfully with correct password', async () => {
    const note = await createNote('ETH', '1.0', '1000000000000000000', 4663);
    const password = 'StrongPassword123!';

    // Use lower iteration count for fast unit test execution
    const encryptedBackup = await encryptNote(note, password, 10000);

    assert.equal(encryptedBackup.version, 1);
    assert.equal(encryptedBackup.asset, 'ETH');
    assert.equal(encryptedBackup.denomination, '1.0');
    assert.equal(encryptedBackup.chainId, 4663);
    assert.equal(encryptedBackup.commitment, note.commitment);
    assert.equal(encryptedBackup.kdf.algorithm, 'PBKDF2');
    assert.equal(encryptedBackup.cipher.algorithm, 'AES-GCM');
    assert.ok(encryptedBackup.cipher.ciphertextHex.length > 32);

    const decryptedNote = await decryptNote(encryptedBackup, password);

    assert.equal(decryptedNote.asset, note.asset);
    assert.equal(decryptedNote.denomination, note.denomination);
    assert.equal(decryptedNote.chainId, note.chainId);
    assert.equal(decryptedNote.commitment, note.commitment);
    assert.equal(decryptedNote.nullifierHash, note.nullifierHash);
    assert.equal(decryptedNote.secret, note.secret);
    assert.equal(decryptedNote.nullifierSecret, note.nullifierSecret);
    assert.equal(decryptedNote.noteString, note.noteString);
  });

  it('rejects incorrect password with authenticated error', async () => {
    const note = await createNote('USDG', '100', '100000000', 4663);
    const encryptedBackup = await encryptNote(note, 'CorrectPassword123', 10000);

    await assert.rejects(
      async () => decryptNote(encryptedBackup, 'WrongPassword456'),
      (err) => {
        assert.ok(err.message.includes('Decryption failed') || err.message.includes('Incorrect password'));
        return true;
      }
    );
  });

  it('rejects tampered ciphertext', async () => {
    const note = await createNote('ETH', '1.0', '1000000000000000000', 4663);
    const encryptedBackup = await encryptNote(note, 'Password123!', 10000);

    // Tamper with ciphertext by flipping characters
    const origHex = encryptedBackup.cipher.ciphertextHex;
    const flippedChar = origHex[0] === 'a' ? 'b' : 'a';
    encryptedBackup.cipher.ciphertextHex = flippedChar + origHex.slice(1);

    await assert.rejects(
      async () => decryptNote(encryptedBackup, 'Password123!'),
      (err) => {
        assert.ok(err.message.includes('Decryption failed'));
        return true;
      }
    );
  });

  it('rejects tampered authenticated metadata (AAD)', async () => {
    const note = await createNote('ETH', '1.0', '1000000000000000000', 4663);
    const encryptedBackup = await encryptNote(note, 'Password123!', 10000);

    // Tampering with asset metadata must break AES-GCM tag verification
    encryptedBackup.asset = 'USDG';

    await assert.rejects(
      async () => decryptNote(encryptedBackup, 'Password123!'),
      (err) => {
        assert.ok(err.message.includes('Decryption failed'));
        return true;
      }
    );
  });

  it('rejects malformed or incomplete backup payload objects', async () => {
    await assert.rejects(
      async () => decryptNote(null, 'pwd'),
      /Invalid backup format/
    );

    await assert.rejects(
      async () => decryptNote({ version: 2 }, 'pwd'),
      /Unsupported backup format version/
    );

    await assert.rejects(
      async () => decryptNote({ version: 1, cipher: null }, 'pwd'),
      /Unsupported or corrupted KDF configuration/
    );
  });

  it('successfully recovers raw plaintext note string via parseNote', async () => {
    const note = await createNote('ETH', '1.0', '1000000000000000000', 4663);
    const unitsMap = { 'ETH-1.0': '1000000000000000000' };

    const parsed = await parseNote(note.noteString, unitsMap);
    assert.equal(parsed.commitment, note.commitment);
    assert.equal(parsed.nullifierHash, note.nullifierHash);
    assert.equal(parsed.asset, 'ETH');
    assert.equal(parsed.denomination, '1.0');
  });
});
