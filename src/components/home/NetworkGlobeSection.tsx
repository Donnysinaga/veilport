"use client";

import Image from "next/image";
import { Globe, ExternalLink } from "lucide-react";
import { primaryChainConfig } from "@/config/network";

export function NetworkGlobeSection() {
  const endpoints = [
    {
      provider: "Primary Node Endpoint",
      role: "Transaction execution & direct ledger queries",
      protocol: "HTTPS JSON API",
    },
    {
      provider: "Secondary Node Endpoint",
      role: "High-availability failover & node redundancy",
      protocol: "HTTPS JSON API",
    },
    {
      provider: "Network Block Explorer",
      role: "Ledger indexing & contract verification",
      protocol: "Blockscout API",
    },
  ];

  return (
    <section id="network" className="relative py-24 sm:py-32 lg:py-40 border-t border-white/[0.06] bg-[#07080A] scroll-mt-24 overflow-hidden">
      {/* Background ambient lighting */}
      <div className="absolute top-1/2 left-1/4 -translate-y-1/2 w-[500px] h-[500px] bg-emerald-500/[0.03] rounded-full blur-[130px] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center">
          {/* Globe Illustration Stage (Grand Visual Centerpiece) */}
          <div className="lg:col-span-5 relative flex items-center justify-center">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.14),transparent_70%)] pointer-events-none" />
            <div className="relative w-full aspect-square max-w-[420px] p-4 flex items-center justify-center">
              <Image
                src="/images/veilport/illustrations/network-globe.webp"
                alt="VEILPORT Global Network Prover Visual Mesh"
                fill
                sizes="(max-width: 1024px) 100vw, 420px"
                className="object-contain filter drop-shadow-[0_25px_50px_rgba(16,185,129,0.22)] transition-transform duration-700 hover:scale-[1.02]"
                loading="lazy"
              />
            </div>
          </div>

          {/* Node Telemetry Ledger & Explanations */}
          <div className="lg:col-span-7 space-y-8">
            <div>
              <h2 className="text-3xl sm:text-5xl font-extrabold text-white tracking-[-0.03em] leading-[1.12]">
                Reliable Network <br className="hidden sm:inline" />
                <span className="silver-shimmer bg-clip-text text-transparent">Infrastructure</span>
              </h2>
              <p className="mt-4 text-base sm:text-lg text-slate-300/80 leading-relaxed max-w-xl">
                VEILPORT connects directly to high-availability node providers with continuous ledger state tracking and official block explorer verification.
              </p>
            </div>

            {/* Institutional Network Architecture Ledger */}
            <div className="border border-white/[0.08] rounded-xl bg-[#0A0C10] divide-y divide-white/[0.06] overflow-hidden">
              {endpoints.map((ep, i) => (
                <div
                  key={i}
                  className="p-4 sm:px-5 sm:py-4.5 hover:bg-white/[0.02] transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3.5">
                    <span className="relative flex h-2 w-2 shrink-0">
                      <span className="inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                    </span>
                    <div>
                      <span className="font-medium text-white text-sm tracking-tight">{ep.provider}</span>
                      <span className="block text-xs font-mono text-slate-500">{ep.role}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-xs font-mono pl-5 sm:pl-0">
                    <span className="px-2.5 py-0.5 rounded-md bg-white/[0.04] text-slate-300 border border-white/[0.08] text-[11px]">
                      {ep.protocol}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-1">
              <a
                href={primaryChainConfig.explorerUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 text-xs font-mono text-slate-300 hover:text-emerald-400 transition-colors group"
              >
                <span>View Block Explorer</span>
                <ExternalLink className="w-3.5 h-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
