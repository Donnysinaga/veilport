/**
 * VEILPORT Merkle Tree Incremental Indexer
 * Reconstructs the exact depth-20 incremental binary Merkle tree from on-chain Deposit events.
 * Computes deterministic historical roots, Merkle inclusion paths, and sibling elements.
 * Supports chain reorg rollbacks, gap detection, deterministic re-indexing, and local path verification.
 */

import { buildPoseidon } from "circomlibjs";

export const TREE_DEPTH = 20;
export const ROOT_HISTORY_SIZE = 30;
export const FIELD_SIZE = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

export interface DepositEventLog {
  commitment: `0x${string}`;
  leafIndex: number;
  timestamp?: number;
  blockNumber: bigint;
  transactionHash: `0x${string}`;
  logIndex: number;
}

export interface MerklePathResult {
  root: `0x${string}`;
  leaf: `0x${string}`;
  index: number;
  pathElements: `0x${string}`[];
  pathIndices: number[];
}

export class MerkleTreeIndexer {
  public zeros: bigint[] = [];
  public filledSubtrees: bigint[] = [];
  public roots: bigint[] = [];
  public currentRootIndex = 0;
  public nextIndex = 0;
  public leaves: bigint[] = [];
  public poseidon: any = null;
  public F: any = null;

  public eventLogs: DepositEventLog[] = [];
  public lastSyncedBlock: bigint = 0n;
  private processedLogs = new Set<string>();

  private constructor() {}

  public static async create(): Promise<MerkleTreeIndexer> {
    const tree = new MerkleTreeIndexer();
    tree.poseidon = await buildPoseidon();
    tree.F = tree.poseidon.F;
    tree.initializeTree();
    return tree;
  }

  /**
   * Initializes tree zero values and empty root matching MerkleTreeWithHistory.sol
   * Initial zero: keccak256("veilport") % FIELD_SIZE
   */
  public initializeTree(): void {
    let currentZero = 1231485639937371399050710718397366083998595347190416894436855383329780404878n;
    this.zeros = [currentZero];
    this.filledSubtrees = [currentZero];

    for (let i = 1; i < TREE_DEPTH; i++) {
      currentZero = this.F.toObject(this.poseidon([currentZero, currentZero]));
      this.zeros.push(currentZero);
      this.filledSubtrees.push(currentZero);
    }

    const initialRoot = this.F.toObject(this.poseidon([currentZero, currentZero]));
    this.roots = Array(ROOT_HISTORY_SIZE).fill(0n);
    this.roots[0] = initialRoot;
    this.currentRootIndex = 0;
    this.nextIndex = 0;
    this.leaves = [];
  }

  /**
   * Ingests and processes a batch of deposit event logs deterministically.
   * Handles out-of-order logs, duplicate RPC events, and checks for sequence gaps.
   */
  public ingestEvents(events: DepositEventLog[]): void {
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
      return; // All events were duplicates / already processed
    }

    // Sort all events by blockNumber, then logIndex to ensure deterministic linear tree ordering
    this.eventLogs.sort((a, b) => {
      if (a.blockNumber !== b.blockNumber) {
        return a.blockNumber < b.blockNumber ? -1 : 1;
      }
      return a.logIndex - b.logIndex;
    });

    // Check capacity
    if (this.eventLogs.length > 2 ** TREE_DEPTH) {
      throw new Error("Merkle tree capacity exceeded (max 1048576 leaves).");
    }

    // Validate sequential leafIndex integrity and commitment bounds
    for (let i = 0; i < this.eventLogs.length; i++) {
      const log = this.eventLogs[i];
      if (log.leafIndex !== i) {
        throw new Error(
          `Non-sequential leaf indices detected in event history: expected index ${i}, got ${log.leafIndex} at block ${log.blockNumber}. Missing intermediate events.`
        );
      }
      const leafBn = BigInt(log.commitment);
      if (leafBn >= FIELD_SIZE || leafBn <= 0n) {
        throw new Error(`Deposit commitment at index ${i} is not a valid scalar field element in Fr.`);
      }
    }

