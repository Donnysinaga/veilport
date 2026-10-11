"use strict";
/**
 * VEILPORT Note & Authenticated Backup Module (Protocol Node.js build)
 * Implements cryptographically secure note creation, authenticated AES-GCM encryption,
 * PBKDF2 key derivation (600,000 iterations default), and explicit recovery.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SNARK_SCALAR_FIELD = void 0;
exports.RECOMMENDED_PBKDF2_ITERATIONS = 600000;
exports.MIN_PBKDF2_ITERATIONS = 10000;
exports.MAX_PBKDF2_ITERATIONS = 2000000;
exports.MAX_BACKUP_JSON_LENGTH = 100000;
exports.getPoseidon = getPoseidon;
exports.generateSecureFieldElement = generateSecureFieldElement;
exports.createNote = createNote;
exports.encryptNote = encryptNote;
exports.decryptNote = decryptNote;
exports.parseNote = parseNote;

const circomlibjs_1 = require("circomlibjs");
exports.SNARK_SCALAR_FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

let poseidonInstance = null;

async function getPoseidon() {
    if (!poseidonInstance) {
        poseidonInstance = await (0, circomlibjs_1.buildPoseidon)();
    }
    return poseidonInstance;
}

function getWebCrypto() {
    if (typeof window !== "undefined" && window.crypto) {
        return window.crypto;
    }
    const nodeCrypto = require("crypto");
    return nodeCrypto.webcrypto;
}

function generateSecureFieldElement() {
    const cryptoObj = getWebCrypto();
    while (true) {
        const bytes = new Uint8Array(32);
        cryptoObj.getRandomValues(bytes);
        let hex = "";
        for (let i = 0; i < bytes.length; i++) {
            hex += bytes[i].toString(16).padStart(2, "0");
        }
        const value = BigInt("0x" + hex);
        if (value > 0n && value < exports.SNARK_SCALAR_FIELD) {
            return value;
        }
    }
}

async function createNote(asset, denomination, decimalUnits, chainId) {
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

async function encryptNote(note, password, iterations = exports.RECOMMENDED_PBKDF2_ITERATIONS) {
    if (!password || password.length < 8) {
        throw new Error("Password must be at least 8 characters long.");
    }
    const cryptoObj = getWebCrypto();
    const encoder = new TextEncoder();
    const salt = new Uint8Array(16);
    const iv = new Uint8Array(12);
    cryptoObj.getRandomValues(salt);
    cryptoObj.getRandomValues(iv);

    const passwordKey = await cryptoObj.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveKey"]);
    const aesKey = await cryptoObj.subtle.deriveKey({
        name: "PBKDF2",
        salt,
        iterations,
        hash: "SHA-256",
    }, passwordKey, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);

    const payload = JSON.stringify({
        nullifierSecret: note.nullifierSecret,
        secret: note.secret,
        decimalUnits: note.decimalUnits,
        timestamp: Date.now(),
    });
    const aad = encoder.encode(`${note.asset}-${note.denomination}-${note.chainId}`);
    const ciphertextBuffer = await cryptoObj.subtle.encrypt({
        name: "AES-GCM",
        iv,
        additionalData: aad,
        tagLength: 128,
    }, aesKey, encoder.encode(payload));

    const toHex = (buf) => Array.from(buf).map((b) => b.toString(16).padStart(2, "0")).join("");
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

async function decryptNote(backup, password) {
    if (!backup || typeof backup !== "object") {
        throw new Error("Invalid backup format: payload is not an object.");
    }
    if (backup.version !== 1) {
        throw new Error(`Unsupported backup format version: ${backup.version}`);
    }
    if (!password) {
        throw new Error("Password is required to decrypt backup.");
    }
    if (!backup.kdf || backup.kdf.algorithm !== "PBKDF2" || backup.kdf.hash !== "SHA-256") {
        throw new Error("Unsupported or corrupted KDF configuration in backup.");
    }
    if (typeof backup.kdf.iterations !== "number" || backup.kdf.iterations < exports.MIN_PBKDF2_ITERATIONS || backup.kdf.iterations > exports.MAX_PBKDF2_ITERATIONS) {
        throw new Error(`Invalid KDF iteration count: must be between ${exports.MIN_PBKDF2_ITERATIONS} and ${exports.MAX_PBKDF2_ITERATIONS}`);
    }
    if (!backup.kdf.saltHex || backup.kdf.saltHex.length !== 32) {
        throw new Error("Invalid salt length in backup file (must be 16 bytes hex).");
    }
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
    const fromHex = (hex) => {
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

    const passwordKey = await cryptoObj.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveKey"]);
    const aesKey = await cryptoObj.subtle.deriveKey({
        name: "PBKDF2",
        salt,
        iterations: backup.kdf.iterations,
        hash: "SHA-256",
    }, passwordKey, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);

    const aad = encoder.encode(`${backup.asset}-${backup.denomination}-${backup.chainId}`);
    let decryptedBuffer;
    try {
        decryptedBuffer = await cryptoObj.subtle.decrypt({
            name: "AES-GCM",
            iv,
            additionalData: aad,
            tagLength: 128,
        }, aesKey, ciphertext);
    }
    catch {
        throw new Error("Decryption failed. Incorrect password, tampered metadata, or corrupted backup file.");
    }

    let payload;
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

    let nullifierSecretBn;
    let secretBn;
    try {
        nullifierSecretBn = BigInt(nullifierSecret);
        secretBn = BigInt(secret);
    } catch {
        throw new Error("Decrypted note contains non-integer secrets.");
    }

    if (nullifierSecretBn <= 0n || nullifierSecretBn >= exports.SNARK_SCALAR_FIELD || secretBn <= 0n || secretBn >= exports.SNARK_SCALAR_FIELD) {
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

async function parseNote(noteString, decimalUnitsMap = {}) {
    if (!noteString || noteString.length > 500) {
        throw new Error("Invalid note: input length exceeds limits.");
    }
    const clean = noteString.trim();
    const parts = clean.split("-");
    if (parts.length !== 6 || parts[0] !== "veilport") {
        throw new Error("Invalid note format. Must follow 'veilport-<asset>-<denomination>-<chainId>-<nullifier>-<secret>'");
    }
    const asset = parts[1];
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
    if (nullifierSecretBn >= exports.SNARK_SCALAR_FIELD || secretBn >= exports.SNARK_SCALAR_FIELD) {
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
