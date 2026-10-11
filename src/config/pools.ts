/**
 * VEILPORT Privacy Protocol Deployment & Pool Registry
 * Configures verified pool contracts, denominations, and decimals.
 */

export interface PoolConfig {
  address: `0x${string}` | null;
  asset: "ETH" | "USDG";
  denomination: string; // e.g. "0.1", "1.0", "100"
  decimals: number;
  rawUnits: bigint;
  status: "verified_local" | "unconfigured";
}

const getPoolAddress = (envVar: string | undefined): `0x${string}` | null => {
  if (envVar && envVar.startsWith("0x") && envVar.length === 42) {
    return envVar as `0x${string}`;
  }
  return null;
};

export const SUPPORTED_POOLS: Record<number, Record<string, PoolConfig>> = {
  // Chain ID 1337 (Local EVM / Development)
  1337: {
    "ETH-0.1": {
      address: getPoolAddress(process.env.NEXT_PUBLIC_LOCAL_ETH_01_POOL),
      asset: "ETH",
      denomination: "0.1",
      decimals: 18,
      rawUnits: 100000000000000000n,
      status: "verified_local",
    },
    "ETH-1.0": {
      address: getPoolAddress(process.env.NEXT_PUBLIC_LOCAL_ETH_10_POOL),
      asset: "ETH",
      denomination: "1.0",
      decimals: 18,
      rawUnits: 1000000000000000000n, // 1 ETH
      status: "verified_local",
    },
    "ETH-10.0": {
      address: getPoolAddress(process.env.NEXT_PUBLIC_LOCAL_ETH_100_POOL),
      asset: "ETH",
      denomination: "10.0",
      decimals: 18,
      rawUnits: 10000000000000000000n,
      status: "verified_local",
    },
    "USDG-100": {
      address: getPoolAddress(process.env.NEXT_PUBLIC_LOCAL_USDG_100_POOL),
      asset: "USDG",
      denomination: "100",
      decimals: 6,
      rawUnits: 100000000n, // 100 USDG (6 decimals)
      status: "verified_local",
    },
    "USDG-1000": {
      address: getPoolAddress(process.env.NEXT_PUBLIC_LOCAL_USDG_1000_POOL),
      asset: "USDG",
      denomination: "1000",
      decimals: 6,
      rawUnits: 1000000000n,
      status: "verified_local",
    },
    "USDG-10000": {
      address: getPoolAddress(process.env.NEXT_PUBLIC_LOCAL_USDG_10000_POOL),
      asset: "USDG",
      denomination: "10000",
      decimals: 6,
      rawUnits: 10000000000n,
      status: "verified_local",
    },
  },
  // Chain ID 4663 (Robinhood Chain)
  4663: {
    "ETH-0.1": {
      address: getPoolAddress(process.env.NEXT_PUBLIC_ETH_01_POOL),
      asset: "ETH",
      denomination: "0.1",
      decimals: 18,
      rawUnits: 100000000000000000n,
      status: getPoolAddress(process.env.NEXT_PUBLIC_ETH_01_POOL) ? "verified_local" : "unconfigured",
    },
    "ETH-1.0": {
      address: getPoolAddress(process.env.NEXT_PUBLIC_ETH_10_POOL),
      asset: "ETH",
      denomination: "1.0",
      decimals: 18,
      rawUnits: 1000000000000000000n,
      status: getPoolAddress(process.env.NEXT_PUBLIC_ETH_10_POOL) ? "verified_local" : "unconfigured",
    },
    "ETH-10.0": {
      address: getPoolAddress(process.env.NEXT_PUBLIC_ETH_100_POOL),
      asset: "ETH",
      denomination: "10.0",
      decimals: 18,
      rawUnits: 10000000000000000000n,
      status: getPoolAddress(process.env.NEXT_PUBLIC_ETH_100_POOL) ? "verified_local" : "unconfigured",
    },
    "USDG-100": {
      address: getPoolAddress(process.env.NEXT_PUBLIC_USDG_100_POOL),
      asset: "USDG",
      denomination: "100",
      decimals: 6,
      rawUnits: 100000000n,
      status: getPoolAddress(process.env.NEXT_PUBLIC_USDG_100_POOL) ? "verified_local" : "unconfigured",
    },
    "USDG-1000": {
      address: getPoolAddress(process.env.NEXT_PUBLIC_USDG_1000_POOL),
      asset: "USDG",
      denomination: "1000",
      decimals: 6,
      rawUnits: 1000000000n,
      status: getPoolAddress(process.env.NEXT_PUBLIC_USDG_1000_POOL) ? "verified_local" : "unconfigured",
    },
    "USDG-10000": {
      address: getPoolAddress(process.env.NEXT_PUBLIC_USDG_10000_POOL),
      asset: "USDG",
      denomination: "10000",
      decimals: 6,
      rawUnits: 10000000000n,
      status: getPoolAddress(process.env.NEXT_PUBLIC_USDG_10000_POOL) ? "verified_local" : "unconfigured",
    },
  },
};

export const POOL_ABI = [
  {
    inputs: [{ internalType: "bytes32", name: "commitment", type: "bytes32" }],
    name: "deposit",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "bytes", name: "proof", type: "bytes" },
      { internalType: "bytes32", name: "root", type: "bytes32" },
      { internalType: "bytes32", name: "nullifierHash", type: "bytes32" },
      { internalType: "address payable", name: "recipient", type: "address" },
      { internalType: "address payable", name: "relayer", type: "address" },
      { internalType: "uint256", name: "fee", type: "uint256" },
    ],
    name: "withdraw",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "bytes32", name: "_root", type: "bytes32" }],
    name: "isKnownRoot",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "bytes32", name: "", type: "bytes32" }],
    name: "nullifierSpent",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getLastRoot",
    outputs: [{ internalType: "bytes32", name: "", type: "bytes32" }],
    stateMutability: "view",
    type: "function",
  },
] as const;