    // Replay leaves to build the exact tree state
    this.initializeTree();
    this.lastSyncedBlock = 0n;
    for (const log of this.eventLogs) {
      this.insertLeaf(BigInt(log.commitment));
      if (log.blockNumber > this.lastSyncedBlock) {
        this.lastSyncedBlock = log.blockNumber;
      }
    }
  }

  /**
   * Reorganizes state back to a specified block number after a chain reorg.
   * Removes all events above targetBlockNumber and deterministically re-indexes.
   */
  public rollbackToBlock(targetBlockNumber: bigint): void {
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

  /**
   * Clears all state and event history.
   */
  public reset(): void {
    this.eventLogs = [];
    this.processedLogs.clear();
    this.lastSyncedBlock = 0n;
    this.initializeTree();
  }

  /**
   * Inserts a single commitment leaf into the tree matching Solidity MerkleTreeWithHistory._insert
   */
  public insertLeaf(leaf: bigint): number {
    if (this.nextIndex >= 2 ** TREE_DEPTH) {
      throw new Error("Merkle tree is full (capacity 2^20 exceeded).");
    }

    const insertedIndex = this.nextIndex;
    let currentIndex = insertedIndex;
    let currentLevelHash = leaf;
    let left: bigint;
    let right: bigint;

    for (let i = 0; i < TREE_DEPTH; i++) {
      if (currentIndex % 2 === 0) {
        left = currentLevelHash;
        right = this.zeros[i];
        this.filledSubtrees[i] = currentLevelHash;
      } else {
        left = this.filledSubtrees[i];
        right = currentLevelHash;
      }
      currentLevelHash = this.F.toObject(this.poseidon([left, right]));
      currentIndex = Math.floor(currentIndex / 2);
    }

    const newRootIndex = (this.currentRootIndex + 1) % ROOT_HISTORY_SIZE;
    this.currentRootIndex = newRootIndex;
    this.roots[newRootIndex] = currentLevelHash;

    this.leaves.push(leaf);
    this.nextIndex = insertedIndex + 1;

    return insertedIndex;
  }

  /**
   * Returns the latest computed Merkle root in bytes32 format.
   */
  public getLastRoot(): `0x${string}` {
    return ("0x" + this.roots[this.currentRootIndex].toString(16).padStart(64, "0")) as `0x${string}`;
  }

  /**
   * Computes the Merkle inclusion proof for a known commitment leaf.
   */
  public getMerklePath(commitment: `0x${string}`): MerklePathResult {
    const targetBn = BigInt(commitment);
    const leafIndex = this.leaves.findIndex((l) => l === targetBn);

    if (leafIndex === -1) {
      throw new Error(`Commitment ${commitment} not found in indexed Merkle tree.`);
    }

    return this.getMerklePathByLeafIndex(leafIndex);
  }

  /**
   * Computes the Merkle inclusion proof by leaf index position.
   */
  public getMerklePathByLeafIndex(leafIndex: number): MerklePathResult {
    if (leafIndex < 0 || leafIndex >= this.leaves.length) {
      throw new Error(`Leaf index ${leafIndex} out of bounds (current leaves count: ${this.leaves.length}).`);
    }

    const commitment = ("0x" + this.leaves[leafIndex].toString(16).padStart(64, "0")) as `0x${string}`;
    const pathElements: `0x${string}`[] = [];
    const pathIndices: number[] = [];

    let currentIndex = leafIndex;
    let currentLevelNodes: bigint[] = [...this.leaves];

    for (let level = 0; level < TREE_DEPTH; level++) {
      const isRight = currentIndex % 2 === 1;
      pathIndices.push(isRight ? 1 : 0);

      const siblingIndex = isRight ? currentIndex - 1 : currentIndex + 1;

      let siblingValue: bigint;
      if (siblingIndex < currentLevelNodes.length) {
        siblingValue = currentLevelNodes[siblingIndex];
      } else {
        siblingValue = this.zeros[level];
      }

      pathElements.push(("0x" + siblingValue.toString(16).padStart(64, "0")) as `0x${string}`);

      // Next level reduction
      const nextLevelNodes: bigint[] = [];
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

  /**
   * Recomputes and verifies the Merkle root locally using the sibling path elements and Poseidon.
   * Matches Circom MerkleTreeInclusionProof circuit semantics.
   */
  public verifyMerklePath(commitment: `0x${string}`, path: MerklePathResult): boolean {
    if (path.pathElements.length !== TREE_DEPTH || path.pathIndices.length !== TREE_DEPTH) {
      return false;
    }

    let currentHash = BigInt(commitment);
    for (let i = 0; i < TREE_DEPTH; i++) {
      const sibling = BigInt(path.pathElements[i]);
      const isRight = path.pathIndices[i] === 1;

      const left = isRight ? sibling : currentHash;
      const right = isRight ? currentHash : sibling;

      currentHash = this.F.toObject(this.poseidon([left, right]));
    }

    const computedRootHex = ("0x" + currentHash.toString(16).padStart(64, "0")).toLowerCase();
    return computedRootHex === path.root.toLowerCase();
  }

  /**
   * Verifies if a root is among the latest 30 historical roots buffer.
   */
  public isKnownRoot(rootHex: string): boolean {
    const rootBn = BigInt(rootHex);
    return this.roots.includes(rootBn);
  }
}
