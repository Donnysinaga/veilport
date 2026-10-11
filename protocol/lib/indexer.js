"use strict";
/**
 * VEILPORT Merkle Tree Incremental Indexer (Protocol Node.js build)
 * Reconstructs the exact depth-20 incremental binary Merkle tree from on-chain Deposit events.
 * Computes deterministic historical roots, Merkle inclusion paths, and sibling elements.
 * Supports chain reorg rollbacks, gap detection, deterministic re-indexing, and local path verification.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MerkleTreeIndexer = exports.FIELD_SIZE = exports.ROOT_HISTORY_SIZE = exports.TREE_DEPTH = void 0;

const circomlibjs_1 = require("circomlibjs");

exports.TREE_DEPTH = 20;
exports.ROOT_HISTORY_SIZE = 30;
exports.FIELD_SIZE = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

class MerkleTreeIndexer {
    constructor() {
        this.zeros = [];
        this.filledSubtrees = [];
        this.roots = [];
        this.currentRootIndex = 0;
        this.nextIndex = 0;
        this.leaves = [];
        this.poseidon = null;
        this.F = null;
        this.eventLogs = [];
        this.lastSyncedBlock = 0n;
        this.processedLogs = new Set();
    }

    static async create() {
        const tree = new MerkleTreeIndexer();
        tree.poseidon = await (0, circomlibjs_1.buildPoseidon)();
        tree.F = tree.poseidon.F;
        tree.initializeTree();
        return tree;
    }

    initializeTree() {
        let currentZero = 1231485639937371399050710718397366083998595347190416894436855383329780404878n;
        this.zeros = [currentZero];
        this.filledSubtrees = [currentZero];
        for (let i = 1; i < exports.TREE_DEPTH; i++) {
            currentZero = this.F.toObject(this.poseidon([currentZero, currentZero]));
            this.zeros.push(currentZero);
            this.filledSubtrees.push(currentZero);
        }
        const initialRoot = this.F.toObject(this.poseidon([currentZero, currentZero]));
        this.roots = Array(exports.ROOT_HISTORY_SIZE).fill(0n);
        this.roots[0] = initialRoot;
        this.currentRootIndex = 0;
        this.nextIndex = 0;
        this.leaves = [];
    }

    ingestEvents(events) {
        let hasNewEvents = false;
        for (const event of events) {
            const logId = `${event.transactionHash.toLowerCase()}-${event.logIndex}`;
            if (!this.processedLogs.has(logId)) {
                this.processedLogs.add(logId);
                this.eventLogs.push(event);
                hasNewEvents = true;
            }
        }
        if (!hasNewEvents && this.nextIndex > 0) {
            return;
        }

        this.eventLogs.sort((a, b) => {
            if (a.blockNumber !== b.blockNumber) {
                return a.blockNumber < b.blockNumber ? -1 : 1;
            }
            return a.logIndex - b.logIndex;
        });

        if (this.eventLogs.length > 2 ** exports.TREE_DEPTH) {
            throw new Error("Merkle tree capacity exceeded (max 1048576 leaves).");
        }

        for (let i = 0; i < this.eventLogs.length; i++) {
            const log = this.eventLogs[i];
            if (log.leafIndex !== i) {
                throw new Error(`Non-sequential leaf indices detected in event history: expected index ${i}, got ${log.leafIndex} at block ${log.blockNumber}. Missing intermediate events.`);
            }
            const leafBn = BigInt(log.commitment);
            if (leafBn >= exports.FIELD_SIZE || leafBn <= 0n) {
                throw new Error(`Deposit commitment at index ${i} is not a valid scalar field element in Fr.`);
            }
        }

        this.initializeTree();
        this.lastSyncedBlock = 0n;
        for (const log of this.eventLogs) {
            this.insertLeaf(BigInt(log.commitment));
            if (log.blockNumber > this.lastSyncedBlock) {
                this.lastSyncedBlock = log.blockNumber;
            }
        }
    }

    rollbackToBlock(targetBlockNumber) {
        this.eventLogs = this.eventLogs.filter((e) => e.blockNumber <= targetBlockNumber);
        this.processedLogs.clear();
        for (const log of this.eventLogs) {
            this.processedLogs.add(`${log.transactionHash.toLowerCase()}-${log.logIndex}`);
        }
        this.initializeTree();
        this.lastSyncedBlock = 0n;
        for (const log of this.eventLogs) {
            this.insertLeaf(BigInt(log.commitment));
            if (log.blockNumber > this.lastSyncedBlock) {
                this.lastSyncedBlock = log.blockNumber;
            }
        }
    }

    reset() {
        this.eventLogs = [];
        this.processedLogs.clear();
        this.lastSyncedBlock = 0n;
        this.initializeTree();
    }

    insertLeaf(leaf) {
        if (this.nextIndex >= 2 ** exports.TREE_DEPTH) {
            throw new Error("Merkle tree is full (capacity 2^20 exceeded).");
        }
        const insertedIndex = this.nextIndex;
        let currentIndex = insertedIndex;
        let currentLevelHash = leaf;
        let left;
        let right;
        for (let i = 0; i < exports.TREE_DEPTH; i++) {
            if (currentIndex % 2 === 0) {
                left = currentLevelHash;
                right = this.zeros[i];
                this.filledSubtrees[i] = currentLevelHash;
            }
            else {
                left = this.filledSubtrees[i];
                right = currentLevelHash;
            }
            currentLevelHash = this.F.toObject(this.poseidon([left, right]));
            currentIndex = Math.floor(currentIndex / 2);
        }
        const newRootIndex = (this.currentRootIndex + 1) % exports.ROOT_HISTORY_SIZE;
        this.currentRootIndex = newRootIndex;
        this.roots[newRootIndex] = currentLevelHash;
        this.leaves.push(leaf);
        this.nextIndex = insertedIndex + 1;
        return insertedIndex;
    }

    getLastRoot() {
        return ("0x" + this.roots[this.currentRootIndex].toString(16).padStart(64, "0"));
    }

    getMerklePath(commitment) {
        const targetBn = BigInt(commitment);
        const leafIndex = this.leaves.findIndex((l) => l === targetBn);
        if (leafIndex === -1) {
            throw new Error(`Commitment ${commitment} not found in indexed Merkle tree.`);
        }
        return this.getMerklePathByLeafIndex(leafIndex);
    }

    getMerklePathByLeafIndex(leafIndex) {
        if (leafIndex < 0 || leafIndex >= this.leaves.length) {
            throw new Error(`Leaf index ${leafIndex} out of bounds (current leaves count: ${this.leaves.length}).`);
        }
        const commitment = ("0x" + this.leaves[leafIndex].toString(16).padStart(64, "0"));
        const pathElements = [];
        const pathIndices = [];
        let currentIndex = leafIndex;
        let currentLevelNodes = [...this.leaves];
        for (let level = 0; level < exports.TREE_DEPTH; level++) {
            const isRight = currentIndex % 2 === 1;
            pathIndices.push(isRight ? 1 : 0);
            const siblingIndex = isRight ? currentIndex - 1 : currentIndex + 1;
            let siblingValue;
            if (siblingIndex < currentLevelNodes.length) {
                siblingValue = currentLevelNodes[siblingIndex];
            }
            else {
                siblingValue = this.zeros[level];
            }
            pathElements.push(("0x" + siblingValue.toString(16).padStart(64, "0")));
            const nextLevelNodes = [];
            const numPairs = Math.ceil(currentLevelNodes.length / 2);
            for (let p = 0; p < numPairs; p++) {
                const l = currentLevelNodes[p * 2];
                const r = p * 2 + 1 < currentLevelNodes.length ? currentLevelNodes[p * 2 + 1] : this.zeros[level];
                nextLevelNodes.push(this.F.toObject(this.poseidon([l, r])));
            }
            currentLevelNodes = nextLevelNodes;
            currentIndex = Math.floor(currentIndex / 2);
        }
        return {
            root: this.getLastRoot(),
            leaf: commitment,
            index: leafIndex,
            pathElements,
            pathIndices,
        };
    }

    verifyMerklePath(commitment, path) {
        if (path.pathElements.length !== exports.TREE_DEPTH || path.pathIndices.length !== exports.TREE_DEPTH) {
            return false;
        }
        let currentHash = BigInt(commitment);
        for (let i = 0; i < exports.TREE_DEPTH; i++) {
            const sibling = BigInt(path.pathElements[i]);
            const isRight = path.pathIndices[i] === 1;
            const left = isRight ? sibling : currentHash;
            const right = isRight ? currentHash : sibling;
            currentHash = this.F.toObject(this.poseidon([left, right]));
        }
        const computedRootHex = ("0x" + currentHash.toString(16).padStart(64, "0")).toLowerCase();
        return computedRootHex === path.root.toLowerCase();
    }

    isKnownRoot(rootHex) {
        const rootBn = BigInt(rootHex);
        return this.roots.includes(rootBn);
    }
}
exports.MerkleTreeIndexer = MerkleTreeIndexer;
