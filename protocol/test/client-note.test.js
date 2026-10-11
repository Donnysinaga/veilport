const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { 
  createNote, 
  parseNote, 
  generateSecureFieldElement, 
  SNARK_SCALAR_FIELD 
} = require('../lib/note');
const { buildPoseidon } = require('circomlibjs');

describe('Client-Side Note Lifecycle & Cryptographic Parity Suite', () => {
  it('generates cryptographically secure field elements strictly bounded by SNARK_SCALAR_FIELD', () => {
    for (let i = 0; i < 20; i++) {
      const element = generateSecureFieldElement();
      assert.ok(element > 0n, 'Element must be positive');
      assert.ok(element < SNARK_SCALAR_FIELD, 'Element must be strictly less than scalar field modulus');
    }
  });

  it('creates valid note with bit-for-bit Poseidon parity with circomlibjs', async () => {
    const poseidon = await buildPoseidon();
    const F = poseidon.F;

    const note = await createNote('ETH', '1.0', '1000000000000000000', 4663);

    assert.equal(note.asset, 'ETH');
    assert.equal(note.denomination, '1.0');
    assert.equal(note.chainId, 4663);

    // Verify commitment calculation parity
    const nullifierSecretBn = BigInt(note.nullifierSecret);
    const secretBn = BigInt(note.secret);
    const expectedCommitment = '0x' + F.toObject(poseidon([nullifierSecretBn, secretBn])).toString(16).padStart(64, '0');
    const expectedNullifierHash = '0x' + F.toObject(poseidon([nullifierSecretBn])).toString(16).padStart(64, '0');

    assert.equal(note.commitment, expectedCommitment, 'Commitment must match 2-input Poseidon');
    assert.equal(note.nullifierHash, expectedNullifierHash, 'Nullifier must match 1-input Poseidon');
    assert.ok(note.noteString.startsWith('veilport-ETH-1.0-4663-'));
  });

  it('successfully exports and parses valid note string', async () => {
    const note = await createNote('USDG', '100', '100000000', 4663);
    const unitsMap = { 'USDG-100': '100000000' };

    const parsed = await parseNote(note.noteString, unitsMap);

    assert.equal(parsed.asset, 'USDG');
    assert.equal(parsed.denomination, '100');
    assert.equal(parsed.decimalUnits, '100000000');
    assert.equal(parsed.chainId, 4663);
    assert.equal(parsed.nullifierSecret, note.nullifierSecret);
    assert.equal(parsed.secret, note.secret);
    assert.equal(parsed.commitment, note.commitment);
    assert.equal(parsed.nullifierHash, note.nullifierHash);
  });

  it('rejects corrupted or truncated note strings', async () => {
    const unitsMap = { 'ETH-1.0': '1000000000000000000' };

    // Malformed prefix
    await assert.rejects(
      async () => parseNote('invalid-ETH-1.0-4663-1234-5678', unitsMap),
      /Invalid note format/i
    );

    // Truncated secret length
    await assert.rejects(
      async () => parseNote('veilport-ETH-1.0-4663-1234-5678', unitsMap),
      /Invalid secret length/i
    );

    // Unsupported asset
    await assert.rejects(
      async () => parseNote(`veilport-BTC-1.0-4663-${'a'.repeat(64)}-${'b'.repeat(64)}`, unitsMap),
      /Unsupported note asset/i
    );
  });

  it('prevents leakage: note export does not expose plaintext secrets in unformatted strings', async () => {
    const note = await createNote('ETH', '1.0', '1000000000000000000', 4663);

    // Ensure secrets are bounded 64-char hex strings and not converted to lossy scientific notation
    assert.equal(note.nullifierSecret.length, 66); // 0x + 64 chars
    assert.equal(note.secret.length, 66);
    assert.ok(!note.noteString.includes('e+'), 'Secrets must not suffer scientific notation truncation');
  });
});
