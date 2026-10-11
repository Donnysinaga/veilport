export interface ChainConfig {
  chainId: number;
  name: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  rpcUrl: string;
  fallbackRpcUrl: string;
  blockscoutApiUrl: string;
  explorerUrl: string;
}

export const primaryChainConfig: ChainConfig = {
  chainId: 4663,
  name: "Robinhood Chain",
  nativeCurrency: {
    name: "Ether",
    symbol: "ETH",
    decimals: 18,
  },
  rpcUrl: process.env.NEXT_PUBLIC_RPC_URL || "https://rpc-robinhood.blockmachine.io",
  fallbackRpcUrl: process.env.NEXT_PUBLIC_RPC_FALLBACK_URL || "https://robinhood.rpc.blxrbdn.com",
  blockscoutApiUrl: "https://robinhoodchain.blockscout.com/api/v2",
  explorerUrl: "https://robinhoodchain.blockscout.com",
};
