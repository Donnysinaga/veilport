"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useAccount, useBalance, useBlockNumber } from "wagmi";
import { Wallet, Shield, Layers, Globe, Terminal, ArrowUpRight, Menu, X } from "lucide-react";
import { primaryChainConfig } from "@/config/network";
import { ConnectWalletModal } from "../wallet/ConnectWalletModal";

export function Header() {
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { address, isConnected, chainId } = useAccount();
  const isWrongChain = isConnected && chainId !== primaryChainConfig.chainId;
  const { data: balance } = useBalance({ 
    address, 
    chainId: primaryChainConfig.chainId,
    query: {
      enabled: Boolean(isConnected && address && !isWrongChain),
    },
  });
  const { data: blockNumber, isLoading: isNetworkLoading } = useBlockNumber({ 
    chainId: primaryChainConfig.chainId,
    query: { refetchInterval: 15_000 }
  });


  return (
    <>
      <header className="sticky top-0 z-40 w-full border-b border-white/[0.06] bg-[#07080A]/80 backdrop-blur-xl transition-all duration-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          {/* Brand Logo & Wordmark */}
          <Link href="/" className="flex items-center gap-3.5 group">
            <div className="relative w-10 h-10 flex items-center justify-center rounded-xl bg-gradient-to-b from-white/[0.08] to-transparent p-1.5 border border-white/10 group-hover:border-emerald-500/40 transition duration-300 shadow-sm">
              <Image
                src="/images/veilport/branding/veilport-symbol.svg"
                alt="VEILPORT Symbol"
                width={28}
                height={28}
                className="object-contain"
                priority
              />
            </div>
            <div className="flex flex-col">
              <span className="font-semibold tracking-[0.25em] text-base text-white font-mono group-hover:text-emerald-300 transition duration-300">
                VEILPORT
              </span>
              <span className="text-[10px] tracking-[0.2em] uppercase font-mono text-slate-500 -mt-0.5">
                Private Digital Assets
              </span>
            </div>
          </Link>

          {/* Navigation links */}
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-400">
            <a href="#overview" className="hover:text-white transition-colors duration-200">
              Overview
            </a>
            <a href="#privacy" className="hover:text-white transition-colors duration-200 flex items-center gap-1.5 group">
              <Shield className="w-3.5 h-3.5 text-slate-500 group-hover:text-emerald-400 transition-colors" />
              Privacy Shield
            </a>
            <a href="#dashboard" className="hover:text-white transition-colors duration-200 flex items-center gap-1.5 group">
              <Layers className="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-300 transition-colors" />
              Portfolio
            </a>
            <a href="#infrastructure" className="hover:text-white transition-colors duration-200">
              Infrastructure
            </a>
            <a href="#flow" className="hover:text-white transition-colors duration-200">
              How It Works
            </a>
          </nav>

          {/* Wallet connect button */}
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.03] border border-white/[0.06] text-xs font-mono text-slate-400">
              {blockNumber ? (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span>Network Ready</span>
                </>
              ) : isNetworkLoading ? (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-pulse" />
                  <span>Verifying Network</span>
                </>
              ) : (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  <span>Network Offline</span>
                </>
              )}
            </div>

            <button
              onClick={() => setWalletModalOpen(true)}
              className={`flex items-center gap-2.5 px-3.5 sm:px-5 py-2.5 rounded-xl font-medium text-sm transition-all duration-200 border ${
                isConnected
                  ? isWrongChain
                    ? "bg-[#1A140E] border-amber-500/40 text-amber-300 hover:bg-[#241C12]"
                    : "bg-[#0E121A] border-emerald-500/30 text-emerald-300 hover:bg-[#141A26] hover:border-emerald-500/50"
                  : "bg-white hover:bg-slate-100 text-slate-950 font-semibold border-white shadow-[0_0_20px_rgba(255,255,255,0.1)] active:scale-[0.98]"
              }`}
            >
              <Wallet className="w-4 h-4" />
              {isConnected && address ? (
                isWrongChain ? (
                  <span>Wrong Chain · {address.slice(0, 6)}...{address.slice(-4)}</span>
                ) : (
                  <span>
                    {balance ? `${parseFloat(balance.formatted).toFixed(3)} ${balance.symbol} · ` : ""}
                    {address.slice(0, 6)}...{address.slice(-4)}
                  </span>
                )
              ) : (
                <span>Connect Wallet</span>
              )}
            </button>

            {/* Mobile Menu Toggle Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.08] text-slate-400 hover:text-white transition cursor-pointer"
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5 text-emerald-400" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-white/[0.08] bg-[#07080A]/95 backdrop-blur-2xl px-5 py-6 space-y-4 animate-in slide-in-from-top-2 duration-200">
            <nav className="flex flex-col space-y-3 text-sm font-medium">
              <a
                href="#overview"
                onClick={() => setMobileMenuOpen(false)}
                className="px-3 py-2 rounded-lg text-slate-300 hover:text-white hover:bg-white/[0.04] transition"
              >
                Overview
              </a>
              <a
                href="#privacy"
                onClick={() => setMobileMenuOpen(false)}
                className="px-3 py-2 rounded-lg text-slate-300 hover:text-white hover:bg-white/[0.04] transition flex items-center gap-2"
              >
                <Shield className="w-4 h-4 text-emerald-400" />
                <span>Privacy Shield</span>
              </a>
              <a
                href="#dashboard"
                onClick={() => setMobileMenuOpen(false)}
                className="px-3 py-2 rounded-lg text-slate-300 hover:text-white hover:bg-white/[0.04] transition flex items-center gap-2"
              >
                <Layers className="w-4 h-4 text-slate-400" />
                <span>Portfolio</span>
              </a>
              <a
                href="#infrastructure"
                onClick={() => setMobileMenuOpen(false)}
                className="px-3 py-2 rounded-lg text-slate-300 hover:text-white hover:bg-white/[0.04] transition"
              >
                Infrastructure
              </a>
              <a
                href="#flow"
                onClick={() => setMobileMenuOpen(false)}
                className="px-3 py-2 rounded-lg text-slate-300 hover:text-white hover:bg-white/[0.04] transition"
              >
                How It Works
              </a>
            </nav>

            <div className="pt-3 border-t border-white/[0.08] flex items-center justify-between text-xs font-mono text-slate-400">
              <span>Network: {primaryChainConfig.name}</span>
              <span className="flex items-center gap-1.5 text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                {blockNumber ? `#${blockNumber}` : "Online"}
              </span>
            </div>
          </div>
        )}
      </header>

      <ConnectWalletModal
        isOpen={walletModalOpen}
        onClose={() => setWalletModalOpen(false)}
      />
    </>
  );
}
