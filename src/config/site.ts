export const siteConfig = {
  name: "VEILPORT",
  ticker: "$VEIL",
  tagline: "A More Private Way to Manage Digital Assets.",
  description:
    "VEILPORT provides thoughtful tools for private digital asset management, clear portfolio insights, and verifiable auditing view keys.",
  network: "Robinhood Chain",
  chainId: 4663,
  rpcUrl: "https://rpc-robinhood.blockmachine.io",
  explorerUrl: "https://robinhoodchain.blockscout.com",
  contractAddress: "0x683960e09e0f7925b0be508d0ccfdb4f8a91dc72",
  tokenContractAddress: "0x683960e09e0f7925b0be508d0ccfdb4f8a91dc72",
  socials: {
    x: "https://x.com/Veilportfun",
    telegram: "https://t.me/Veilportrh",
  },
  links: {
    x: "https://x.com/Veilportfun",
    telegram: "https://t.me/Veilportrh",
  },
  tokens: {
    native: {
      symbol: "ETH",
      name: "Ether",
      decimals: 18,
      isNative: true,
      address: null,
      logoUrl: "/images/veilport/icons/tokens/eth.svg",
      verified: true,
    },
    usdg: {
      symbol: "USDG",
      name: "Global Dollar",
      decimals: 6,
      isNative: false,
      address: "0x5fc5360d0400a0fd4f2af552add042d716f1d168",
      logoUrl: "/images/veilport/icons/tokens/usdg.svg",
      verified: true,
    },
    btc: {
      symbol: "BTC",
      name: "Bitcoin (Reference Asset)",
      decimals: 8,
      isNative: false,
      address: "0x0009cD492adf8167f9eEBf1293556A673530a21a",
      logoUrl: "/images/veilport/icons/tokens/btc.svg",
      verified: false,
    },
    veil: {
      symbol: "VEIL",
      name: "VEILPORT",
      decimals: 18,
      isNative: false,
      address: "0x683960e09e0f7925b0be508d0ccfdb4f8a91dc72",
      logoUrl: "/images/veilport/branding/veilport-symbol.svg",
      verified: false,
    },
  },
  supportedWallets: [
    {
      id: "metaMask",
      name: "MetaMask",
      icon: "/images/veilport/icons/wallets/metamask.svg",
      description: "Connect using the MetaMask browser extension",
    },
    {
      id: "coinbaseWallet",
      name: "Coinbase Wallet",
      icon: "/images/veilport/icons/wallets/coinbase-wallet.svg",
      description: "Connect using Coinbase Wallet",
    },
    {
      id: "okxWallet",
      name: "OKX Wallet",
      icon: "/images/veilport/icons/wallets/okx-wallet.svg",
      description: "Connect using the OKX Web3 browser extension",
    },
    {
      id: "walletConnect",
      name: "WalletConnect",
      icon: "/images/veilport/icons/wallets/walletconnect.svg",
      description: "Scan with Rainbow, Trust, or mobile wallet",
    },
    {
      id: "rainbow",
      name: "Rainbow",
      icon: "/images/veilport/icons/wallets/rainbow.svg",
      description: "Connect with the Rainbow Ethereum wallet",
    },
  ],
  capabilities: [
    {
      title: "Stealth Address Design",
      description:
        "Generates single-use recipient destinations to decouple public account identity from transaction history.",
      illustration: "/images/veilport/illustrations/privacy-shield.webp",
      status: "Protocol Design",
    },
    {
      title: "Shielded Asset Storage",
      description:
        "Cryptographic design for shielding ETH or USDG to prevent public transaction tracing.",
      illustration: "/images/veilport/illustrations/infrastructure.webp",
      status: "Upcoming Preview",
    },
    {
      title: "Selective Auditing Keys",
      description:
        "Read-only keys allowing authorized accountants or tax advisors to review transactions securely.",
      illustration: "/images/veilport/illustrations/transaction-flow.webp",
      status: "Auditing Design",
    },
    {
      title: "Decoupled Fee Routing",
      description:
        "Architecture designed to deliver transactions without linking fee payments to origin accounts.",
      illustration: "/images/veilport/illustrations/network-globe.webp",
      status: "Routing Design",
    },
  ],
};
