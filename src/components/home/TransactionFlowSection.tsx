"use client";

import Image from "next/image";
import { ArrowRight, GitCommit, ShieldCheck, Key, RefreshCw, Send, CheckCircle2 } from "lucide-react";

export function TransactionFlowSection() {
  const steps = [
    {
      step: "01",
      title: "Stealth Derivation",
      description: "Sender queries recipient's public meta-address and calculates a one-time cryptographic stealth destination via Diffie-Hellman ephemeral exchange.",
      icon: Key,
      phase: "Step 1 · Key Derivation",
    },
    {
      step: "02",
      title: "Shielded Deposit",
      description: "Asset funds (ETH or USDG) are committed into the shielded state with a secret blinding factor, generating a client-side note.",
      icon: ShieldCheck,
      phase: "Step 2 · Shielding",
    },
    {
      step: "03",
      title: "Relayed Routing",
      description: "Decoupled transaction relayers submit the transfer to the network, breaking any link between the payer balance and receiver address.",
      icon: Send,
      phase: "Step 3 · Routing",
    },
    {
      step: "04",
      title: "Claim & Settlement",
      description: "Recipient detects the incoming note using their private view key, generates a spend proof, and claims funds into clean unlinked liquidity.",
      icon: GitCommit,
      phase: "Step 4 · Settlement",
    },
  ];

  return (
    <section id="flow" className="relative py-24 sm:py-32 lg:py-40 border-t border-white/[0.06] bg-[#07080A] scroll-mt-24 overflow-hidden">
      {/* Background Ambience */}
      <div className="absolute top-1/2 right-1/4 -translate-y-1/2 w-[500px] h-[500px] bg-emerald-500/[0.03] rounded-full blur-[130px] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Heading */}
        <div className="max-w-3xl mb-16 sm:mb-20">
          <h2 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold text-white tracking-[-0.03em] leading-[1.12]">
            How Shielded Transfers <br className="hidden sm:inline" />
            <span className="silver-shimmer bg-clip-text text-transparent">Work</span>
          </h2>
          <p className="mt-5 text-base sm:text-lg text-slate-300/80 leading-relaxed max-w-2xl">
            A four-step cryptographic workflow that completely separates sender identity, transaction value, and final recipient.
          </p>
        </div>

        {/* Panoramic Architecture Showcase Stage */}
        <div className="rounded-2xl border border-white/[0.08] bg-[#0A0C10] p-6 sm:p-8 lg:p-10 mb-16 sm:mb-20 shadow-2xl">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
            {/* Left Narrative & Specification Highlights */}
            <div className="lg:col-span-5 space-y-6">
              <div>
                <h3 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight leading-snug">
                  Privacy Flow Design
                </h3>
                <p className="mt-3 text-sm sm:text-base text-slate-400 leading-relaxed">
                  VEILPORT decouples sender identity from destination liquidity using client-side verification and independent transaction relayers.
                </p>
              </div>

              {/* Architectural Highlights */}
              <div className="space-y-3 pt-3 border-t border-white/[0.08]">
                <div className="flex items-center gap-3 text-xs font-mono text-slate-300">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Commitment &amp; Nullifier Verification</span>
                </div>
                <div className="flex items-center gap-3 text-xs font-mono text-slate-300">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Client-Side Privacy Generation</span>
                </div>
                <div className="flex items-center gap-3 text-xs font-mono text-slate-300">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Decoupled Relayer Routing</span>
                </div>
              </div>

              {/* Architecture Link Button */}
              <div className="pt-2">
                <a
                  href="#privacy"
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 hover:border-emerald-500/40 text-xs font-mono text-slate-200 hover:text-emerald-300 transition-all group"
                >
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>Review Architecture</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                </a>
              </div>
            </div>

            {/* Right Column: Prominent Responsive Illustration */}
            <div className="lg:col-span-7 relative flex items-center justify-center">
              <div className="relative w-full aspect-[16/4.5] sm:aspect-[16/3.8] lg:aspect-[16/3.2] rounded-xl bg-black/60 border border-white/[0.08] p-2 sm:p-3 overflow-hidden flex items-center justify-center shadow-inner">
                <Image
                  src="/images/veilport/illustrations/transaction-flow.webp"
                  alt="Cryptographic Transaction Flow Visual Stream"
                  fill
                  sizes="(max-width: 1024px) 100vw, 680px"
                  className="object-contain object-center filter drop-shadow-[0_10px_25px_rgba(16,185,129,0.25)] transition-transform duration-700 hover:scale-[1.01]"
                  priority
                />
              </div>
            </div>
          </div>
        </div>

        {/* 4 Process Stages: Continuous Sequential Flow Ribbon (No isolated cards) */}
        <div className="border-y border-white/[0.08] py-8 sm:py-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-0 lg:divide-x lg:divide-white/[0.08]">
          {steps.map((st) => {
            const IconComp = st.icon;
            return (
              <div
                key={st.step}
                className="lg:px-7 first:pl-0 last:pr-0 flex flex-col justify-between group"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs font-mono font-bold text-emerald-400/90 tracking-widest">
                      {st.step}
                    </span>
                    <div className="w-7 h-7 rounded-lg bg-white/[0.03] border border-white/10 flex items-center justify-center text-slate-400 group-hover:text-emerald-400 group-hover:border-emerald-500/30 transition-colors">
                      <IconComp className="w-3.5 h-3.5" />
                    </div>
                  </div>
                  <h3 className="text-base sm:text-lg font-semibold text-white tracking-tight mb-2 group-hover:text-emerald-300 transition-colors">
                    {st.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-400 leading-relaxed mb-4">
                    {st.description}
                  </p>
                </div>

                <div className="pt-3 border-t border-white/[0.06] flex items-center justify-between text-[11px] font-mono text-slate-500">
                  <span>{st.phase}</span>
                  <span className="text-emerald-500/80">Active Protocol</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
