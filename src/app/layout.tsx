import type { Metadata } from "next";
import "./globals.css";
import { Web3Provider } from "@/components/providers/Web3Provider";

export const metadata: Metadata = {
  metadataBase: new URL("https://veilport.io"),
  title: "VEILPORT — A More Private Way to Manage Digital Assets",
  description:
    "Private digital finance tools, stealth transfers, and verifiable auditing view keys.",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "32x32" },
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    apple: "/favicon.svg",
  },
  openGraph: {
    title: "VEILPORT — Privacy for the Next Era of On-Chain Finance",
    description:
      "Institutional-grade cryptographic privacy infrastructure and stealth addresses.",
    url: "https://veilport.io",
    siteName: "VEILPORT",
    images: [
      {
        url: "/images/veilport/hero/hero-banner.webp",
        width: 1774,
        height: 887,
        alt: "VEILPORT Privacy Infrastructure",
      },
    ],
    locale: "en_US",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#08090C] text-[#F8FAFC] antialiased selection:bg-emerald-500/20 selection:text-emerald-300">
        <Web3Provider>
          {children}
        </Web3Provider>
      </body>
    </html>
  );
}
