const ganache = require('ganache');
const { createWalletClient, createPublicClient, custom, parseEther } = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
const { buildPoseidon } = require('circomlibjs');
const fs = require('fs');
const path = require('path');

const ARTIFACTS_DIR = path.resolve(__dirname, '../artifacts');

const TEST_CHAIN = {
  id: 1337,
  name: 'GanacheTest',
  nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [] } },
};

// Test accounts with deterministic private keys
const ACCOUNTS_PK = [
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80', // Deployer / Owner
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d', // Depositor
  '0x5de4111afa1a4b94908f83103eb294b46324202083cb0d319808479e0f60714b', // Recipient
  '0xa267ba6e95e45739d94970376678888262b80c459d139c2ad2c83b3232829041', // Relayer
  '0x47e179ec340048711f9c1dd420a145100edef343a8c600473dd04e13737da11b', // Attacker
];

function loadArtifact(name) {
  const filePath = path.join(ARTIFACTS_DIR, `${name}.json`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Artifact ${name} not found. Did you run npm run compile?`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

async function setupTestEnvironment() {
  const accountsConfig = ACCOUNTS_PK.map((secretKey) => ({
    secretKey,
    balance: 1000n * 10n ** 18n,
  }));

  const provider = ganache.provider({
    logging: { quiet: true },
    wallet: { accounts: accountsConfig },
  });

  const publicClient = createPublicClient({ chain: TEST_CHAIN, transport: custom(provider) });

  const clients = ACCOUNTS_PK.map((pk) => {
    const account = privateKeyToAccount(pk);
    return {
      account,
      address: account.address,
      client: createWalletClient({ chain: TEST_CHAIN, account, transport: custom(provider) }),
    };
  });

  const [deployer, depositor, recipient, relayer, attacker] = clients;

  // 1. Deploy PoseidonT3 hasher
  const poseidonArtifact = loadArtifact('PoseidonT3');
  const hasherTx = await deployer.client.deployContract({
    abi: poseidonArtifact.abi,
    bytecode: poseidonArtifact.bytecode,
  });
  const hasherReceipt = await publicClient.waitForTransactionReceipt({ hash: hasherTx });
  const hasherAddress = hasherReceipt.contractAddress;

  // 2. Deploy MockVerifier
  const verifierArtifact = loadArtifact('MockVerifier');
  const verifierTx = await deployer.client.deployContract({
    abi: verifierArtifact.abi,
    bytecode: verifierArtifact.bytecode,
  });
  const verifierReceipt = await publicClient.waitForTransactionReceipt({ hash: verifierTx });
  const verifierAddress = verifierReceipt.contractAddress;

  // 3. Deploy Genuine Groth16VerifierAdapter
  const adapterArtifact = loadArtifact('Groth16VerifierAdapter');
  const adapterTx = await deployer.client.deployContract({
    abi: adapterArtifact.abi,
    bytecode: adapterArtifact.bytecode,
  });
  const adapterReceipt = await publicClient.waitForTransactionReceipt({ hash: adapterTx });
  const genuineVerifierAddress = adapterReceipt.contractAddress;

  // 4. Deploy MockUSDG (6 decimals)
  const usdgArtifact = loadArtifact('MockUSDG');
  const usdgTx = await deployer.client.deployContract({
    abi: usdgArtifact.abi,
    bytecode: usdgArtifact.bytecode,
  });
  const usdgReceipt = await publicClient.waitForTransactionReceipt({ hash: usdgTx });
  const usdgAddress = usdgReceipt.contractAddress;

  // 5. Initialize JS Poseidon
  const poseidon = await buildPoseidon();

  return {
    provider,
    publicClient,
    deployer,
    depositor,
    recipient,
    relayer,
    attacker,
    hasherAddress,
    verifierAddress,
    genuineVerifierAddress,
    usdgAddress,
    poseidon,
    loadArtifact,
  };
}

module.exports = {
  setupTestEnvironment,
  loadArtifact,
  TEST_CHAIN,
};
