import { usePublicClient } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { parseAbiItem, formatUnits } from "viem";
import { siteConfig } from "@/config/site";
import { primaryChainConfig } from "@/config/network";

export interface TransactionRecord {
  hash: string;
  blockNumber: bigint;
  type: "incoming" | "outgoing";
  counterparty: string;
  amount: string;
  symbol: string;
}

const transferEvent = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)"
);

export function useRecentTransactions(address?: `0x${string}`, enabled = true) {
  const publicClient = usePublicClient({ chainId: primaryChainConfig.chainId });

  return useQuery({
    queryKey: ["recentTransactions", address, primaryChainConfig.chainId],
    queryFn: async (): Promise<TransactionRecord[]> => {
      if (!publicClient || !address) return [];

      const latestBlock = await publicClient.getBlockNumber();
      // Look back up to 3000 blocks to stay safely within the 10,000 block RPC limit
      const fromBlock = latestBlock > 3000n ? latestBlock - 3000n : 0n;

      // Query incoming and outgoing transfer logs for USDG
      const [incomingLogs, outgoingLogs] = await Promise.all([
        publicClient.getLogs({
          address: siteConfig.tokens.usdg.address as `0x${string}`,
          event: transferEvent,
          args: { to: address },
          fromBlock,
          toBlock: "latest",
        }),
        publicClient.getLogs({
          address: siteConfig.tokens.usdg.address as `0x${string}`,
          event: transferEvent,
          args: { from: address },
          fromBlock,
          toBlock: "latest",
        }),
      ]);

      const records: TransactionRecord[] = [];

      for (const log of incomingLogs) {
        if (log.args.value !== undefined && log.args.from) {
          records.push({
            hash: log.transactionHash,
            blockNumber: log.blockNumber,
            type: "incoming",
            counterparty: log.args.from,
            amount: formatUnits(log.args.value, siteConfig.tokens.usdg.decimals),
            symbol: "USDG",
          });
        }
      }

      for (const log of outgoingLogs) {
        if (log.args.value !== undefined && log.args.to) {
          records.push({
            hash: log.transactionHash,
            blockNumber: log.blockNumber,
            type: "outgoing",
            counterparty: log.args.to,
            amount: formatUnits(log.args.value, siteConfig.tokens.usdg.decimals),
            symbol: "USDG",
          });
        }
      }

      // Sort descending by block number
      records.sort((a, b) => (b.blockNumber > a.blockNumber ? 1 : -1));
      return records;
    },
    enabled: Boolean(enabled && address && publicClient),
    staleTime: 20_000,
    refetchInterval: 30_000,
  });
}
