"use client";

import { useConnect, useAccount, useDisconnect, useBalance, useSwitchChain } from "wagmi";
import { X, ExternalLink, ShieldCheck, CheckCircle2, Copy, Check, AlertTriangle, RefreshCw } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { siteConfig } from "@/config/site";
import { primaryChainConfig } from "@/config/network";

interface ConnectWalletModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ConnectWalletModal({ isOpen, onClose }: ConnectWalletModalProps) {
  const { connectors, connect, isPending } = useConnect();
  const { address, isConnected, chainId, chain } = useAccount();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitchingChain } = useSwitchChain();
  const isWrongChain = isConnected && chainId !== primaryChainConfig.chainId;
  const { data: balance, isLoading: isBalanceLoading, isError: isBalanceError } = useBalance({ 
    address, 
    chainId: primaryChainConfig.chainId,
    query: {
      enabled: Boolean(isConnected && address && !isWrongChain),
    },
  });
  const [copied, setCopied] = useState(false);
  const [pendingWalletId, setPendingWalletId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<{ text: string; actionUrl?: string; actionLabel?: string } | null>(null);

  if (!isOpen) return null;

  const handleCopy = () => {
    if (address) {
      navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const isOkxInstalled = () => {
    if (typeof window === "undefined") return false;
    const win = window as any;
    return Boolean(
      win.okxwallet ||
      win.ethereum?.providers?.some((p: any) => p.isOkxWallet) ||
      win.ethereum?.isOkxWallet
    );
  };

  const isMetaMaskInstalled = () => {
    if (typeof window === "undefined") return false;
    const win = window as any;
    return Boolean(
      (win.ethereum?.isMetaMask && !win.ethereum?.isOkxWallet) ||
      win.ethereum?.providers?.some((p: any) => p.isMetaMask && !p.isOkxWallet)
    );
  };

  const getConnectorForWallet = (walletId: string) => {
    const id = walletId.toLowerCase();
    if (id.includes("okx")) {
      return connectors.find((c) => c.id === "okxWallet" || c.name.toLowerCase().includes("okx"));
    }
    if (id.includes("metamask")) {
      return (
        connectors.find((c) => c.id === "metaMask") ||
        connectors.find((c) => c.id === "metaMaskSDK" || c.name.toLowerCase().includes("metamask"))
      );
    }
    if (id.includes("coinbase")) {
      return connectors.find((c) => c.id === "coinbaseWalletSDK" || c.name.toLowerCase().includes("coinbase"));
    }
    if (id.includes("walletconnect")) {
      return connectors.find((c) => c.id === "walletConnect" || c.name.toLowerCase().includes("walletconnect"));
    }
    if (id.includes("rainbow")) {
      return connectors.find((c) => c.id === "rainbow" || c.name.toLowerCase().includes("rainbow"));
    }
    return connectors.find((c) => c.id.toLowerCase() === id);
  };

  const handleConnect = (walletId: string) => {
    setErrorMessage(null);

    // Explicit detection for MetaMask extension
    if (walletId === "metaMask" && !isMetaMaskInstalled()) {
      setErrorMessage({
        text: "MetaMask extension was not detected in your browser. Please install or enable MetaMask to connect.",
        actionUrl: "https://metamask.io/download/",
        actionLabel: "Get MetaMask",
      });
      return;
    }

    // Explicit detection for OKX Wallet extension
    if (walletId === "okxWallet" && !isOkxInstalled()) {
      setErrorMessage({
        text: "OKX Wallet extension was not detected in your browser. Please install or enable the extension to connect.",
        actionUrl: "https://web3.okx.com/",
        actionLabel: "Get OKX Wallet",
      });
      return;
    }

    const connector = getConnectorForWallet(walletId);
    if (!connector) {
      if (walletId === "okxWallet") {
        setErrorMessage({
          text: "OKX Wallet extension was not detected in your browser. Install the extension to connect with OKX Wallet.",
          actionUrl: "https://web3.okx.com/",
          actionLabel: "Get OKX Wallet",
        });
      } else if (walletId === "metaMask") {
        setErrorMessage({
          text: "MetaMask extension was not detected in your browser. Install the extension to connect with MetaMask.",
          actionUrl: "https://metamask.io/download/",
          actionLabel: "Get MetaMask",
        });
      } else {
        setErrorMessage({ text: `No provider connector configured for this wallet option.` });
      }
      return;
    }

    setPendingWalletId(walletId);
    connect(
      { connector },
      {
        onSuccess: () => {
          setPendingWalletId(null);
          setErrorMessage(null);
        },
        onError: (err: any) => {
          setPendingWalletId(null);
          const msg = err?.message || "";
          if (
            msg.toLowerCase().includes("user rejected") ||
            msg.toLowerCase().includes("user denied") ||
            err?.code === 4001
          ) {
            setErrorMessage({ text: "Connection was cancelled by the user in the wallet." });
          } else if (
            msg.toLowerCase().includes("not found") ||
            msg.toLowerCase().includes("not installed") ||
            msg.toLowerCase().includes("providernotfound")
          ) {
            if (walletId === "okxWallet") {
              setErrorMessage({
                text: "OKX Wallet extension was not detected. Please install or enable OKX Wallet.",
                actionUrl: "https://web3.okx.com/",
                actionLabel: "Get OKX Wallet",
              });
            } else if (walletId === "metaMask") {
              setErrorMessage({
                text: "MetaMask extension was not detected. Please install or enable MetaMask.",
                actionUrl: "https://metamask.io/download/",
                actionLabel: "Get MetaMask",
              });
            } else {
              setErrorMessage({ text: "Wallet provider was not detected. Please verify your extension is installed and enabled." });
            }
          } else {
            setErrorMessage({ text: msg.slice(0, 140) || "Unable to complete connection request." });
          }
        },
      }
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md rounded-2xl bg-[#0D0F14] border border-white/10 p-6 shadow-2xl">
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <div className={`w-2.5 h-2.5 rounded-full ${isConnected ? (isWrongChain ? "bg-amber-400" : "bg-emerald-400") : "bg-slate-500"}`} />
            <h3 className="font-semibold text-lg text-white">
              {isConnected ? "Connected Account" : "Connect Wallet"}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {isConnected && address ? (
          <div className="mt-5 space-y-4">
            {isWrongChain && (
              <div className="p-3.5 rounded-xl bg-amber-950/40 border border-amber-500/30 text-amber-200 text-xs flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>Your wallet is on an unexpected network.</span>
                </div>
                <button
                  onClick={() => switchChain({ chainId: primaryChainConfig.chainId })}
                  disabled={isSwitchingChain}
                  className="px-2.5 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-mono text-[11px] transition shrink-0"
                >
                  {isSwitchingChain ? "Switching..." : "Switch"}
                </button>
              </div>
            )}

            <div className="p-4 rounded-xl bg-[#13161F] border border-white/10">
              <span className="text-xs uppercase font-mono tracking-wider text-gray-400">Connected Address</span>
              <div className="mt-1 flex items-center justify-between">
                <span className="font-mono text-sm text-gray-200">
                  {address.slice(0, 8)}...{address.slice(-6)}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={handleCopy}
                    className="p-1.5 rounded text-gray-400 hover:text-emerald-400 hover:bg-white/5 transition"
                    title="Copy Address"
                  >
                    {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                  <a
                    href={`${primaryChainConfig.explorerUrl}/address/${address}`}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1.5 rounded text-gray-400 hover:text-emerald-400 hover:bg-white/5 transition"
                    title="View on Block Explorer"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-[#13161F] border border-white/10 flex items-center justify-between">
              <div>
                <span className="text-xs uppercase font-mono tracking-wider text-gray-400">Account Balance</span>
                <p className="text-xl font-semibold text-white mt-0.5">
                  {isWrongChain
                    ? "—"
                    : isBalanceLoading
                    ? "Loading..."
                    : isBalanceError
                    ? "Unavailable"
                    : balance
                    ? `${parseFloat(balance.formatted).toFixed(4)} ${balance.symbol}`
                    : "—"}
                </p>
              </div>
              <div className={`px-3 py-1 rounded-full text-xs font-medium ${
                isWrongChain 
                  ? "bg-amber-500/10 text-amber-300 border border-amber-500/20" 
                  : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
              }`}>
                {isWrongChain ? "Wrong Network" : primaryChainConfig.name}
              </div>
            </div>

            <div className="pt-2 flex gap-3">
              <button
                onClick={() => {
                  setErrorMessage(null);
                  disconnect();
                }}
                className="w-full py-2.5 rounded-xl border border-red-500/30 text-red-400 hover:bg-red-500/10 text-sm font-medium transition"
              >
                Disconnect Wallet
              </button>
              <button
                onClick={onClose}
                className="w-full py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-sm font-medium transition"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-5 space-y-3">
            <p className="text-sm text-gray-400">
              Select an authorized wallet provider to interact with VEILPORT privacy tools and portfolio features.
            </p>

            {errorMessage && (
              <div className="p-3.5 rounded-xl bg-red-950/40 border border-red-500/30 text-red-300 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 animate-in fade-in">
                <div className="space-y-1">
                  <p>{errorMessage.text}</p>
                  {errorMessage.actionUrl && (
                    <a
                      href={errorMessage.actionUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300 font-mono text-[11px] underline"
                    >
                      <span>{errorMessage.actionLabel || "Official Website"}</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
                <button
                  onClick={() => setErrorMessage(null)}
                  className="self-start sm:self-center px-2 py-0.5 rounded bg-white/10 hover:bg-white/15 text-white text-[11px] font-mono shrink-0"
                >
                  Dismiss
                </button>
              </div>
            )}

            <div className="space-y-2 pt-1">
              {siteConfig.supportedWallets.map((wallet) => {
                const isThisPending = pendingWalletId === wallet.id && isPending;

                return (
                  <button
                    key={wallet.id}
                    onClick={() => handleConnect(wallet.id)}
                    disabled={isPending}
                    className="w-full flex items-center justify-between p-3.5 rounded-xl bg-[#13161F] border border-white/5 hover:border-emerald-500/40 hover:bg-[#181C26] transition group text-left disabled:opacity-60"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-black/40 flex items-center justify-center border border-white/10 p-2">
                        <Image
                          src={wallet.icon}
                          alt={`${wallet.name} logo`}
                          width={28}
                          height={28}
                          className="object-contain"
                        />
                      </div>
                      <div>
                        <div className="font-medium text-white group-hover:text-emerald-400 transition flex items-center gap-1.5">
                          {wallet.name}
                        </div>
                        <p className="text-xs text-gray-400 line-clamp-1">{wallet.description}</p>
                      </div>
                    </div>
                    {isThisPending ? (
                      <span className="text-xs font-mono text-emerald-400 flex items-center gap-1.5">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Connecting...</span>
                      </span>
                    ) : (
                      <span className="text-xs font-mono text-gray-500 group-hover:text-gray-300">
                        Connect &rarr;
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="mt-4 pt-4 border-t border-white/5 flex items-center gap-2 text-xs text-gray-400">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>VEILPORT never requests private keys or recovery phrases. Non-custodial connection only.</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
