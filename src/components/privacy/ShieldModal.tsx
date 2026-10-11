"use client";

import { useState } from "react";
import { 
  useAccount, 
  usePublicClient, 
  useWalletClient, 
  useBalance, 
  useReadContract, 
  useSwitchChain 
} from "wagmi";
import { 
  erc20Abi, 
  isAddress, 
  parseUnits, 
  formatUnits 
} from "viem";
import { 
  X, 
  Shield, 
  Lock, 
  Key, 
  Download, 
  Copy, 
  Check, 
  AlertTriangle, 
  CheckCircle2, 
  Info,
  FileKey,
  Unlock,
  ExternalLink,
  Loader2
} from "lucide-react";
import { siteConfig } from "@/config/site";
import { primaryChainConfig } from "@/config/network";
import { SUPPORTED_POOLS, POOL_ABI } from "@/config/pools";
import { VeilportNote, createNote, encryptNote, decryptNote, parseNote } from "@/lib/privacy/note";
import { MerkleTreeIndexer, DepositEventLog } from "@/lib/privacy/indexer";
import { generateWithdrawProof, verifyProofLocally, ProverInput } from "@/lib/privacy/prover";
import { 
  checkNullifierStatus, 
  validateWithdrawalParameters, 
  validateWithdrawalPreparation 
} from "@/lib/privacy/validation";

interface ShieldModalProps {
  isOpen: boolean;
  onClose: () => void;
  asset: "ETH" | "USDG";
}

