const fs = require('fs');
const path = require('path');
const solc = require('solc');
const { poseidonContract } = require('circomlibjs');

const CONTRACTS_DIR = path.resolve(__dirname, '../contracts');
const ARTIFACTS_DIR = path.resolve(__dirname, '../artifacts');

if (!fs.existsSync(ARTIFACTS_DIR)) {
  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
}

console.log('Compiling VEILPORT protocol contracts...');

// Find all .sol files
function findSolidityFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      results = results.concat(findSolidityFiles(fullPath));
    } else if (file.endsWith('.sol')) {
      results.push(fullPath);
    }
  }
  return results;
}

const solFiles = findSolidityFiles(CONTRACTS_DIR);
const sources = {};

for (const filePath of solFiles) {
  const relativePath = path.relative(CONTRACTS_DIR, filePath).replace(/\\/g, '/');
  sources[relativePath] = {
    content: fs.readFileSync(filePath, 'utf8'),
  };
}

const input = {
  language: 'Solidity',
  sources: sources,
  settings: {
    optimizer: {
      enabled: true,
      runs: 200,
    },
    outputSelection: {
      '*': {
        '*': ['abi', 'evm.bytecode.object'],
      },
    },
  },
};

function findImports(importPath) {
  const fullPath = path.resolve(CONTRACTS_DIR, importPath);
  if (fs.existsSync(fullPath)) {
    return { contents: fs.readFileSync(fullPath, 'utf8') };
  }
  return { error: 'File not found: ' + importPath };
}

const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));

if (output.errors) {
  let hasErrors = false;
  for (const error of output.errors) {
    if (error.severity === 'error') {
      console.error('Error:', error.formattedMessage);
      hasErrors = true;
    } else {
      console.warn('Warning:', error.formattedMessage);
    }
  }
  if (hasErrors) {
    process.exit(1);
  }
}

// Write artifacts
for (const [sourceFile, contracts] of Object.entries(output.contracts)) {
  for (const [contractName, contractData] of Object.entries(contracts)) {
    const artifactPath = path.join(ARTIFACTS_DIR, `${contractName}.json`);
    fs.writeFileSync(
      artifactPath,
      JSON.stringify(
        {
          contractName,
          sourceFile,
          abi: contractData.abi,
          bytecode: '0x' + contractData.evm.bytecode.object,
        },
        null,
        2
      )
    );
    console.log(`  ✓ Built ${contractName} (${artifactPath})`);
  }
}

// Generate PoseidonT3 bytecode via circomlibjs
const poseidonBytecode = poseidonContract.createCode(2);
const poseidonAbi = poseidonContract.generateABI(2);
fs.writeFileSync(
  path.join(ARTIFACTS_DIR, 'PoseidonT3.json'),
  JSON.stringify(
    {
      contractName: 'PoseidonT3',
      abi: poseidonAbi,
      bytecode: poseidonBytecode,
    },
    null,
    2
  )
);
console.log('  ✓ Built PoseidonT3 hasher via circomlibjs');

console.log('Contract compilation completed successfully.');
