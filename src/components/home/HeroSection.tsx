"use client";

import Image from "next/image";
import { Shield, ArrowRight, Lock, KeyRound, Cpu, CheckCircle } from "lucide-react";
import { useState } from "react";
import { useAccount } from "wagmi";
import { ConnectWalletModal } from "../wallet/ConnectWalletModal";
import { ShieldModal } from "../privacy/ShieldModal";

export function HeroSection() {
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [shieldModalAsset, setShieldModalAsset] = useState<"ETH" | "USDG" | null>(null);
  const { isConnected } = useAccount();

  return (
    <section id="overview" className="relative flex flex-col justify-center overflow-hidden pt-16 sm:pt-24 lg:pt-32 pb-20 sm:pb-28 lg:pb-36 scroll-mt-24">
      {/* Background Hero Banner Image with Cinematic Obsidian Gradient Reveal */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <Image
          src="/images/veilport/hero/hero-banner.webp"
          alt="VEILPORT Privacy Infrastructure Hero Background"
          fill
          priority
          sizes="100vw"
          className="object-cover object-center lg:object-[center_right] opacity-60 filter contrast-[1.08] brightness-[0.95]"
        />
        {/* Editorial Gradients for Contrast & Visual Depth */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#07080A] via-[#07080A]/80 to-[#07080A]/40" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#07080A]/95 via-[#07080A]/70 to-[#07080A]/30" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_40%,rgba(16,185,129,0.06),transparent)]" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col items-center text-center">
        {/* Headline */}
        <h1 className="text-4xl sm:text-6xl md:text-7xl lg:text-[5.25rem] font-extrabold tracking-[-0.03em] text-white max-w-5xl leading-[1.08]">
          Privacy for the Next Era of{" "}
          <span className="silver-shimmer bg-clip-text text-transparent">
            On-Chain Finance
          </span>
        </h1>

        {/* Supporting Copy */}
        <p className="mt-7 text-base sm:text-lg lg:text-xl text-slate-300/90 max-w-2xl font-normal leading-relaxed">
          A more considered approach to digital asset privacy. Explore your portfolio, manage assets, and experience privacy-focused financial tools through one refined interface.
        </p>

        {/* Action Buttons */}
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4 w-full sm:w-auto">
          {isConnected ? (
            <button
              onClick={() => setShieldModalAsset("ETH")}
              className="w-full sm:w-auto flex items-center justify-center gap-2.5 px-8 py-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-base transition-all duration-200 shadow-[0_0_30px_rgba(16,185,129,0.25)] hover:shadow-[0_0_40px_rgba(16,185,129,0.35)] active:scale-[0.98] cursor-pointer"
            >
              <Shield className="w-4 h-4" />
              <span>Launch Privacy Shield</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={() => setWalletModalOpen(true)}
              className="w-full sm:w-auto flex items-center justify-center gap-2.5 px-8 py-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-base transition-all duration-200 shadow-[0_0_30px_rgba(16,185,129,0.25)] hover:shadow-[0_0_40px_rgba(16,185,129,0.35)] active:scale-[0.98] cursor-pointer"
            >
              <span>Connect Wallet</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}

          <a
            href="#dashboard"
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-7 py-4 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 hover:border-white/20 text-white font-medium text-base backdrop-blur-md transition-all duration-200 active:scale-[0.98]"
          >
            <span>View Portfolio</span>
          </a>

          <button
            onClick={() => setShieldModalAsset("USDG")}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-7 py-4 rounded-xl border border-white/10 hover:border-emerald-500/40 bg-white/[0.02] hover:bg-emerald-950/20 text-slate-300 hover:text-emerald-300 font-medium text-base backdrop-blur-md transition-all duration-200 active:scale-[0.98] cursor-pointer"
          >
            <Shield className="w-4 h-4 text-emerald-400/80" />
            <span>Shield USDG</span>
          </button>
        </div>

        {/* Architectural Capabilities Strip with Fine Hairline Rules */}
        <div className="mt-16 sm:mt-20 lg:mt-24 w-full max-w-6xl border-y border-white/[0.08] py-8 sm:py-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-0 lg:divide-x lg:divide-white/[0.08] text-left">
          <div className="lg:px-7 first:pl-0">
            <div className="flex items-center gap-2.5 text-emerald-400 mb-2">
              <Lock className="w-4 h-4 text-emerald-400/90" />
              <span className="text-sm font-semibold text-white tracking-wide">Stealth Addresses</span>
            </div>
            <p className="text-xs font-mono text-emerald-400/80">EIP-5564 Standard</p>
            <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">Private, single-use recipient destinations</p>
          </div>

          <div className="lg:px-7">
            <div className="flex items-center gap-2.5 text-emerald-400 mb-2">
              <Cpu className="w-4 h-4 text-emerald-400/90" />
              <span className="text-sm font-semibold text-white tracking-wide">Zero-Knowledge Proofs</span>
            </div>
            <p className="text-xs font-mono text-emerald-400/80">Groth16 zk-SNARKs</p>
            <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">Protected transaction verification</p>
          </div>

          <div className="lg:px-7">
            <div className="flex items-center gap-2.5 text-emerald-400 mb-2">
              <KeyRound className="w-4 h-4 text-emerald-400/90" />
              <span className="text-sm font-semibold text-white tracking-wide">Auditing View Keys</span>
            </div>
            <p className="text-xs font-mono text-emerald-400/80">Selective Disclosure</p>
            <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">Optional records for accounting &amp; audits</p>
          </div>

          <div className="lg:px-7 last:pr-0">
            <div className="flex items-center gap-2.5 text-emerald-400 mb-2">
              <CheckCircle className="w-4 h-4 text-emerald-400/90" />
              <span className="text-sm font-semibold text-white tracking-wide">Primary Currencies</span>
            </div>
            <p className="text-xs font-mono text-emerald-400/80">Supported ETH &amp; USDG</p>
            <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">Base assets &amp; trusted stablecoins</p>
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
