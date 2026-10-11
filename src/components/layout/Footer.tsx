import Image from "next/image";
import Link from "next/link";
import { ShieldCheck, ExternalLink } from "lucide-react";
import { primaryChainConfig } from "@/config/network";

export function Footer() {
  return (
    <footer className="border-t border-white/[0.06] bg-[#060709] py-20 text-slate-400 text-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
          {/* Brand Info */}
          <div className="md:col-span-1 space-y-4">
            <Link href="/" className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/10 flex items-center justify-center p-1">
                <Image
                  src="/images/veilport/branding/veilport-symbol.svg"
                  alt="VEILPORT"
                  width={22}
                  height={22}
                  className="object-contain"
                />
              </div>
              <span className="font-semibold text-base font-mono tracking-[0.25em] text-white">
                VEILPORT
              </span>
            </Link>
            <p className="text-xs text-slate-500 leading-relaxed max-w-xs">
              Thoughtful cryptographic privacy tools and portfolio insights for digital finance.
            </p>
          </div>

          {/* Core Protocol */}
          <div>
            <h4 className="font-mono text-[11px] uppercase tracking-[0.2em] text-slate-300 font-semibold mb-5">
              Protocol
            </h4>
            <ul className="space-y-3 text-xs">
              <li>
                <a href="#privacy" className="text-slate-400 hover:text-emerald-400 transition-colors">
                  Stealth Addresses (EIP-5564)
                </a>
              </li>
              <li>
                <a href="#dashboard" className="text-slate-400 hover:text-emerald-400 transition-colors">
                  Shielded Pools v1
                </a>
              </li>
              <li>
                <a href="#infrastructure" className="text-slate-400 hover:text-emerald-400 transition-colors">
                  Technology Overview
                </a>
              </li>
              <li>
                <a href="#flow" className="text-slate-400 hover:text-emerald-400 transition-colors">
                  Auditing View Keys
                </a>
              </li>
            </ul>
          </div>

          {/* Verified Network */}
          <div>
            <h4 className="font-mono text-[11px] uppercase tracking-[0.2em] text-slate-300 font-semibold mb-5">
              Network Details
            </h4>
            <ul className="space-y-3 text-xs font-mono">
              <li className="flex items-center gap-2">
                <span className="text-slate-500">Compatibility:</span> 
                <span className="text-slate-300">EVM Standards</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="text-slate-500">Base Currency:</span> 
                <span className="text-slate-300">ETH</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="text-slate-500">Global Dollar:</span> 
                <span className="text-slate-400">USDG (0x5fc5...d168)</span>
              </li>
              <li className="pt-1">
                <a
                  href={primaryChainConfig.explorerUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-slate-300 hover:text-emerald-400 transition-colors"
                >
                  <span>Network Block Explorer</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </li>
            </ul>
          </div>

          {/* Security & Verification Notice */}
          <div>
            <h4 className="font-mono text-[11px] uppercase tracking-[0.2em] text-slate-300 font-semibold mb-5">
              Security Standards
            </h4>
            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-2 text-xs">
              <div className="flex items-center gap-2 text-emerald-400 font-medium">
                <ShieldCheck className="w-4 h-4 text-emerald-400/90" />
                <span>Zero Private Key Custody</span>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Standard client-side signers only. Account state verified directly from network endpoints.
              </p>
            </div>
          </div>
        </div>

        <div className="pt-8 border-t border-white/[0.06] flex items-center justify-between text-xs font-mono text-slate-500">
          <div>
            &copy; {new Date().getFullYear()} VEILPORT Protocol. All rights reserved.
          </div>
        </div>
      </div>
    </footer>
  );
}
