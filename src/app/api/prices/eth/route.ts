import { NextResponse } from "next/server";

interface CachedPrice {
  price: number;
  lastUpdatedAt: number;
  fetchedAt: number;
  source: string;
}

let cachedData: CachedPrice | null = null;
const CACHE_FRESH_MS = 60_000; // 1 minute
const CACHE_MAX_STALE_MS = 300_000; // 5 minutes max stale fallback

export async function GET() {
  const now = Date.now();

  // Return fresh cache if available
  if (cachedData && now - cachedData.fetchedAt < CACHE_FRESH_MS) {
    return NextResponse.json(
      {
        symbol: "ETH",
        currency: "USD",
        price: cachedData.price,
        lastUpdatedAt: cachedData.lastUpdatedAt,
        fetchedAt: cachedData.fetchedAt,
        source: cachedData.source,
        isStale: false,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
        },
      }
    );
  }

  // Attempt to fetch from CoinGecko
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd&include_last_updated_at=true",
      {
        headers: {
          Accept: "application/json",
          "User-Agent": "Veilport/1.0",
        },
        signal: controller.signal,
        next: { revalidate: 60 },
      }
    );

    clearTimeout(timeoutId);

    if (res.ok) {
      const json = await res.json();
      const rawPrice = json?.ethereum?.usd;
      const rawUpdatedAt = json?.ethereum?.last_updated_at;

      if (typeof rawPrice === "number" && Number.isFinite(rawPrice) && rawPrice > 0) {
        const lastUpdatedAt = typeof rawUpdatedAt === "number" ? rawUpdatedAt * 1000 : now;
        cachedData = {
          price: rawPrice,
          lastUpdatedAt,
          fetchedAt: now,
          source: "CoinGecko Market API",
        };

        return NextResponse.json(
          {
            symbol: "ETH",
            currency: "USD",
            price: cachedData.price,
            lastUpdatedAt: cachedData.lastUpdatedAt,
            fetchedAt: cachedData.fetchedAt,
            source: cachedData.source,
            isStale: false,
          },
          {
            headers: {
              "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
            },
          }
        );
      }
    }
  } catch (err: any) {
    // Network / abort / upstream error
    console.warn("[ETH Price Service] CoinGecko fetch failed:", err?.message || err);
  }

  // Fallback to stale cache if within tolerance
  if (cachedData && now - cachedData.fetchedAt < CACHE_MAX_STALE_MS) {
    return NextResponse.json(
      {
        symbol: "ETH",
        currency: "USD",
        price: cachedData.price,
        lastUpdatedAt: cachedData.lastUpdatedAt,
        fetchedAt: cachedData.fetchedAt,
        source: cachedData.source,
        isStale: true,
        warning: "Serving cached price due to temporary upstream unavailability",
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
        },
      }
    );
  }

  // If no cache or cache too stale, return explicit unavailable state
  return NextResponse.json(
    {
      symbol: "ETH",
      currency: "USD",
      price: null,
      lastUpdatedAt: null,
      isStale: false,
      error: "ETH/USD market price currently unavailable from provider.",
      status: "unavailable",
    },
    {
      status: 503,
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
