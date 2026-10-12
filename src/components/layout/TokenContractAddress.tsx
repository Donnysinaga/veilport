"use client";

import { useState, useCallback } from "react";
import { Copy, Check, ExternalLink, AlertCircle } from "lucide-react";
import { siteConfig } from "@/config/site";
import { primaryChainConfig } from "@/config/network";

interface TokenContractAddressProps {
  className?: string;
  showExplorer?: boolean;
}

export function TokenContractAddress({
  className = "",
  showExplorer = true,
}: TokenContractAddressProps) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">("idle");
  const fullAddress = siteConfig.tokenContractAddress;

  // Shortened address: 0x6839...91dc72
  const shortenedAddress = `${fullAddress.slice(0, 6)}...${fullAddress.slice(-6)}`;
  const explorerUrl = `${primaryChainConfig.explorerUrl}/address/${fullAddress}`;

  const copyToClipboard = useCallback(async () => {
    try {
      let copied = false;
      if (navigator?.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(fullAddress);
          copied = true;
        } catch {
          // Fallback if clipboard permissions are restricted or unfocused
        }
      }

      if (!copied) {
        const textArea = document.createElement("textarea");
        textArea.value = fullAddress;
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        textArea.style.top = "-9999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        copied = document.execCommand("copy");
        document.body.removeChild(textArea);
      }

      setCopyStatus(copied ? "copied" : "error");
    } catch {
      setCopyStatus("error");
    }

    setTimeout(() => {
      setCopyStatus("idle");
    }, 2000);
  }, [fullAddress]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      copyToClipboard();
    }
  };

  return (
    <div className={`inline-flex items-center gap-1.5 ${className}`}>
      {/* Clickable address pill */}
      <div
        role="button"
        tabIndex={0}
        onClick={copyToClipboard}
        onKeyDown={handleKeyDown}
        aria-label={`Copy official token contract address: ${fullAddress}`}
        title={`Click to copy: ${fullAddress}`}
        className="group relative inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] border border-white/10 hover:border-emerald-500/30 transition-all duration-200 cursor-pointer select-none text-xs font-mono"
      >
        <span className="text-[10px] tracking-wider uppercase text-slate-500 font-semibold">
          CA
        </span>
        <span
          className={`transition-colors duration-200 ${
            copyStatus === "copied"
              ? "text-emerald-300"
              : copyStatus === "error"
              ? "text-amber-300"
              : "text-slate-300 group-hover:text-white"
          }`}
        >
          {shortenedAddress}
        </span>

        {/* Small icon feedback */}
        <span className="inline-flex items-center justify-center w-3.5 h-3.5 ml-0.5">
          {copyStatus === "copied" ? (
            <Check className="w-3.5 h-3.5 text-emerald-400 animate-in zoom-in-50 duration-150" aria-hidden="true" />
          ) : copyStatus === "error" ? (
            <AlertCircle className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
          ) : (
            <Copy className="w-3.5 h-3.5 text-slate-500 group-hover:text-emerald-400 transition-colors" aria-hidden="true" />
          )}
        </span>
      </div>

      {/* Explorer link icon */}
      {showExplorer && (
        <a
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="View token contract on block explorer"
          title="View on Block Explorer"
          className="p-1.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] border border-white/10 hover:border-emerald-500/30 text-slate-500 hover:text-emerald-400 transition-all duration-200 inline-flex items-center justify-center"
        >
          <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
        </a>
      )}
    </div>
  );
}
