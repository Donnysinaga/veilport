import { siteConfig } from "@/config/site";

export interface LogoResolutionResult {
  symbol: string;
  name: string;
  logoUrl: string;
  isVerified: boolean;
  address?: string | null;
}

const VERIFIED_TOKENS: Record<string, LogoResolutionResult> = {
  // Address-based mapping (lowercase)
  "native": {
    symbol: "ETH",
    name: "Ether",
    logoUrl: "/images/veilport/icons/tokens/eth.svg",
    isVerified: true,
    address: null,
  },
  "0x5fc5360d0400a0fd4f2af552add042d716f1d168": {
    symbol: "USDG",
    name: "Global Dollar",
    logoUrl: "/images/veilport/icons/tokens/usdg.svg",
    isVerified: true,
    address: "0x5fc5360d0400a0fd4f2af552add042d716f1d168",
  },
  "0x0009cd492adf8167f9eebf1293556a673530a21a": {
    symbol: "BTC",
    name: "Bitcoin",
    logoUrl: "/images/veilport/icons/tokens/btc.svg",
    isVerified: true,
    address: "0x0009cD492adf8167f9eEBf1293556A673530a21a",
  },
};

const SYMBOL_FALLBACKS: Record<string, LogoResolutionResult> = {
  ETH: VERIFIED_TOKENS["native"],
  USDG: VERIFIED_TOKENS["0x5fc5360d0400a0fd4f2af552add042d716f1d168"],
  BTC: VERIFIED_TOKENS["0x0009cd492adf8167f9eebf1293556a673530a21a"],
};

export function resolveTokenLogo(addressOrSymbol?: string | null): LogoResolutionResult {
  if (!addressOrSymbol) {
    return {
      symbol: "TOKEN",
      name: "Unknown Asset",
      logoUrl: "/images/veilport/icons/tokens/fallback.svg",
      isVerified: false,
    };
  }

  const clean = addressOrSymbol.toLowerCase().trim();

  if (clean === "native" || clean === "eth") {
    return VERIFIED_TOKENS["native"];
  }

  if (VERIFIED_TOKENS[clean]) {
    return VERIFIED_TOKENS[clean];
  }

  const symbolUpper = addressOrSymbol.toUpperCase().trim();
  if (SYMBOL_FALLBACKS[symbolUpper]) {
    return SYMBOL_FALLBACKS[symbolUpper];
  }

  // Consistent neutral fallback for unverified or unknown tokens
  return {
    symbol: symbolUpper,
    name: symbolUpper,
    logoUrl: "/images/veilport/icons/tokens/fallback.svg",
    isVerified: false,
  };
}