export function ShieldModal({ isOpen, onClose, asset }: ShieldModalProps) {
  const { address, isConnected, chainId } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { switchChain } = useSwitchChain();

  const [activeTab, setActiveTab] = useState<"deposit" | "withdraw">("deposit");

  // --- Deposit State ---
  const [selectedDenomination, setSelectedDenomination] = useState<string>(
    asset === "ETH" ? "1.0" : "100"
  );
  const [isGeneratingNote, setIsGeneratingNote] = useState(false);
  const [generatedNote, setGeneratedNote] = useState<VeilportNote | null>(null);
  const [backupPassword, setBackupPassword] = useState("");
  const [isEncrypting, setIsEncrypting] = useState(false);
  const [, setEncryptedJson] = useState<string | null>(null);
  const [isNoteSaved, setIsNoteSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showPlaintextWarning, setShowPlaintextWarning] = useState(false);

  // Deposit Execution State
  const [depositState, setDepositState] = useState<
    "idle" | "approving" | "depositing" | "confirming" | "success" | "error"
  >("idle");
  const [depositTxHash, setDepositTxHash] = useState<`0x${string}` | null>(null);
  const [depositError, setDepositError] = useState<string | null>(null);
  const [isApproving, setIsApproving] = useState(false);

  // --- Withdraw State ---
  const [importMode, setImportMode] = useState<"encrypted" | "plaintext">("encrypted");
  const [encryptedFileText, setEncryptedFileText] = useState("");
  const [decryptPassword, setDecryptPassword] = useState("");
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [importNoteString, setImportNoteString] = useState("");
  const [isImportingRaw, setIsImportingRaw] = useState(false);
  const [importedNote, setImportedNote] = useState<VeilportNote | null>(null);
  const [recipientAddress, setRecipientAddress] = useState("");
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [withdrawProgress, setWithdrawProgress] = useState<string | null>(null);
  const [withdrawState, setWithdrawState] = useState<
    "idle" | "verifying" | "indexing" | "proving" | "submitting" | "confirming" | "success" | "error"
  >("idle");
  const [withdrawTxHash, setWithdrawTxHash] = useState<`0x${string}` | null>(null);

  const currentChainId = chainId || primaryChainConfig.chainId;
  const isWrongChain = isConnected && chainId !== primaryChainConfig.chainId;

  const denominations = asset === "ETH" ? ["0.1", "1.0", "10.0"] : ["100", "1000", "10000"];

  const poolConfig = SUPPORTED_POOLS[currentChainId]?.[`${asset}-${selectedDenomination}`];
  const isPoolConfigured = Boolean(poolConfig?.address);

  const withdrawPoolConfig = importedNote
    ? SUPPORTED_POOLS[importedNote.chainId]?.[`${importedNote.asset}-${importedNote.denomination}`]
    : null;
  const isWithdrawPoolConfigured = Boolean(withdrawPoolConfig?.address);

  // On-Chain Balance Queries for Deposit
  const { data: ethBalance } = useBalance({
    address,
    chainId: primaryChainConfig.chainId,
    query: {
      enabled: Boolean(isConnected && address && !isWrongChain && asset === "ETH"),
      staleTime: 5_000,
    },
  });

  const { data: rawUsdgBalance } = useReadContract({
    address: siteConfig.tokens.usdg.address as `0x${string}`,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: primaryChainConfig.chainId,
    query: {
      enabled: Boolean(isConnected && address && !isWrongChain && asset === "USDG"),
      staleTime: 5_000,
    },
  });

  const { data: usdgAllowance, refetch: refetchAllowance } = useReadContract({
    address: siteConfig.tokens.usdg.address as `0x${string}`,
    abi: erc20Abi,
    functionName: "allowance",
    args: address && poolConfig?.address ? [address, poolConfig.address] : undefined,
    chainId: primaryChainConfig.chainId,
    query: {
      enabled: Boolean(isConnected && address && !isWrongChain && asset === "USDG" && poolConfig?.address),
      staleTime: 5_000,
    },
  });

  if (!isOpen) return null;

  // Balance & Allowance calculations
  const userEthBalance = ethBalance?.value ?? 0n;
  const userUsdgBalance = typeof rawUsdgBalance === "bigint" ? rawUsdgBalance : 0n;
  const currentAllowance = typeof usdgAllowance === "bigint" ? usdgAllowance : 0n;

  const hasSufficientBalance = isConnected && poolConfig ? (
    asset === "ETH"
      ? userEthBalance >= poolConfig.rawUnits
      : userUsdgBalance >= poolConfig.rawUnits
  ) : false;

  const needsUsdgApproval = Boolean(
    asset === "USDG" &&
    isPoolConfigured &&
    poolConfig?.address &&
    currentAllowance < poolConfig.rawUnits
  );

  // --- Handlers: Deposit Preparation ---
  const handleGenerateNote = async () => {
    try {
      setIsGeneratingNote(true);
      setDepositError(null);
      const decimals = asset === "ETH" ? 18 : 6;
      const decimalUnits = parseUnits(selectedDenomination, decimals).toString();
      const note = await createNote(asset, selectedDenomination, decimalUnits, currentChainId);
      setGeneratedNote(note);
      setEncryptedJson(null);
      setIsNoteSaved(false);
      setDepositState("idle");
      setDepositTxHash(null);
    } catch (err: any) {
      console.error("Note generation error:", err);
      setDepositError("Failed to generate cryptographic note.");
    } finally {
      setIsGeneratingNote(false);
    }
  };

  const handleCreateEncryptedBackup = async () => {
    if (!generatedNote || !backupPassword || backupPassword.length < 8) return;
    try {
      setIsEncrypting(true);
      const encryptedObj = await encryptNote(generatedNote, backupPassword);
      const jsonStr = JSON.stringify(encryptedObj, null, 2);
      setEncryptedJson(jsonStr);

      // Trigger secure client-side download
      const blob = new Blob([jsonStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `veilport-encrypted-backup-${asset}-${selectedDenomination}-${Date.now()}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setIsNoteSaved(true);
    } catch (err: any) {
      console.error("Encryption error:", err);
      setDepositError("Encryption failed. Please try a different password.");
    } finally {
      setIsEncrypting(false);
    }
  };

  const handleDownloadPlaintextNote = () => {
    if (!generatedNote) return;
    const blob = new Blob([generatedNote.noteString], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `veilport-raw-note-UNENCRYPTED-${asset}-${Date.now()}.txt`;
    link.click();
    URL.revokeObjectURL(url);
    setIsNoteSaved(true);
  };

  // --- Handlers: Deposit Execution ---
  const handleApproveUsdg = async () => {
    if (!walletClient || !publicClient || !poolConfig?.address || !address) {
      setDepositError("Wallet not connected or contract address unavailable.");
      return;
    }
    try {
      setIsApproving(true);
      setDepositError(null);
      setDepositState("approving");

      const hash = await walletClient.writeContract({
        address: siteConfig.tokens.usdg.address as `0x${string}`,
        abi: erc20Abi,
        functionName: "approve",
        args: [poolConfig.address, poolConfig.rawUnits],
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") {
        throw new Error("USDG approval transaction reverted on-chain.");
      }

      await refetchAllowance?.();
      setDepositState("idle");
    } catch (err: any) {
      console.error("Approval error:", err);
      setDepositState("error");
      const msg = err.shortMessage || err.message || "";
      setDepositError(
        msg.toLowerCase().includes("rejected") || msg.toLowerCase().includes("denied")
          ? "Transaction Cancelled"
          : "Transaction Failed"
      );
    } finally {
      setIsApproving(false);
    }
  };

  const handleConfirmDeposit = async () => {
    if (!generatedNote || !walletClient || !publicClient || !poolConfig?.address || !address) {
      setDepositError("Wallet not connected or contract unavailable.");
      return;
    }

    try {
      setDepositState("depositing");
      setDepositError(null);
      setDepositTxHash(null);

      if (!hasSufficientBalance) {
        throw new Error("Your wallet balance is insufficient for this transaction.");
      }

      let hash: `0x${string}`;
      if (asset === "ETH") {
        hash = await walletClient.writeContract({
          address: poolConfig.address,
          abi: POOL_ABI,
          functionName: "deposit",
          args: [generatedNote.commitment as `0x${string}`],
          value: poolConfig.rawUnits,
        });
      } else {
        hash = await walletClient.writeContract({
          address: poolConfig.address,
          abi: POOL_ABI,
          functionName: "deposit",
          args: [generatedNote.commitment as `0x${string}`],
        });
      }

      setDepositTxHash(hash);
      setDepositState("confirming");

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") {
        throw new Error("Deposit transaction reverted on-chain.");
      }

      setDepositState("success");
    } catch (err: any) {
      console.error("Deposit error:", err);
      setDepositState("error");
      const msg = err.shortMessage || err.message || "";
      if (msg.includes("insufficient") || msg.includes("balance")) {
        setDepositError("Your wallet balance is insufficient for this transaction.");
      } else if (msg.toLowerCase().includes("rejected") || msg.toLowerCase().includes("denied")) {
        setDepositError("Transaction Cancelled");
      } else {
        setDepositError("Transaction Failed");
      }
    }
  };

  // --- Handlers: Withdraw Import ---
  const handleDecryptBackup = async () => {
    setWithdrawError(null);
    setIsDecrypting(true);
    try {
      const trimmed = encryptedFileText.trim();
      if (!trimmed) {
        throw new Error("Paste your encrypted backup here.");
      }
      if (trimmed.length > 100000) {
        throw new Error("Backup file exceeds maximum allowed size (100 KB).");
      }
      if (!decryptPassword) {
        throw new Error("Enter your backup password.");
      }

      let parsedJson: any;
      try {
        parsedJson = JSON.parse(trimmed);
      } catch {
        throw new Error("Check the backup format and try again.");
      }

      if (!parsedJson || typeof parsedJson !== "object") {
        throw new Error("Check the backup format and try again.");
      }
      if (parsedJson.version !== 1) {
        throw new Error("Check the backup format and try again.");
      }
      if (!parsedJson.cipher || !parsedJson.cipher.ciphertextHex || !parsedJson.cipher.ivHex) {
        throw new Error("Check the backup format and try again.");
      }
      if (!parsedJson.kdf || !parsedJson.kdf.saltHex || !parsedJson.kdf.iterations) {
        throw new Error("Check the backup format and try again.");
      }

      const decrypted = await decryptNote(parsedJson, decryptPassword);

      if (decrypted.asset !== asset) {
        throw new Error(`This backup is for ${decrypted.asset}, but the current pool is ${asset}.`);
      }
      if (decrypted.chainId !== currentChainId) {
        throw new Error("Switch to the supported network to continue.");
      }

      setImportedNote(decrypted);
      if (!recipientAddress && address) setRecipientAddress(address);
    } catch (err: any) {
      const msg = err.message || "";
      if (
        msg.includes("Decryption failed") || 
        msg.includes("operation failed") || 
        msg.includes("CipherJob error") ||
        msg.includes("bad decrypt") ||
        msg.includes("Incorrect password")
      ) {
        setWithdrawError("Unable to unlock this backup. Check your password and try again.");
      } else {
        setWithdrawError(msg || "Unable to unlock this backup. Check your password and try again.");
      }
    } finally {
      setIsDecrypting(false);
    }
  };

  const handleImportPlaintextNote = async () => {
    setWithdrawError(null);
    setIsImportingRaw(true);
    try {
      const trimmed = importNoteString.trim();
      if (!trimmed) {
        throw new Error("Please enter a note string.");
      }
      if (trimmed.length > 500) {
        throw new Error("Note string exceeds maximum allowed length.");
      }
      const unitsMap: Record<string, string> = {
        "ETH-0.1": "100000000000000000",
        "ETH-1.0": "1000000000000000000",
        "ETH-10.0": "10000000000000000000",
        "USDG-100": "100000000",
        "USDG-1000": "1000000000",
        "USDG-10000": "10000000000",
      };
      const note = await parseNote(trimmed, unitsMap);

      if (note.asset !== asset) {
        throw new Error(`Note asset mismatch: note is for ${note.asset}, but current pool is ${asset}.`);
      }
      if (note.chainId !== currentChainId) {
        throw new Error(`Network mismatch: note was created for network ${note.chainId}, but active network is ${currentChainId}.`);
      }

      setImportedNote(note);
      if (!recipientAddress && address) setRecipientAddress(address);
    } catch (err: any) {
      setWithdrawError(err.message || "Failed to parse note.");
    } finally {
      setIsImportingRaw(false);
    }
  };

  // --- Handlers: Withdraw Execution ---
  const handleExecuteWithdraw = async () => {
    if (!importedNote || !walletClient || !publicClient || !withdrawPoolConfig?.address) {
      setWithdrawError("Missing required prerequisites or pool address unconfigured.");
      return;
    }

    setWithdrawError(null);
    setWithdrawTxHash(null);

    if (!recipientAddress || !isAddress(recipientAddress) || recipientAddress.toLowerCase() === "0x0000000000000000000000000000000000000000") {
      setWithdrawError("Recipient address must be a valid, non-zero EVM address.");
      return;
    }

    try {
      const poolAddr = withdrawPoolConfig.address;

      // 1. Verify nullifier is unspent on-chain
      setWithdrawState("verifying");
      setWithdrawProgress("Checking on-chain nullifier status...");
      const nullifierCheck = await checkNullifierStatus(publicClient, poolAddr, importedNote.nullifierHash as `0x${string}`);
      if (!nullifierCheck.canProceed) {
        throw new Error(nullifierCheck.errorMessage || "Nullifier check failed: note already spent.");
      }

      // 2. Sync Merkle indexer from on-chain Deposit events
      setWithdrawState("indexing");
      setWithdrawProgress("Synchronizing Merkle tree from on-chain deposit events...");
      const indexer = await MerkleTreeIndexer.create();

      const depositLogs = await publicClient.getLogs({
        address: poolAddr,
        event: {
          type: "event",
          name: "Deposit",
          inputs: [
            { indexed: true, name: "commitment", type: "bytes32" },
            { indexed: true, name: "leafIndex", type: "uint32" },
            { indexed: false, name: "timestamp", type: "uint256" },
          ],
        },
        fromBlock: 0n,
      });

      const events: DepositEventLog[] = depositLogs.map((log: any) => ({
        commitment: log.args.commitment as `0x${string}`,
        leafIndex: Number(log.args.leafIndex),
        timestamp: Number(log.args.timestamp),
        blockNumber: log.blockNumber,
        transactionHash: log.transactionHash as `0x${string}`,
        logIndex: log.logIndex,
      }));

      if (events.length > 0) {
        indexer.ingestEvents(events);
      }

      // 3. Reconstruct Merkle path and validate preparation
      const prep = await validateWithdrawalPreparation({
        note: importedNote,
        expectedAsset: importedNote.asset,
        expectedChainId: currentChainId,
        indexer,
        poolAddress: poolAddr,
        publicClient,
      });

      if (!prep.valid || !prep.path) {
        throw new Error(prep.error || "Failed to locate commitment in indexed Merkle tree history.");
      }

      // 4. Validate withdrawal parameters
      const paramsValidation = validateWithdrawalParameters({
        recipient: recipientAddress,
        relayer: recipientAddress,
        fee: 0n,
        denomination: withdrawPoolConfig.rawUnits,
        asset: importedNote.asset,
      });

      if (!paramsValidation.valid) {
        throw new Error(paramsValidation.error || "Withdrawal parameter validation failed.");
      }

      // 5. Compute Groth16 zero-knowledge proof client-side
      setWithdrawState("proving");
      setWithdrawProgress("Computing Groth16 zk-SNARK proof locally in browser...");

      const proverInput: ProverInput = {
        root: prep.path.root,
        nullifierHash: importedNote.nullifierHash,
        recipient: recipientAddress,
        relayer: recipientAddress,
        fee: "0",
        nullifierSecret: importedNote.nullifierSecret,
        secret: importedNote.secret,
        pathElements: prep.path.pathElements,
        pathIndices: prep.path.pathIndices,
      };

      const proofResult = await generateWithdrawProof(proverInput);

      setWithdrawProgress("Verifying Groth16 proof locally against verification key...");
      const isLocalProofValid = await verifyProofLocally(proofResult.publicSignals, proofResult.proof);
      if (!isLocalProofValid) {
        throw new Error("Local Groth16 proof verification failed before on-chain submission.");
      }

      // 6. Submit on-chain withdrawal transaction
      setWithdrawState("submitting");
      setWithdrawProgress("Awaiting wallet confirmation for unshielding...");

      const hash = await walletClient.writeContract({
        address: poolAddr,
        abi: POOL_ABI,
        functionName: "withdraw",
        args: [
          proofResult.proofBytes,
          prep.path.root,
          importedNote.nullifierHash as `0x${string}`,
          recipientAddress as `0x${string}`,
          recipientAddress as `0x${string}`,
          0n,
        ],
      });

      setWithdrawTxHash(hash);
      setWithdrawState("confirming");
      setWithdrawProgress("Waiting for on-chain withdrawal confirmation receipt...");

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") {
        throw new Error("Withdrawal transaction reverted on-chain.");
      }

      setWithdrawState("success");
      setWithdrawProgress(null);
    } catch (err: any) {
      console.error("Withdrawal error:", err);
      setWithdrawState("error");
      setWithdrawProgress(null);
      const msg = err.shortMessage || err.message || "Failed to execute withdrawal transaction.";
      setWithdrawError(msg.includes("rejected") ? "Transaction request rejected in wallet." : msg);
    }
  };

  const handleReset = () => {
    setGeneratedNote(null);
    setIsNoteSaved(false);
    setBackupPassword("");
    setEncryptedJson(null);
    setDepositState("idle");
    setDepositTxHash(null);
    setDepositError(null);
    setIsApproving(false);

    setImportedNote(null);
    setImportNoteString("");
    setIsImportingRaw(false);
    setEncryptedFileText("");
    setDecryptPassword("");
    setIsDecrypting(false);
    setWithdrawError(null);
    setWithdrawProgress(null);
    setWithdrawState("idle");
    setWithdrawTxHash(null);
    setShowPlaintextWarning(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="relative w-full max-w-lg rounded-2xl bg-slate-950 border border-white/10 shadow-2xl overflow-hidden text-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/[0.08] bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-white tracking-wide text-sm flex items-center gap-2">
                <span>Privacy Shield</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  {asset} Pool
                </span>
              </h3>
              <p className="text-xs text-slate-400 font-mono">A More Private Way to Manage Assets</p>
            </div>
          </div>
          <button
            onClick={() => {
              handleReset();
              onClose();
            }}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Controls */}
        <div className="flex border-b border-white/[0.08] bg-black/40">
          <button
            onClick={() => {
              setActiveTab("deposit");
              handleReset();
            }}
            className={`flex-1 py-3 text-xs font-mono font-medium tracking-wider uppercase transition-colors cursor-pointer ${
              activeTab === "deposit"
                ? "text-emerald-400 border-b-2 border-emerald-400 bg-emerald-500/[0.04]"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Deposit
          </button>
          <button
            onClick={() => {
              setActiveTab("withdraw");
              handleReset();
            }}
            className={`flex-1 py-3 text-xs font-mono font-medium tracking-wider uppercase transition-colors cursor-pointer ${
              activeTab === "withdraw"
                ? "text-emerald-400 border-b-2 border-emerald-400 bg-emerald-500/[0.04]"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Withdraw
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
          {activeTab === "deposit" ? (
            <div className="space-y-5">
              {!generatedNote ? (
                <>
                  <div>
                    <label className="block text-xs font-mono text-slate-400 uppercase tracking-wider mb-2">
                      Select Amount
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {denominations.map((denom) => (
                        <button
                          key={denom}
                          onClick={() => setSelectedDenomination(denom)}
                          className={`py-2.5 px-3 rounded-xl border text-xs font-mono font-semibold transition cursor-pointer ${
                            selectedDenomination === denom
                              ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-400 shadow-sm"
                              : "bg-white/[0.02] border-white/10 text-slate-300 hover:bg-white/[0.05]"
                          }`}
                        >
                          {denom} {asset}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-900/60 border border-white/[0.08] space-y-2.5">
                    <div className="flex items-start gap-2.5 text-xs text-slate-300 leading-relaxed">
                      <Key className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium text-slate-200">Cryptographic Private Note</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          A private note is generated in your browser. Save an encrypted backup to withdraw your funds later.
                        </p>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={handleGenerateNote}
                    disabled={isGeneratingNote}
                    className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-semibold text-xs tracking-wider uppercase transition shadow-lg flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {isGeneratingNote ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                    <span>{isGeneratingNote ? "Generating Note..." : `Generate Note (${selectedDenomination} ${asset})`}</span>
                  </button>
                </>
              ) : (
                <div className="space-y-4">
                  {depositState === "success" ? (
                    <div className="p-5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 space-y-3">
                      <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm">
                        <CheckCircle2 className="w-5 h-5" />
                        <span>Transaction Confirmed</span>
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed font-mono">
                        Your {selectedDenomination} {asset} deposit has been confirmed on the blockchain.
                      </p>
                      {depositTxHash && (
                        <div className="p-2.5 rounded-lg bg-black/60 border border-white/10 flex items-center justify-between text-xs font-mono">
                          <span className="text-slate-400 truncate max-w-[260px]">{depositTxHash}</span>
                          <a
                            href={`${primaryChainConfig.explorerUrl}/tx/${depositTxHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-emerald-400 hover:text-emerald-300 flex items-center gap-1 shrink-0 ml-2"
                          >
                            <span>Explorer</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      )}
                      <button
                        onClick={handleReset}
                        className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs font-mono uppercase tracking-wider transition cursor-pointer mt-2"
                      >
                        Deposit Again
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-3">
                        <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                        <div>
                          <p className="text-xs font-semibold text-emerald-400">Cryptographic Note Generated</p>
                          <p className="text-[11px] text-slate-300 font-mono">Public commitment derived via Poseidon</p>
                        </div>
                      </div>

                      {/* Public Details */}
                      <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                        <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/5">
                          <span className="text-[10px] text-slate-400 block">PUBLIC COMMITMENT</span>
                          <span className="text-slate-300 truncate block mt-0.5" title={generatedNote.commitment}>
                            {generatedNote.commitment.slice(0, 10)}...{generatedNote.commitment.slice(-8)}
                          </span>
                        </div>
                        <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/5">
                          <span className="text-[10px] text-slate-400 block">NULLIFIER HASH</span>
                          <span className="text-slate-300 truncate block mt-0.5" title={generatedNote.nullifierHash}>
                            {generatedNote.nullifierHash.slice(0, 10)}...{generatedNote.nullifierHash.slice(-8)}
                          </span>
                        </div>
                      </div>

                      {/* Primary Encrypted Backup */}
                      <div className="p-4 rounded-xl bg-slate-900 border border-emerald-500/20 space-y-3">
                        <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
                          <FileKey className="w-4 h-4" />
                          <span>Encrypted Backup (Required)</span>
                        </div>
                        <p className="text-[11px] text-slate-400 leading-relaxed">
                          Enter a secure password to encrypt and download your private note.
                        </p>
                        <div className="space-y-2">
                          <input
                            type="password"
                            value={backupPassword}
                            onChange={(e) => setBackupPassword(e.target.value)}
                            placeholder="Enter password (min 8 characters)"
                            className="w-full p-2.5 rounded-xl bg-black/60 border border-white/10 font-mono text-xs text-white focus:outline-none focus:border-emerald-500 transition"
                          />
                          <button
                            onClick={handleCreateEncryptedBackup}
                            disabled={backupPassword.length < 8 || isEncrypting}
                            className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-semibold text-xs font-mono transition flex items-center justify-center gap-2 cursor-pointer"
                          >
                            {isEncrypting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                            <span>{isEncrypting ? "Encrypting..." : isNoteSaved ? "Backup Downloaded ✓" : "Download Encrypted Backup"}</span>
                          </button>
                        </div>
                      </div>

                      {/* Optional Plaintext Warning Accordion */}
                      <div className="pt-1">
                        <button
                          onClick={() => setShowPlaintextWarning(!showPlaintextWarning)}
                          className="text-[11px] text-slate-400 hover:text-slate-200 underline flex items-center gap-1 font-mono cursor-pointer"
                        >
                          <Info className="w-3 h-3" />
                          <span>{showPlaintextWarning ? "Hide Raw Note Key" : "View Note Key (Advanced)"}</span>
                        </button>
                        {showPlaintextWarning && (
                          <div className="mt-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 space-y-2">
                            <div className="flex items-center gap-2 text-amber-300 text-xs font-semibold">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              <span>Notice: Anyone with this key can withdraw your funds.</span>
                            </div>
                            <div className="p-2.5 rounded-lg bg-black/80 font-mono text-[10px] text-slate-300 break-all select-all">
                              {generatedNote.noteString}
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(generatedNote.noteString);
                                  setCopied(true);
                                  setTimeout(() => setCopied(false), 2000);
                                }}
                                className="text-xs font-mono text-emerald-400 hover:underline flex items-center gap-1"
                              >
                                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                <span>{copied ? "Copied" : "Copy Note Key"}</span>
                              </button>
                              <button
                                onClick={handleDownloadPlaintextNote}
                                className="text-xs font-mono text-slate-300 hover:underline flex items-center gap-1"
                              >
                                <Download className="w-3.5 h-3.5" />
                                <span>Download Note Key (.txt)</span>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="pt-2 border-t border-white/[0.08] space-y-3">
                        <div className="p-3 rounded-xl bg-slate-900 border border-white/10 text-xs font-mono space-y-1.5">
                          <div className="flex justify-between text-slate-400">
                            <span>Target Network:</span>
                            <span className="text-white">{primaryChainConfig.name} ({currentChainId})</span>
                          </div>
                          <div className="flex justify-between text-slate-400">
                            <span>Deposit Amount:</span>
                            <span className="text-emerald-400 font-semibold">{selectedDenomination} {asset}</span>
                          </div>
                          <div className="flex justify-between text-slate-400">
                            <span>Available Balance:</span>
                            <span className="text-slate-300 font-semibold">
                              {asset === "ETH"
                                ? `${Number(formatUnits(userEthBalance, 18)).toFixed(4)} ETH`
                                : `${Number(formatUnits(userUsdgBalance, 6)).toFixed(2)} USDG`}
                            </span>
                          </div>
                          <div className="flex justify-between text-slate-400">
                            <span>Contract Status:</span>
                            <span className={isPoolConfigured ? "text-emerald-400" : "text-amber-400"}>
                              {isPoolConfigured ? "Active Pool" : "Pending Deployment"}
                            </span>
                          </div>
                        </div>

                        {/* Wrong Network / Disconnected Warnings */}
                        {!isConnected ? (
                          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs font-mono text-amber-300 flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 shrink-0" />
                            <span>Please connect your wallet to proceed with deposit.</span>
                          </div>
                        ) : isWrongChain ? (
                          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs font-mono text-rose-300 flex items-center justify-between">
                            <span className="flex items-center gap-1.5">
                              <AlertTriangle className="w-4 h-4 shrink-0" />
                              <span>Switch to {primaryChainConfig.name}</span>
                            </span>
                            <button
                              onClick={() => switchChain?.({ chainId: primaryChainConfig.chainId })}
                              className="px-2.5 py-1 rounded bg-rose-500 text-slate-950 font-bold hover:bg-rose-400 transition"
                            >
                              Switch
                            </button>
                          </div>
                        ) : !hasSufficientBalance ? (
                          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs font-mono text-rose-300 flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 shrink-0" />
                            <span>
                              Insufficient {asset} balance. Requires {selectedDenomination} {asset}.
                            </span>
                          </div>
                        ) : null}

                        {/* Unconfigured Pool State */}
                        {!isPoolConfigured ? (
                          <div className="space-y-2">
                            <button
                              disabled={true}
                              className="w-full py-3 rounded-xl bg-slate-800/80 border border-white/5 text-slate-500 text-xs font-semibold font-mono tracking-wider uppercase flex items-center justify-center gap-2 cursor-not-allowed"
                            >
                              <Shield className="w-4 h-4" />
                              <span>Pool Deployment Pending</span>
                            </button>
                            <p className="text-[11px] text-slate-500 text-center font-mono">
                              Pool contract is not yet deployed on this network.
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {/* USDG ERC-20 Allowance Step */}
                            {needsUsdgApproval && (
                              <button
                                onClick={handleApproveUsdg}
                                disabled={isApproving || !isConnected || isWrongChain || !hasSufficientBalance}
                                className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-semibold text-xs font-mono uppercase tracking-wider transition shadow-lg flex items-center justify-center gap-2 cursor-pointer"
                              >
                                {isApproving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                                <span>{isApproving ? "Approving USDG..." : `Step 1: Approve USDG (${selectedDenomination})`}</span>
                              </button>
                            )}

                            {/* Main Deposit Execution Button */}
                            <button
                              onClick={handleConfirmDeposit}
                              disabled={
                                !isNoteSaved ||
                                !isConnected ||
                                isWrongChain ||
                                !hasSufficientBalance ||
                                needsUsdgApproval ||
                                depositState === "depositing" ||
                                depositState === "confirming"
                              }
                              className={`w-full py-3 rounded-xl text-xs font-semibold tracking-wider uppercase transition shadow-lg flex items-center justify-center gap-2 ${
                                isNoteSaved && isConnected && !isWrongChain && hasSufficientBalance && !needsUsdgApproval
                                  ? "bg-emerald-500 hover:bg-emerald-400 text-slate-950 cursor-pointer"
                                  : "bg-slate-800 text-slate-500 cursor-not-allowed"
                              }`}
                              title={
                                !isNoteSaved
                                  ? "Please download an encrypted backup of your note first"
                                  : !hasSufficientBalance
                                  ? "Insufficient balance"
                                  : needsUsdgApproval
                                  ? "Please approve USDG spending first"
                                  : ""
                              }
                            >
                              {depositState === "depositing" || depositState === "confirming" ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Shield className="w-4 h-4" />
                              )}
                              <span>
                                {depositState === "depositing"
                                  ? "Confirm in Wallet"
                                  : depositState === "confirming"
                                  ? "Transaction Submitted"
                                  : `Deposit ${selectedDenomination} ${asset}`}
                              </span>
                            </button>
                          </div>
                        )}

                        {depositError && (
                          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs font-mono flex items-start gap-2">
                            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                            <div>
                              <p className="font-semibold">{depositError}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {withdrawState === "success" ? (
                <div className="p-5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 space-y-3">
                  <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm">
                    <CheckCircle2 className="w-5 h-5" />
                    <span>Transaction Confirmed</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed font-mono">
                    Zero-knowledge proof verified. {importedNote?.denomination} {importedNote?.asset} has been transferred to the recipient address.
                  </p>
                  {withdrawTxHash && (
                    <div className="p-2.5 rounded-lg bg-black/60 border border-white/10 flex items-center justify-between text-xs font-mono">
                      <span className="text-slate-400 truncate max-w-[260px]">{withdrawTxHash}</span>
                      <a
                        href={`${primaryChainConfig.explorerUrl}/tx/${withdrawTxHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-emerald-400 hover:text-emerald-300 flex items-center gap-1 shrink-0 ml-2"
                      >
                        <span>Explorer</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  )}
                  <button
                    onClick={handleReset}
                    className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs font-mono uppercase tracking-wider transition cursor-pointer mt-2"
                  >
                    Done
                  </button>
                </div>
              ) : !importedNote ? (
                <>
                  <div className="flex gap-2 border-b border-white/[0.08] pb-3">
                    <button
                      onClick={() => {
                        setImportMode("encrypted");
                        setWithdrawError(null);
                      }}
                      className={`text-xs font-mono pb-1 border-b cursor-pointer transition-colors ${
                        importMode === "encrypted"
                          ? "text-emerald-400 border-emerald-400 font-semibold"
                          : "text-slate-400 border-transparent hover:text-white"
                      }`}
                    >
                      Encrypted Backup
                    </button>
                    <button
                      onClick={() => {
                        setImportMode("plaintext");
                        setWithdrawError(null);
                      }}
                      className={`text-xs font-mono pb-1 border-b cursor-pointer transition-colors ${
                        importMode === "plaintext"
                          ? "text-emerald-400 border-emerald-400 font-semibold"
                          : "text-slate-400 border-transparent hover:text-white"
                      }`}
                    >
                      Recovery Note
                    </button>
                  </div>

                  {importMode === "encrypted" ? (
                    <div className="space-y-3">
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="block text-xs font-mono text-slate-400 uppercase tracking-wider">
                            Encrypted Backup
                          </label>
                          <span className="text-[11px] font-mono text-slate-500">JSON File</span>
                        </div>
                        <textarea
                          value={encryptedFileText}
                          onChange={(e) => {
                            setEncryptedFileText(e.target.value);
                            if (withdrawError) setWithdrawError(null);
                          }}
                          placeholder="Paste your encrypted backup here"
                          rows={4}
                          className="w-full p-3 rounded-xl bg-black/60 border border-white/10 font-mono text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 transition resize-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-mono text-slate-400 uppercase tracking-wider mb-1.5">
                          Backup Password
                        </label>
                        <input
                          type="password"
                          value={decryptPassword}
                          onChange={(e) => {
                            setDecryptPassword(e.target.value);
                            if (withdrawError) setWithdrawError(null);
                          }}
                          placeholder="Enter your backup password"
                          className="w-full p-2.5 rounded-xl bg-black/60 border border-white/10 font-mono text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 transition"
                        />
                      </div>
                      <button
                        onClick={handleDecryptBackup}
                        disabled={!encryptedFileText.trim() || !decryptPassword || isDecrypting}
                        className={`w-full py-3 rounded-xl text-xs font-semibold tracking-wider uppercase transition shadow-lg flex items-center justify-center gap-2 ${
                          encryptedFileText.trim() && decryptPassword && !isDecrypting
                            ? "bg-emerald-500 hover:bg-emerald-400 text-slate-950 cursor-pointer"
                            : "bg-slate-800 text-slate-500 cursor-not-allowed"
                        }`}
                      >
                        {isDecrypting ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Unlock className="w-4 h-4" />
                        )}
                        <span>{isDecrypting ? "Unlocking Backup..." : "Unlock Backup"}</span>
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="block text-xs font-mono text-slate-400 uppercase tracking-wider">
                            Recovery Note
                          </label>
                          <span className="text-[11px] font-mono text-slate-500">Plaintext Note</span>
                        </div>
                        <textarea
                          value={importNoteString}
                          onChange={(e) => {
                            setImportNoteString(e.target.value);
                            if (withdrawError) setWithdrawError(null);
                          }}
                          placeholder="Paste your recovery note (veilport-...)"
                          rows={3}
                          className="w-full p-3 rounded-xl bg-black/60 border border-white/10 font-mono text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 transition resize-none"
                        />
                      </div>
                      <button
                        onClick={handleImportPlaintextNote}
                        disabled={!importNoteString.trim() || isImportingRaw}
                        className={`w-full py-3 rounded-xl text-xs font-semibold tracking-wider uppercase transition shadow-lg flex items-center justify-center gap-2 ${
                          importNoteString.trim() && !isImportingRaw
                            ? "bg-emerald-500 hover:bg-emerald-400 text-slate-950 cursor-pointer"
                            : "bg-slate-800 text-slate-500 cursor-not-allowed"
                        }`}
                      >
                        {isImportingRaw ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Key className="w-4 h-4" />
                        )}
                        <span>{isImportingRaw ? "Validating Note..." : "Import Recovery Note"}</span>
                      </button>
                    </div>
                  )}

                  {withdrawError && (
                    <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs font-mono flex items-center gap-2 animate-in fade-in duration-150">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>{withdrawError}</span>
                    </div>
                  )}
                </>
              ) : (
                <div className="space-y-4">
                  <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs font-mono space-y-1">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Authenticated Asset:</span>
                      <span className="text-emerald-400 font-semibold">{importedNote.denomination} {importedNote.asset}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Nullifier Hash:</span>
                      <span className="text-slate-300">{importedNote.nullifierHash.slice(0, 10)}...{importedNote.nullifierHash.slice(-8)}</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-mono text-slate-400 uppercase tracking-wider mb-1.5">
                      Recipient Address
                    </label>
                    <input
                      type="text"
                      value={recipientAddress}
                      onChange={(e) => setRecipientAddress(e.target.value)}
                      placeholder="0x..."
                      className="w-full p-2.5 rounded-xl bg-black/60 border border-white/10 font-mono text-xs text-white focus:outline-none focus:border-emerald-500 transition"
                    />
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-900 border border-white/10 text-xs font-mono space-y-2">
                    <div className="flex items-center gap-2 text-amber-300">
                      <Info className="w-4 h-4 shrink-0" />
                      <span>Zero-Knowledge Proof Verification</span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Withdrawal computes a genuine Groth16 zk-SNARK proof locally using WebAssembly. The proof is verified against on-chain Merkle root history before unshielding funds.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <button
                        onClick={handleReset}
                        className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white font-mono text-xs transition cursor-pointer"
                      >
                        Back
                      </button>
                      <button
                        disabled={!isWithdrawPoolConfigured || withdrawState === "proving" || withdrawState === "submitting" || withdrawState === "confirming"}
                        onClick={handleExecuteWithdraw}
                        className={`flex-1 py-2.5 rounded-xl text-xs font-mono tracking-wider uppercase transition shadow-lg flex items-center justify-center gap-2 ${
                          isWithdrawPoolConfigured && withdrawState !== "proving" && withdrawState !== "submitting" && withdrawState !== "confirming"
                            ? "bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold cursor-pointer"
                            : "bg-slate-800 text-slate-500 cursor-not-allowed"
                        }`}
                      >
                        {withdrawState === "proving" || withdrawState === "submitting" || withdrawState === "confirming" ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Lock className="w-3.5 h-3.5" />
                        )}
                        <span>
                          {isWithdrawPoolConfigured
                            ? withdrawState === "proving"
                              ? "Proving zk-SNARK..."
                              : withdrawState === "submitting"
                              ? "Confirm in Wallet"
                              : withdrawState === "confirming"
                              ? "Transaction Submitted"
                              : "Withdraw"
                            : "Pool Deployment Pending"}
                        </span>
                      </button>
                    </div>
                    {!isWithdrawPoolConfigured && (
                      <p className="text-[11px] text-slate-500 text-center font-mono">
                        Pool contract is not yet deployed on this network.
                      </p>
                    )}
                  </div>

                  {withdrawProgress && (
                    <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                      <span>{withdrawProgress}</span>
                    </div>
                  )}

                  {withdrawError && (
                    <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs font-mono flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold">Withdrawal Error</p>
                        <p className="text-[11px] text-rose-200/80 mt-0.5">{withdrawError}</p>
                        <p className="text-[10px] text-slate-400 mt-1">Note remains loaded and preserved in memory.</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
