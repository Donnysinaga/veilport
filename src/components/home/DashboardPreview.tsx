"use client";

import Image from "next/image";
import { useState } from "react";
import { useAccount, useBalance, useBlockNumber, useReadContract, useSwitchChain } from "wagmi";
import { erc20Abi, formatUnits } from "viem";
import { 
  ArrowUpRight, 
  ArrowDownLeft, 
  ExternalLink, 
  Shield, 
  Copy, 
  Check, 
  RefreshCw,
  Lock,
  Layers,
  Activity,
  Wallet,
  AlertTriangle
} from "lucide-react";
import { siteConfig } from "@/config/site";
import { primaryChainConfig } from "@/config/network";
import { resolveTokenLogo } from "@/lib/token/logo-resolver";
import { useRecentTransactions } from "@/lib/wallet/useRecentTransactions";
import { useEthPrice } from "@/lib/price/useEthPrice";
import { ConnectWalletModal } from "../wallet/ConnectWalletModal";
import { ShieldModal } from "../privacy/ShieldModal";

export function DashboardPreview() {
  const { address, isConnected, chainId } = useAccount();
  const { switchChain, isPending: isSwitchingChain } = useSwitchChain();
  const isWrongChain = isConnected && chainId !== primaryChainConfig.chainId;

  const { data: ethBalance, isLoading: isBalanceLoading, isError: isEthError, refetch: refetchEth } = useBalance({ 
    address, 
    chainId: primaryChainConfig.chainId,
    query: {
      enabled: Boolean(isConnected && address && !isWrongChain),
      staleTime: 10_000,
    },
  });

  const { data: rawUsdgBalance, isLoading: isUsdgLoading, isError: isUsdgError, refetch: refetchUsdg } = useReadContract({
    address: siteConfig.tokens.usdg.address as `0x${string}`,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: primaryChainConfig.chainId,
    query: {
      enabled: Boolean(isConnected && address && !isWrongChain),
      staleTime: 10_000,
    },
  });


  const {
    data: recentTxs,
    isLoading: isTxsLoading,
    isError: isTxsError,
    refetch: refetchTxs,
  } = useRecentTransactions(address, Boolean(isConnected && address && !isWrongChain));

  const { 
    data: blockNumber, 
    isLoading: isNetworkLoading, 
    isError: isNetworkError, 
    isSuccess: isNetworkSuccess 
  } = useBlockNumber({ 
    chainId: primaryChainConfig.chainId,
    query: {
      refetchInterval: 12_000,
    }
  });

  const [activeTab, setActiveTab] = useState<"balances" | "history">("balances");
  const [copied, setCopied] = useState<string | null>(null);
  const [shieldNotice, setShieldNotice] = useState<string | null>(null);
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [shieldModalAsset, setShieldModalAsset] = useState<"ETH" | "USDG" | null>(null);

  const formattedEthBalance = !isConnected || isWrongChain
    ? "—"
    : isBalanceLoading
    ? "Loading..."
    : isEthError
    ? "Unavailable"
    : ethBalance
    ? parseFloat(ethBalance.formatted).toFixed(4)
    : "—";

  const formattedUsdgBalance = !isConnected || isWrongChain
    ? "—"
    : isUsdgLoading
    ? "Loading..."
    : isUsdgError
    ? "Unavailable"
    : rawUsdgBalance !== undefined
    ? Number(formatUnits(rawUsdgBalance as bigint, siteConfig.tokens.usdg.decimals)).toFixed(2)
    : "—";

  const {
    price: ethPrice,
    lastUpdatedAt: ethPriceUpdatedAt,
    isLoading: isPriceLoading,
    isError: isPriceError,
    refetch: refetchPrice,
  } = useEthPrice();

  // USDG is a verified dollar-pegged stablecoin.
  // Explicitly identified reference assumption: 1 USDG = 1.00 USD (Reference Peg)
  const USDG_REFERENCE_PEG = 1.0;

  const ethNumeric = (!isConnected || isWrongChain || isBalanceLoading || isEthError || !ethBalance)
    ? 0
    : parseFloat(ethBalance.formatted);
  const usdgNumeric = (!isConnected || isWrongChain || isUsdgLoading || isUsdgError || rawUsdgBalance === undefined)
    ? 0
    : Number(formatUnits(rawUsdgBalance as bigint, siteConfig.tokens.usdg.decimals));

  // If ETH balance > 0 but ETH market price is unavailable, never invent a price or default to zero
  const canCalculateEthUsd = ethPrice !== null && !isPriceLoading;
  const ethUsdValue = canCalculateEthUsd ? ethNumeric * ethPrice : null;
  const usdgUsdValue = usdgNumeric * USDG_REFERENCE_PEG;

  let formattedPortfolioUsd = "—";
  if (!isConnected || isWrongChain) {
    formattedPortfolioUsd = "—";
  } else if (isBalanceLoading || isUsdgLoading || (ethNumeric > 0 && isPriceLoading)) {
    formattedPortfolioUsd = "...";
  } else if (ethNumeric > 0 && !canCalculateEthUsd) {
    formattedPortfolioUsd = "Price Unavailable";
  } else {
    const totalUsd = (ethUsdValue ?? 0) + usdgUsdValue;
    formattedPortfolioUsd = `$${totalUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  const handleRefetch = () => {
    refetchEth();
    refetchUsdg();
    refetchTxs();
    refetchPrice();
  };

  // Supported asset rows with verified addresses
  const trackedTokens = [
    {
      symbol: "ETH",
      name: "Ether",
      address: null,
      balance: formattedEthBalance,
      usdValue: (!isConnected || isWrongChain)
        ? "—"
        : (isBalanceLoading || isPriceLoading)
        ? "..."
        : ethPrice !== null && ethBalance
        ? `~$${(ethNumeric * ethPrice).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : "Price Unavailable",
      status: "Available",
      isNative: true,
      shieldedSupported: true,
    },
    {
      symbol: "USDG",
      name: "Global Dollar",
      address: siteConfig.tokens.usdg.address,
      balance: formattedUsdgBalance,
      usdValue: (!isConnected || isWrongChain)
        ? "—"
        : isUsdgLoading
        ? "..."
        : rawUsdgBalance !== undefined
        ? `$${(usdgNumeric * USDG_REFERENCE_PEG).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : "Unavailable",
      status: "Verified",
      isNative: false,
      shieldedSupported: true,
    },
    {
      symbol: "BTC",
      name: "Bitcoin",
      address: siteConfig.tokens.btc.address,
      balance: "Reference Only",
      usdValue: "Oracle Feed Active",
      status: "Active Feed",
      isNative: false,
      shieldedSupported: false,
    },
  ];

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(text);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <section id="dashboard" className="relative py-24 sm:py-32 lg:py-40 border-t border-white/[0.06] bg-[#07080A] scroll-mt-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Heading */}
        <div className="max-w-3xl mb-14 sm:mb-18">
          <h2 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold text-white tracking-[-0.03em] leading-[1.12]">
            Your Portfolio <br className="hidden sm:inline" />
            <span className="silver-shimmer bg-clip-text text-transparent">at a Glance</span>
          </h2>
          <p className="mt-5 text-base sm:text-lg text-slate-300/80 leading-relaxed max-w-2xl">
            Track account holdings, review real-time valuations, and access privacy-focused transaction tools through a unified dashboard.
          </p>
        </div>

        {/* Bespoke Institutional Terminal Shell */}
        <div className="relative rounded-2xl border border-white/[0.08] bg-[#0A0C10] overflow-hidden shadow-2xl">
          {/* Subtle Geometric Backdrop with Deep Obsidian Blending */}
          <div className="absolute inset-0 z-0 opacity-10 pointer-events-none">
            <Image
              src="/images/veilport/backgrounds/dashboard-background.webp"
              alt="Dashboard Geometric Crystal Structure Backdrop"
              fill
              sizes="(max-width: 1280px) 100vw, 1280px"
              className="object-cover object-top"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-[#0A0C10]/95 via-[#0A0C10]/98 to-[#0A0C10]" />
          </div>

          {/* Interactive Content */}
          <div className="relative z-10 p-6 sm:p-8 lg:p-10">
            {/* Top Stat Bar - Seamless Architectural Grid with Hairline Dividers */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-white/[0.08] pb-8 border-b border-white/[0.08]">
              {/* Card 1: Wallet Connection Status */}
              <div className="py-4 sm:py-0 sm:px-5 first:pl-0">
                <div className="flex items-center justify-between text-xs font-mono text-slate-400">
                  <span className="tracking-wider uppercase">WALLET STATUS</span>
                  <div className="flex items-center gap-2">
                    {isConnected && address ? (
                      isWrongChain ? (
                        <span className="flex items-center gap-1.5 text-amber-400 text-xs">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                          Wrong Chain
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-emerald-400 text-xs">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          Connected
                        </span>
                      )
                    ) : (
                      <span className="flex items-center gap-1.5 text-slate-500 text-xs">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-600" />
                        Disconnected
                      </span>
                    )}
                    {isConnected && (
                      <button
                        onClick={handleRefetch}
                        className="p-1 hover:text-emerald-400 text-slate-500 transition-colors"
                        title="Refresh Balance"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isBalanceLoading || isUsdgLoading ? "animate-spin text-emerald-400" : ""}`} />
                      </button>
                    )}
                  </div>
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-2xl sm:text-3xl font-bold font-mono tracking-tight text-white tabular-nums">
                    {formattedEthBalance}
                  </span>
                  {isConnected && !isWrongChain && ethBalance && !isEthError && !isBalanceLoading && (
                    <span className="text-xs font-mono text-slate-400">ETH</span>
                  )}
                </div>
                <div className="mt-2 text-xs font-mono text-slate-500 truncate">
                  {isConnected && address ? (
                    isWrongChain ? (
                      <button
                        onClick={() => switchChain({ chainId: primaryChainConfig.chainId })}
                        disabled={isSwitchingChain}
                        className="text-amber-400 hover:underline flex items-center gap-1 text-[11px]"
                      >
                        <AlertTriangle className="w-3 h-3" />
                        <span>Switch to {primaryChainConfig.name}</span>
                      </button>
                    ) : (
                      <span>Account: {address.slice(0, 6)}...{address.slice(-4)}</span>
                    )
                  ) : (
                    <span>No wallet connected</span>
                  )}
                </div>
              </div>

              {/* Card 2: Estimated Portfolio Valuation */}
              <div className="py-4 sm:py-0 sm:px-5">
                <div className="flex items-center justify-between text-xs font-mono text-slate-400">
                  <span className="tracking-wider uppercase">PORTFOLIO VALUE</span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                      ethPrice !== null
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                        : isPriceLoading
                        ? "bg-white/[0.04] text-slate-400 border border-white/10"
                        : "bg-amber-400/10 text-amber-300 border border-amber-400/20"
                    }`}
                  >
                    {ethPrice !== null ? "LIVE" : isPriceLoading ? "FETCHING" : "UNAVAILABLE"}
                  </span>
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-2xl sm:text-3xl font-bold font-mono tracking-tight text-white tabular-nums">
                    {formattedPortfolioUsd}
                  </span>
                  {isConnected && !isWrongChain && formattedPortfolioUsd !== "Price Unavailable" && formattedPortfolioUsd !== "—" && (
                    <span className="text-xs font-mono text-slate-400">USD</span>
                  )}
                </div>
                <p
                  className="mt-2 text-xs text-slate-500 truncate"
                  title={
                    ethPrice !== null
                      ? `ETH: $${ethPrice.toLocaleString("en-US", { minimumFractionDigits: 2 })} · USDG: $1.00 USD reference peg`
                      : "ETH/USD market price unavailable"
                  }
                >
                  {isConnected && !isWrongChain
                    ? ethPrice !== null
                      ? `${formattedEthBalance} ETH · ${formattedUsdgBalance} USDG`
                      : isPriceLoading
                      ? "Fetching ETH market price..."
                      : "Market price unavailable"
                    : "Connect wallet to view portfolio"}
                </p>
              </div>

              {/* Card 3: Privacy Shield Status */}
              <div className="py-4 sm:py-0 sm:px-5">
                <div className="flex items-center justify-between text-xs font-mono text-slate-400">
                  <span className="tracking-wider uppercase">PRIVACY SHIELD</span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                    ACTIVE
                  </span>
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-2xl sm:text-3xl font-bold font-mono tracking-tight text-white">
                    Protected
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-500 truncate">
                  Client-side zero-knowledge proofs
                </p>
              </div>

              {/* Card 4: Network Connection Status */}
              <div className="py-4 sm:py-0 sm:px-5 last:pr-0">
                <div className="flex items-center justify-between text-xs font-mono text-slate-400">
                  <span className="tracking-wider uppercase">NETWORK</span>
                  {blockNumber ? (
                    <span className="flex items-center gap-1.5 text-emerald-400 text-xs">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      Active
                    </span>
                  ) : isNetworkLoading ? (
                    <span className="flex items-center gap-1.5 text-slate-400 text-xs">
                      <RefreshCw className="w-3 h-3 animate-spin text-slate-500" />
                      Verifying
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-amber-400 text-xs">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                      Offline
                    </span>
                  )}
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-2xl sm:text-3xl font-bold font-mono tracking-tight text-white tabular-nums">
                    {blockNumber ? `#${blockNumber.toString()}` : isNetworkLoading ? "Connecting..." : "Offline"}
                  </span>
                </div>
                <p className="mt-2 text-xs font-mono text-slate-500 truncate">
                  {primaryChainConfig.name} ({primaryChainConfig.chainId})
                </p>
              </div>
            </div>

            {/* Navigation Tabs */}
            <div className="mt-8 flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-1 p-1 rounded-xl bg-white/[0.03] border border-white/[0.08]">
                <button
                  onClick={() => setActiveTab("balances")}
                  className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                    activeTab === "balances"
                      ? "bg-white/[0.08] text-white shadow-sm"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Assets
                </button>
                <button
                  onClick={() => setActiveTab("history")}
                  className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                    activeTab === "history"
                      ? "bg-white/[0.08] text-white shadow-sm"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Activity
                </button>
              </div>

              {address && (
                <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
                  <span>Account:</span>
                  <span className="text-slate-200">{address.slice(0, 10)}...{address.slice(-6)}</span>
                  <a
                    href={`${primaryChainConfig.explorerUrl}/address/${address}`}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1 text-slate-400 hover:text-emerald-400 transition-colors"
                    title="View on Block Explorer"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              )}
            </div>

            {/* Tab 1: Asset Balances Table */}
            {activeTab === "balances" && (
              <div className="mt-6">
                {shieldNotice && (
                  <div className="mb-4 p-4 rounded-xl bg-amber-950/40 border border-amber-500/30 text-amber-200 text-xs flex items-center justify-between gap-3 animate-in fade-in duration-200">
                    <div className="flex items-center gap-2.5">
                      <Lock className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>{shieldNotice}</span>
                    </div>
                    <button
                      onClick={() => setShieldNotice(null)}
                      className="px-2.5 py-1 rounded-md bg-white/10 hover:bg-white/15 text-white text-xs font-mono transition shrink-0"
                    >
                      Dismiss
                    </button>
                  </div>
                )}

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-white/[0.08] text-[11px] font-mono text-slate-400 uppercase tracking-wider">
                        <th className="py-4 px-4">Asset</th>
                        <th className="py-4 px-4">Type</th>
                        <th className="py-4 px-4">Balance</th>
                        <th className="py-4 px-4">Est. Value</th>
                        <th className="py-4 px-4">Contract</th>
                        <th className="py-4 px-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.06] text-sm">
                      {trackedTokens.map((t) => {
                        const logoInfo = resolveTokenLogo(t.address || t.symbol);
                        return (
                          <tr key={t.symbol} className="hover:bg-white/[0.02] transition-colors">
                            <td className="py-4 px-4">
                              <div className="flex items-center gap-3.5">
                                <div className="w-9 h-9 rounded-xl bg-white/[0.03] border border-white/10 flex items-center justify-center overflow-hidden shrink-0">
                                  <Image
                                    src={logoInfo.logoUrl}
                                    alt={`${t.symbol} logo`}
                                    width={24}
                                    height={24}
                                    className="object-contain"
                                  />
                                </div>
                                <div>
                                  <span className="font-semibold text-white tracking-wide">{t.symbol}</span>
                                  <span className="block text-xs text-slate-400">{t.name}</span>
                                </div>
                              </div>
                            </td>
                            <td className="py-4 px-4 font-mono text-xs text-slate-400">
                              {t.isNative ? "Native" : t.symbol === "BTC" ? "Reference" : "ERC-20"}
                            </td>
                            <td className="py-4 px-4 font-mono text-white font-medium">
                              {t.symbol === "BTC" ? (
                                <span className="text-slate-500 font-mono text-xs">Reference Only</span>
                              ) : t.balance === "—" || t.balance === "Loading..." || t.balance === "Unavailable" ? (
                                <span className={t.balance === "Unavailable" ? "text-amber-400/90 text-xs" : "text-slate-500 text-xs"}>
                                  {t.balance}
                                </span>
                              ) : (
                                <span>{t.balance} {t.symbol}</span>
                              )}
                            </td>
                            <td className="py-4 px-4 font-mono text-xs text-slate-300">
                              {t.usdValue}
                            </td>
                            <td className="py-4 px-4 font-mono text-xs">
                              {t.address ? (
                                <div className="flex items-center gap-2">
                                  <span className="text-slate-300">
                                    {t.address.slice(0, 8)}...{t.address.slice(-6)}
                                  </span>
                                  <button
                                    onClick={() => handleCopy(t.address!)}
                                    className="text-slate-500 hover:text-emerald-400 transition-colors"
                                    title="Copy contract"
                                  >
                                    {copied === t.address ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                                  </button>
                                  <a
                                    href={`${primaryChainConfig.explorerUrl}/token/${t.address}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-slate-500 hover:text-emerald-400 transition-colors"
                                    title="Open Block Explorer"
                                  >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                  </a>
                                </div>
                              ) : (
                                <span className="text-slate-500">Native Asset</span>
                              )}
                            </td>
                            <td className="py-4 px-4 text-right">
                              {t.shieldedSupported ? (
                                <button
                                  onClick={() => setShieldModalAsset(t.symbol as "ETH" | "USDG")}
                                  className="px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-medium transition inline-flex items-center gap-1.5 cursor-pointer"
                                  title="Open Shielded Privacy Pool Gateway"
                                >
                                  <Lock className="w-3 h-3" />
                                  <span>Shield</span>
                                </button>
                              ) : (
                                <span className="text-xs text-slate-500 font-mono">
                                  {t.symbol === "BTC" ? "Reference" : "Transparent"}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Tab 2: Activity Feed */}
            {activeTab === "history" && (
              <div className="mt-6 space-y-3">
                {isConnected && !isWrongChain && (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] text-xs font-mono text-slate-400">
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      <span className="text-slate-300">Live On-Chain Activity</span>
                    </div>
                    <a
                      href={`${primaryChainConfig.explorerUrl}/address/${address}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] text-emerald-400 hover:underline flex items-center gap-1"
                    >
                      <span>View in Explorer</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}
                {!isConnected || !address ? (
                  <div className="p-10 rounded-xl bg-black/40 border border-white/[0.06] text-center">
                    <Wallet className="w-8 h-8 text-slate-500 mx-auto mb-3" />
                    <p className="text-sm font-medium text-slate-200">Wallet Disconnected</p>
                    <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto leading-relaxed">
                      Connect an authorized Web3 wallet to inspect your recent on-chain transfers and account activity.
                    </p>
                    <button
                      onClick={() => setWalletModalOpen(true)}
                      className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-950 font-semibold text-xs transition-all shadow-sm"
                    >
                      <Wallet className="w-3.5 h-3.5" />
                      <span>Connect Wallet</span>
                    </button>
                  </div>
                ) : isWrongChain ? (
                  <div className="p-10 rounded-xl bg-black/40 border border-amber-500/20 text-center">
                    <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto mb-3" />
                    <p className="text-sm font-medium text-amber-200">Unsupported Network</p>
                    <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto leading-relaxed">
                      Your wallet is currently connected to another chain. Switch to {primaryChainConfig.name} to query account activity.
                    </p>
                    <button
                      onClick={() => switchChain({ chainId: primaryChainConfig.chainId })}
                      disabled={isSwitchingChain}
                      className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-xs font-mono text-amber-300 transition-all"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isSwitchingChain ? "animate-spin" : ""}`} />
                      <span>{isSwitchingChain ? "Switching..." : `Switch to ${primaryChainConfig.name}`}</span>
                    </button>
                  </div>
                ) : isTxsLoading ? (
                  <div className="p-12 rounded-xl bg-black/40 border border-white/[0.06] text-center">
                    <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin mx-auto mb-3" />
                    <p className="text-sm font-medium text-slate-200">Scanning Recent Blocks...</p>
                    <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto leading-relaxed">
                      Retrieving on-chain transfer events for your account from the {primaryChainConfig.name} RPC node.
                    </p>
                  </div>
                ) : isTxsError ? (
                  <div className="p-10 rounded-xl bg-black/40 border border-red-500/20 text-center">
                    <AlertTriangle className="w-8 h-8 text-red-400 mx-auto mb-3" />
                    <p className="text-sm font-medium text-red-200">Activity Query Unavailable</p>
                    <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto leading-relaxed">
                      Unable to query recent event logs from the primary RPC endpoint. You can inspect complete transaction records on the official explorer.
                    </p>
                    <div className="mt-5 flex items-center justify-center gap-3">
                      <button
                        onClick={() => refetchTxs()}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-mono transition"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Retry</span>
                      </button>
                      <a
                        href={`${primaryChainConfig.explorerUrl}/address/${address}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-xs font-mono text-slate-300 hover:text-white transition"
                      >
                        <span>Open Block Explorer</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>
                ) : recentTxs && recentTxs.length > 0 ? (
                  <div className="space-y-4">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-white/[0.08] text-[11px] font-mono text-slate-400 uppercase tracking-wider">
                            <th className="py-3 px-4">Event</th>
                            <th className="py-3 px-4">Asset</th>
                            <th className="py-3 px-4">Amount</th>
                            <th className="py-3 px-4">Counterparty</th>
                            <th className="py-3 px-4">Block Height</th>
                            <th className="py-3 px-4">Transaction Hash</th>
                            <th className="py-3 px-4 text-right">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.06] text-sm font-mono">
                          {recentTxs.map((tx) => (
                            <tr key={tx.hash} className="hover:bg-white/[0.02] transition-colors">
                              <td className="py-3.5 px-4">
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs ${
                                  tx.type === "incoming"
                                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                    : "bg-slate-500/10 text-slate-300 border border-white/10"
                                }`}>
                                  {tx.type === "incoming" ? (
                                    <>
                                      <ArrowDownLeft className="w-3 h-3 text-emerald-400" />
                                      <span>Received</span>
                                    </>
                                  ) : (
                                    <>
                                      <ArrowUpRight className="w-3 h-3 text-slate-400" />
                                      <span>Sent</span>
                                    </>
                                  )}
                                </span>
                              </td>
                              <td className="py-3.5 px-4 text-white font-sans font-medium">
                                {tx.symbol}
                              </td>
                              <td className="py-3.5 px-4 text-white font-medium">
                                {tx.type === "incoming" ? `+${tx.amount}` : `-${tx.amount}`} {tx.symbol}
                              </td>
                              <td className="py-3.5 px-4 text-xs text-slate-400">
                                <span>{tx.counterparty.slice(0, 6)}...{tx.counterparty.slice(-4)}</span>
                              </td>
                              <td className="py-3.5 px-4 text-xs text-slate-400">
                                #{tx.blockNumber.toString()}
                              </td>
                              <td className="py-3.5 px-4 text-xs">
                                <a
                                  href={`${primaryChainConfig.explorerUrl}/tx/${tx.hash}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-slate-300 hover:text-emerald-400 inline-flex items-center gap-1 transition-colors"
                                  title="View Transaction"
                                >
                                  <span>{tx.hash.slice(0, 8)}...{tx.hash.slice(-6)}</span>
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              </td>
                              <td className="py-3.5 px-4 text-right">
                                <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                  <span>Confirmed</span>
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="pt-2 text-center text-xs text-slate-500 font-mono">
                      <span>Showing verified transfer logs from recent blocks. </span>
                      <a
                        href={`${primaryChainConfig.explorerUrl}/address/${address}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-emerald-400 hover:underline inline-flex items-center gap-1"
                      >
                        <span>View complete history on Block Explorer</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                ) : (
                  <div className="p-10 rounded-xl bg-black/40 border border-white/[0.06] text-center">
                    <Activity className="w-8 h-8 text-slate-500 mx-auto mb-3" />
                    <p className="text-sm font-medium text-slate-200">No transactions found in recent blocks</p>
                    <p className="text-xs text-slate-400 mt-2 max-w-xl mx-auto leading-relaxed">
                      No USDG transfer events were detected for this address within recent blocks. Note: An empty recent activity feed does not indicate a zero balance — your verified USDG balance is read directly from the token contract (<code className="text-slate-300 font-mono">balanceOf</code>). Full historical activity and native transactions are indexed on the official block explorer.
                    </p>
                    <div className="mt-5 flex items-center justify-center flex-wrap gap-3">
                      <a
                        href={`${primaryChainConfig.explorerUrl}/address/${address}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-xs font-mono text-slate-300 hover:text-white transition-all"
                      >
                        <span>View Account on Block Explorer</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                      <a
                        href={`${primaryChainConfig.explorerUrl}/token/${siteConfig.tokens.usdg.address}?a=${address}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-xs font-mono text-emerald-400 hover:text-emerald-300 transition-all"
                      >
                        <span>View USDG Token History</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <ConnectWalletModal
        isOpen={walletModalOpen}
        onClose={() => setWalletModalOpen(false)}
      />

      {shieldModalAsset && (
        <ShieldModal
          isOpen={Boolean(shieldModalAsset)}
          onClose={() => setShieldModalAsset(null)}
          asset={shieldModalAsset}
        />
      )}
    </section>
  );
}
