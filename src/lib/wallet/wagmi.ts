import { http, fallback, createConfig } from "wagmi";
import { defineChain } from "viem";
import { injected, metaMask, coinbaseWallet, walletConnect } from "wagmi/connectors";
import { primaryChainConfig } from "@/config/network";

export const robinhoodChain = defineChain({
  id: primaryChainConfig.chainId,
  name: primaryChainConfig.name,
  nativeCurrency: primaryChainConfig.nativeCurrency,
  rpcUrls: {
    default: {
      http: [primaryChainConfig.rpcUrl, primaryChainConfig.fallbackRpcUrl],
    },
    public: {
      http: [primaryChainConfig.rpcUrl, primaryChainConfig.fallbackRpcUrl],
    },
  },
  blockExplorers: {
    default: {
      name: "Robinscan / Blockscout",
      url: primaryChainConfig.explorerUrl,
    },
  },
});

const wcProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "3a8170812b534d0ff9d794f19a901d64";

// Safely detect and isolate OKX Wallet injected provider
function getOkxProvider(win?: any) {
  if (typeof win === "undefined") return undefined;
  // 1. Dedicated window.okxwallet provider
  if (win.okxwallet) return win.okxwallet;
  // 2. Multi-provider array within window.ethereum (EIP-5749 / EIP-6963 or extension conflict resolution)
  if (win.ethereum?.providers?.length) {
    const okx = win.ethereum.providers.find((p: any) => p.isOkxWallet);
    if (okx) return okx;
  }
  // 3. Directly flagged window.ethereum
  if (win.ethereum?.isOkxWallet) {
    return win.ethereum;
  }
  return undefined;
}

// Safely detect and isolate MetaMask injected provider
function getMetaMaskProvider(win?: any) {
  if (typeof win === "undefined") return undefined;
  // 1. Multi-provider array within window.ethereum (exclude OKX or conflicting providers)
  if (win.ethereum?.providers?.length) {
    const mm = win.ethereum.providers.find((p: any) => p.isMetaMask && !p.isOkxWallet);
    if (mm) return mm;
  }
  // 2. Directly flagged window.ethereum (ensure not OKX)
  if (win.ethereum?.isMetaMask && !win.ethereum?.isOkxWallet) {
    return win.ethereum;
  }
  return undefined;
}

export const wagmiConfig = createConfig({
  chains: [robinhoodChain],
  connectors: [
    injected({
      target() {
        return {
          id: "metaMask",
          name: "MetaMask",
          provider(win) {
            return getMetaMaskProvider(win);
          },
        };
      },
    }),
    metaMask(),
    coinbaseWallet({
      appName: "VEILPORT",
      preference: {
        options: "all",
        telemetry: false,
      },
    }),
    injected({
      target() {
        return {
          id: "okxWallet",
          name: "OKX Wallet",
          provider(win) {
            return getOkxProvider(win);
          },
        };
      },
    }),
    injected({ target: "rainbow" }),
    ...(typeof window !== "undefined"
      ? [walletConnect({ projectId: wcProjectId, showQrModal: true })]
      : []),
  ],
  transports: {
    [robinhoodChain.id]: fallback([
      http(primaryChainConfig.rpcUrl, { timeout: 10_000 }),
      http(primaryChainConfig.fallbackRpcUrl, { timeout: 10_000 }),
    ]),
  },
  ssr: true,
});
