/**
 * VEILPORT Note & Authenticated Backup Module
 * Implements cryptographically secure note creation, authenticated AES-GCM encryption,
 * PBKDF2 key derivation, and explicit user-controlled recovery.
 *
 * All note secrets (nullifierSecret, secret) are strictly bounded by BN254 scalar field modulus.
 */

import { buildPoseidon } from "circomlibjs";

export const SNARK_SCALAR_FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

export interface VeilportNote {
  asset: "ETH" | "USDG";
  denomination: string; // e.g. "0.1", "1.0", "100"
  decimalUnits: string; // raw integer units, e.g. "100000000" for USDG
  chainId: number;
  nullifierSecret: string; // hex formatted (64 chars)
  secret: string; // hex formatted (64 chars)
  commitment: string; // bytes32 hex
  nullifierHash: string; // bytes32 hex
  noteString: string; // raw backup format: veilport-<asset>-<denomination>-<chainId>-<nullifierSecret>-<secret>
}

export interface EncryptedNoteBackup {
  version: 1;
  asset: "ETH" | "USDG";
  denomination: string;
  chainId: number;
  commitment: string; // Public identifier for referencing without decryption
  kdf: {
    algorithm: "PBKDF2";
    hash: "SHA-256";
    iterations: number;
    saltHex: string;
  };
  cipher: {
    algorithm: "AES-GCM";
    ivHex: string;
    ciphertextHex: string; // Includes 128-bit authentication tag
  };
}

let poseidonInstance: any = null;

export async function getPoseidon(): Promise<any> {
  if (!poseidonInstance) {
    poseidonInstance = await buildPoseidon();
  }
  return poseidonInstance;
}

function getWebCrypto(): Crypto {
  if (typeof window !== "undefined" && window.crypto) {
    return window.crypto;
  }
  // Node.js support
  const nodeCrypto = require("crypto");
  return nodeCrypto.webcrypto as Crypto;
}

/**
 * Generates a cryptographically secure 256-bit scalar field element in Fr.
 * Strictly avoids Math.random() and ensures value is strictly < SNARK_SCALAR_FIELD.
 */
export function generateSecureFieldElement(): bigint {
  const cryptoObj = getWebCrypto();
  while (true) {
    const bytes = new Uint8Array(32);
    cryptoObj.getRandomValues(bytes);

    let hex = "";
    for (let i = 0; i < bytes.length; i++) {
      hex += bytes[i].toString(16).padStart(2, "0");
    }

    const value = BigInt("0x" + hex);
    if (value > 0n && value < SNARK_SCALAR_FIELD) {
      return value;
    }
  }
}

/**
 * Creates a brand new privacy note for the specified asset and denomination.
 */
export async function createNote(
  asset: "ETH" | "USDG",
  denomination: string,
  decimalUnits: string,
  chainId: number
): Promise<VeilportNote> {
  const poseidon = await getPoseidon();
  const F = poseidon.F;

  const nullifierSecretBn = generateSecureFieldElement();
  const secretBn = generateSecureFieldElement();

  const commitmentBn = F.toObject(poseidon([nullifierSecretBn, secretBn]));
  const nullifierHashBn = F.toObject(poseidon([nullifierSecretBn]));

  const nullifierSecretHex = "0x" + nullifierSecretBn.toString(16).padStart(64, "0");
  const secretHex = "0x" + secretBn.toString(16).padStart(64, "0");
  const commitmentHex = "0x" + commitmentBn.toString(16).padStart(64, "0");
  const nullifierHashHex = "0x" + nullifierHashBn.toString(16).padStart(64, "0");

  const noteString = `veilport-${asset}-${denomination}-${chainId}-${nullifierSecretHex.slice(2)}-${secretHex.slice(2)}`;

  return {
    asset,
    denomination,
    decimalUnits,
    chainId,
    nullifierSecret: nullifierSecretHex,
    secret: secretHex,
    commitment: commitmentHex,
    nullifierHash: nullifierHashHex,
    noteString,
  };
}

export const RECOMMENDED_PBKDF2_ITERATIONS = 600000;
export const MIN_PBKDF2_ITERATIONS = 10000;
export const MAX_PBKDF2_ITERATIONS = 2000000;
export const MAX_BACKUP_JSON_LENGTH = 100000; // 100 KB max to prevent DoS

/**
 * Encrypts a note into an authenticated backup file using PBKDF2 (600,000 rounds) + AES-GCM (256-bit).
 */
