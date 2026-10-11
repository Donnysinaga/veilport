"use client";

import Image from "next/image";
import { Server, Cpu, Database, Network, ShieldCheck } from "lucide-react";

export function InfrastructureSection() {
  const pillars = [
    {
      title: "Distributed Verification",
      description: "Client-side Groth16 zero-knowledge proofs verified on-chain by audited smart contracts.",
      icon: Cpu,
    },
    {
      title: "Protected State Ledger",
      description: "Incremental Poseidon Merkle trees maintain deposit commitments and verifiable root history.",
      icon: Database,
    },
    {
      title: "Decoupled Routing",
      description: "Relayed execution decouples transaction destinations from gas payment accounts.",
      icon: Network,
    },
    {
      title: "Auditing & Records",
      description: "Cryptographic viewing keys enable selective disclosure for compliance and institutional audits.",
      icon: ShieldCheck,
    },
  ];

  return (
    <section id="infrastructure" className="relative py-24 sm:py-32 lg:py-40 border-t border-white/[0.06] bg-[#08090C] scroll-mt-24 overflow-hidden">
      {/* Subtle architectural ambient light */}
      <div className="absolute top-1/3 right-0 w-[550px] h-[550px] bg-emerald-500/[0.03] rounded-full blur-[140px] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Heading */}
        <div className="max-w-3xl mb-16 sm:mb-20">
          <h2 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold text-white tracking-[-0.03em] leading-[1.12]">
            Clear Architecture, <br className="hidden sm:inline" />
            <span className="silver-shimmer bg-clip-text text-transparent">Cryptographic Security</span>
          </h2>
          <p className="mt-5 text-base sm:text-lg text-slate-300/80 leading-relaxed max-w-2xl">
            Modular architecture separating proof generation, state verification, and on-chain settlement. Built with client-side zero-knowledge circuits for mathematical privacy and complete operational integrity.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center">
          {/* Left Column: Glass Cube Artwork Stage (Sculptural Presence) */}
          <div className="lg:col-span-5 relative flex items-center justify-center order-last lg:order-first">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.12),transparent_70%)] pointer-events-none" />
            <div className="relative w-full aspect-square max-w-[440px] p-4 flex items-center justify-center">
              <Image
                src="/images/veilport/illustrations/infrastructure.webp"
                alt="VEILPORT Glass Cube Infrastructure Visual Architecture"
                fill
                sizes="(max-width: 1024px) 100vw, 440px"
                className="object-contain filter drop-shadow-[0_25px_50px_rgba(16,185,129,0.22)] transition-transform duration-700 hover:scale-[1.02]"
                loading="lazy"
              />
            </div>
          </div>

          {/* Right Column: Architectural Blueprint Index (No generic card grid) */}
          <div className="lg:col-span-7 divide-y divide-white/[0.08] border-t border-b border-white/[0.08]">
            {pillars.map((pillar, idx) => {
              const IconComponent = pillar.icon;
              const stepIndex = `0${idx + 1}`;
              return (
                <div 
                  key={idx} 
                  className="py-7 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-start gap-4 sm:gap-6 group transition-colors"
                >
                  <div className="flex items-center gap-3 shrink-0 sm:w-28">
                    <span className="text-xs font-mono text-emerald-400/80 tracking-widest">{stepIndex}</span>
                    <div className="w-8 h-8 rounded-lg bg-white/[0.03] border border-white/10 flex items-center justify-center text-slate-400 group-hover:text-emerald-400 group-hover:border-emerald-500/30 transition-colors">
                      <IconComponent className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="space-y-1.5 flex-1">
                    <h3 className="text-lg font-semibold text-white tracking-tight group-hover:text-emerald-300 transition-colors">
                      {pillar.title}
                    </h3>
                    <p className="text-sm text-slate-400 leading-relaxed max-w-xl">
                      {pillar.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
