import { useQuery } from "@tanstack/react-query";

export interface EthPriceResponse {
  symbol: "ETH";
  currency: "USD";
  price: number | null;
  lastUpdatedAt: number | null;
  fetchedAt?: number;
  source?: string;
  isStale?: boolean;
  warning?: string;
  error?: string;
  status?: string;
}

async function fetchEthPrice(): Promise<EthPriceResponse> {
  const res = await fetch("/api/prices/eth", {
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    const errJson = await res.json().catch(() => null);
    throw new Error(errJson?.error || `Price service returned HTTP ${res.status}`);
  }

  const data: EthPriceResponse = await res.json();
  if (typeof data.price !== "number" || !Number.isFinite(data.price) || data.price <= 0) {
    throw new Error("Invalid price received from service");
  }

  return data;
}

export function useEthPrice() {
  const query = useQuery<EthPriceResponse>({
    queryKey: ["ethMarketPrice"],
    queryFn: fetchEthPrice,
    staleTime: 45_000, // Consider fresh for 45s
    refetchInterval: 60_000, // Poll every minute
    retry: 2,
    retryDelay: 3_000,
  });

  return {
    price: query.data?.price ?? null,
    lastUpdatedAt: query.data?.lastUpdatedAt ?? null,
    isStale: query.data?.isStale ?? false,
    source: query.data?.source ?? "Centralized Market Service",
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error instanceof Error ? query.error.message : null,
    refetch: query.refetch,
  };
}