export async function encryptNote(
  note: VeilportNote,
  password: string,
  iterations = RECOMMENDED_PBKDF2_ITERATIONS
): Promise<EncryptedNoteBackup> {
  if (!password || password.length < 8) {
    throw new Error("Password must be at least 8 characters long.");
  }

  const cryptoObj = getWebCrypto();
  const encoder = new TextEncoder();

  // 1. Generate unique 16-byte salt and 12-byte IV
  const salt = new Uint8Array(16);
  const iv = new Uint8Array(12);
  cryptoObj.getRandomValues(salt);
  cryptoObj.getRandomValues(iv);

  // 2. Derive 256-bit AES-GCM key via PBKDF2-HMAC-SHA-256 (600,000 iterations default)
  const passwordKey = await cryptoObj.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  const aesKey = await cryptoObj.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations,
      hash: "SHA-256",
    },
    passwordKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );

  // 3. Encrypt payload with authenticated metadata (AAD: asset, denomination, chainId)
  const payload = JSON.stringify({
    nullifierSecret: note.nullifierSecret,
    secret: note.secret,
    decimalUnits: note.decimalUnits,
    timestamp: Date.now(),
  });

  const aad = encoder.encode(`${note.asset}-${note.denomination}-${note.chainId}`);

  const ciphertextBuffer = await cryptoObj.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: aad,
      tagLength: 128,
    },
    aesKey,
    encoder.encode(payload)
  );

  const toHex = (buf: Uint8Array) => Array.from(buf).map((b) => b.toString(16).padStart(2, "0")).join("");

  return {
    version: 1,
    asset: note.asset,
    denomination: note.denomination,
    chainId: note.chainId,
    commitment: note.commitment,
    kdf: {
      algorithm: "PBKDF2",
      hash: "SHA-256",
      iterations,
      saltHex: toHex(salt),
    },
    cipher: {
      algorithm: "AES-GCM",
      ivHex: toHex(iv),
      ciphertextHex: toHex(new Uint8Array(ciphertextBuffer)),
    },
  };
}

/**
 * Decrypts and authenticates an encrypted note backup using the user-provided password.
 * Backward-compatible with version 1 backups regardless of iteration count.
 */
export async function decryptNote(backup: EncryptedNoteBackup, password: string): Promise<VeilportNote> {
  if (!backup || typeof backup !== "object") {
    throw new Error("Invalid backup format: payload is not an object.");
  }
  if (backup.version !== 1) {
    throw new Error(`Unsupported backup format version: ${backup.version}`);
  }
  if (!password) {
    throw new Error("Password is required to decrypt backup.");
  }

  // Validate KDF parameters
  if (
    !backup.kdf ||
    backup.kdf.algorithm !== "PBKDF2" ||
    backup.kdf.hash !== "SHA-256"
  ) {
    throw new Error("Unsupported or corrupted KDF configuration in backup.");
  }
  if (
    typeof backup.kdf.iterations !== "number" ||
    backup.kdf.iterations < MIN_PBKDF2_ITERATIONS ||
    backup.kdf.iterations > MAX_PBKDF2_ITERATIONS
  ) {
    throw new Error(`Invalid KDF iteration count: must be between ${MIN_PBKDF2_ITERATIONS} and ${MAX_PBKDF2_ITERATIONS}`);
  }
  if (!backup.kdf.saltHex || backup.kdf.saltHex.length !== 32) {
    throw new Error("Invalid salt length in backup file (must be 16 bytes hex).");
  }

  // Validate Cipher parameters
  if (!backup.cipher || backup.cipher.algorithm !== "AES-GCM") {
    throw new Error("Unsupported or corrupted cipher configuration in backup.");
  }
  if (!backup.cipher.ivHex || backup.cipher.ivHex.length !== 24) {
    throw new Error("Invalid IV length in backup file (must be 12 bytes hex).");
  }
  if (!backup.cipher.ciphertextHex || backup.cipher.ciphertextHex.length < 32) {
    throw new Error("Corrupted or truncated ciphertext in backup file.");
  }

  const cryptoObj = getWebCrypto();
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const fromHex = (hex: string) => {
    if (hex.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(hex)) {
      throw new Error("Invalid hex characters in cryptographic fields.");
    }
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return bytes;
  };

  const salt = fromHex(backup.kdf.saltHex);
  const iv = fromHex(backup.cipher.ivHex);
  const ciphertext = fromHex(backup.cipher.ciphertextHex);

  const passwordKey = await cryptoObj.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  const aesKey = await cryptoObj.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: backup.kdf.iterations,
      hash: "SHA-256",
    },
    passwordKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );

  const aad = encoder.encode(`${backup.asset}-${backup.denomination}-${backup.chainId}`);

  let decryptedBuffer: ArrayBuffer;
  try {
    decryptedBuffer = await cryptoObj.subtle.decrypt(
      {
        name: "AES-GCM",
        iv,
        additionalData: aad,
        tagLength: 128,
      },
      aesKey,
      ciphertext
    );
  } catch {
    throw new Error("Decryption failed. Incorrect password, tampered metadata, or corrupted backup file.");
  }

  let payload: any;
  try {
    payload = JSON.parse(decoder.decode(decryptedBuffer));
  } catch {
    throw new Error("Decryption succeeded but decrypted payload is not valid JSON.");
  }

  const nullifierSecret = payload.nullifierSecret;
  const secret = payload.secret;

  if (typeof nullifierSecret !== "string" || typeof secret !== "string") {
    throw new Error("Decrypted note contains invalid secret types.");
  }

  let nullifierSecretBn: bigint;
  let secretBn: bigint;
  try {
    nullifierSecretBn = BigInt(nullifierSecret);
    secretBn = BigInt(secret);
  } catch {
    throw new Error("Decrypted note contains non-integer secrets.");
  }

  if (
    nullifierSecretBn <= 0n ||
    nullifierSecretBn >= SNARK_SCALAR_FIELD ||
    secretBn <= 0n ||
    secretBn >= SNARK_SCALAR_FIELD
  ) {
    throw new Error("Decrypted secrets exceed BN254 scalar field modulus.");
  }

  const poseidon = await getPoseidon();
  const F = poseidon.F;

  const commitmentBn = F.toObject(poseidon([nullifierSecretBn, secretBn]));
  const nullifierHashBn = F.toObject(poseidon([nullifierSecretBn]));

  const commitmentHex = "0x" + commitmentBn.toString(16).padStart(64, "0");
  const nullifierHashHex = "0x" + nullifierHashBn.toString(16).padStart(64, "0");

  if (commitmentHex.toLowerCase() !== backup.commitment.toLowerCase()) {
    throw new Error("Commitment integrity mismatch. Backup metadata or secrets have been tampered with.");
  }

  const noteString = `veilport-${backup.asset}-${backup.denomination}-${backup.chainId}-${nullifierSecret.slice(2)}-${secret.slice(2)}`;

  return {
    asset: backup.asset,
    denomination: backup.denomination,
    decimalUnits: payload.decimalUnits || "0",
    chainId: backup.chainId,
    nullifierSecret,
    secret,
    commitment: commitmentHex,
    nullifierHash: nullifierHashHex,
    noteString,
  };
}

