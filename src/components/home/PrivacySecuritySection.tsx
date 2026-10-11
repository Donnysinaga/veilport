"use client";

import Image from "next/image";
import { EyeOff, FileText, CheckCircle2 } from "lucide-react";

export function PrivacySecuritySection() {
  return (
    <section id="privacy" className="relative py-24 sm:py-32 lg:py-40 border-t border-white/[0.06] bg-[#07080A] scroll-mt-24 overflow-hidden">
      {/* Background Ambience */}
      <div className="absolute top-1/2 left-0 -translate-y-1/2 w-[500px] h-[500px] bg-emerald-500/[0.04] rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Editorial Section Heading */}
        <div className="max-w-3xl mb-16 sm:mb-20">
          <h2 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold text-white tracking-[-0.03em] leading-[1.12]">
            Your Assets. <br className="hidden sm:inline" />
            <span className="silver-shimmer bg-clip-text text-transparent">Your Control.</span>
          </h2>
          <p className="mt-5 text-base sm:text-lg text-slate-300/80 leading-relaxed max-w-2xl">
            VEILPORT brings portfolio visibility, secure note management, and privacy-focused transaction tools together in a seamless experience designed for on-chain finance.
          </p>
        </div>

        {/* Feature Grid with Privacy Shield Artwork Focal Point */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center">
          {/* Privacy Shield Artwork Stage (Focal Point with Ambient Glow) */}
          <div className="lg:col-span-5 relative flex items-center justify-center">
            {/* Ambient emerald backlighting */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.15),transparent_70%)] pointer-events-none" />
            
            <div className="relative w-full aspect-square max-w-[420px] p-4 flex items-center justify-center">
              <Image
                src="/images/veilport/illustrations/privacy-shield.webp"
                alt="VEILPORT Privacy and Security Shield Cryptographic Architecture"
                fill
                sizes="(max-width: 1024px) 100vw, 420px"
                className="object-contain filter drop-shadow-[0_25px_50px_rgba(16,185,129,0.22)] transition-transform duration-700 hover:scale-[1.02]"
                loading="lazy"
              />
            </div>
          </div>

          {/* Architectural Capabilities Breakdown */}
          <div className="lg:col-span-7 space-y-8">
            <div className="border-t border-white/[0.08] pt-8">
              <div className="flex items-start gap-5">
                <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 text-emerald-400 shrink-0">
                  <EyeOff className="w-5 h-5" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-semibold text-white tracking-tight">Stealth Addresses</h3>
                  <p className="text-sm sm:text-base text-slate-400 leading-relaxed">
                    Recipients publish a stealth meta-address once. Senders derive a fresh, single-use destination for each transfer.
                    No public association connects your primary wallet to the recipient address on block explorers.
                  </p>
                  <div className="pt-1 flex items-center gap-2 text-xs font-mono text-emerald-400/90">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Private address derivation for each transfer</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-white/[0.08] pt-8">
              <div className="flex items-start gap-5">
                <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 text-slate-300 shrink-0">
                  <FileText className="w-5 h-5" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-semibold text-white tracking-tight">Auditing View Keys</h3>
                  <p className="text-sm sm:text-base text-slate-400 leading-relaxed">
                    Generate read-only viewing keys that allow authorized auditors or counterparties to inspect specific transaction sets without exposing private spend keys.
                  </p>
                  <div className="pt-1 flex items-center gap-2 text-xs font-mono text-slate-400">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400/80" />
                    <span>Selective disclosure without public exposure</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
