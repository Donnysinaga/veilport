import Image from "next/image";
import Link from "next/link";
import { ShieldCheck, ExternalLink } from "lucide-react";
import { primaryChainConfig } from "@/config/network";
import { siteConfig } from "@/config/site";

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
            <div className="pt-2">
              <span className="block font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500 mb-2.5">
                Official Channels
              </span>
              <div className="flex items-center gap-2.5">
                <a
                  href={siteConfig.socials.x}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Official VEILPORT X profile"
                  className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/10 hover:border-emerald-500/40 hover:bg-emerald-500/10 text-slate-400 hover:text-emerald-300 transition-all duration-200 flex items-center justify-center group"
                >
                  <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                  </svg>
                </a>
                <a
                  href={siteConfig.socials.telegram}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Official VEILPORT Telegram community"
                  className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/10 hover:border-emerald-500/40 hover:bg-emerald-500/10 text-slate-400 hover:text-emerald-300 transition-all duration-200 flex items-center justify-center group"
                >
                  <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z"/>
                  </svg>
                </a>
              </div>
            </div>
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

        <div className="pt-8 border-t border-white/[0.06] flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-mono text-slate-500">
          <div>
            &copy; {new Date().getFullYear()} VEILPORT Protocol. All rights reserved.
          </div>
          <div className="flex items-center gap-4">
            <a
              href={siteConfig.socials.x}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Official VEILPORT X profile"
              className="flex items-center gap-1.5 text-slate-400 hover:text-emerald-400 transition-colors"
            >
              <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
              </svg>
              <span>X</span>
            </a>
            <span className="text-white/10">·</span>
            <a
              href={siteConfig.socials.telegram}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Official VEILPORT Telegram community"
              className="flex items-center gap-1.5 text-slate-400 hover:text-emerald-400 transition-colors"
            >
              <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z"/>
              </svg>
              <span>Telegram</span>
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