/**
 * Parses and verifies an exported plaintext note string (compatibility format).
 * Format: veilport-<asset>-<denomination>-<chainId>-<nullifierSecretHex>-<secretHex>
 */
export async function parseNote(noteString: string, decimalUnitsMap: Record<string, string> = {}): Promise<VeilportNote> {
  const clean = noteString.trim();
  const parts = clean.split("-");

  if (parts.length !== 6 || parts[0] !== "veilport") {
    throw new Error("Invalid note format. Must follow 'veilport-<asset>-<denomination>-<chainId>-<nullifier>-<secret>'");
  }

  const asset = parts[1] as "ETH" | "USDG";
  if (asset !== "ETH" && asset !== "USDG") {
    throw new Error(`Unsupported note asset: ${parts[1]}`);
  }

  const denomination = parts[2];
  const chainId = parseInt(parts[3], 10);
  if (isNaN(chainId) || chainId <= 0) {
    throw new Error("Invalid chain ID in note");
  }

  const nullifierSecretHex = "0x" + parts[4];
  const secretHex = "0x" + parts[5];

  if (parts[4].length !== 64 || parts[5].length !== 64) {
    throw new Error("Invalid secret length. Secrets must be 32 bytes (64 hex characters).");
  }

  const nullifierSecretBn = BigInt(nullifierSecretHex);
  const secretBn = BigInt(secretHex);

  if (nullifierSecretBn >= SNARK_SCALAR_FIELD || secretBn >= SNARK_SCALAR_FIELD) {
    throw new Error("Note secrets exceed BN254 scalar field modulus.");
  }

  const poseidon = await getPoseidon();
  const F = poseidon.F;

  const commitmentBn = F.toObject(poseidon([nullifierSecretBn, secretBn]));
  const nullifierHashBn = F.toObject(poseidon([nullifierSecretBn]));

  const decimalUnits = decimalUnitsMap[`${asset}-${denomination}`] || "0";

  return {
    asset,
    denomination,
    decimalUnits,
    chainId,
    nullifierSecret: nullifierSecretHex,
    secret: secretHex,
    commitment: "0x" + commitmentBn.toString(16).padStart(64, "0"),
    nullifierHash: "0x" + nullifierHashBn.toString(16).padStart(64, "0"),
    noteString: clean,
  };
}
