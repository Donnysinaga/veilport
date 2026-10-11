const { describe, it, before } = require('node:test');
const assert = require('node:assert');
const { padHex, toHex } = require('viem');
const { setupTestEnvironment, loadArtifact } = require('./test-helpers');

describe('VeilportPoolUSDG — ERC-20 USDG Shielded Pool', () => {
  let env;
  let poolAddress;
  let poolArtifact;
  let usdgArtifact;
  const USDG_DECIMALS = 6;
  const DENOMINATION = 100n * 10n ** BigInt(USDG_DECIMALS); // 100 USDG (100 * 10^6 units)

  before(async () => {
    env = await setupTestEnvironment();
    poolArtifact = loadArtifact('VeilportPoolUSDG');
    usdgArtifact = loadArtifact('MockUSDG');

    // Deploy USDG pool
    const poolTx = await env.deployer.client.deployContract({
      abi: poolArtifact.abi,
      bytecode: poolArtifact.bytecode,
      args: [env.verifierAddress, env.hasherAddress, DENOMINATION, env.usdgAddress],
    });
    const receipt = await env.publicClient.waitForTransactionReceipt({ hash: poolTx });
    poolAddress = receipt.contractAddress;

    // Fund depositor with USDG
    await env.deployer.client.writeContract({
      address: env.usdgAddress,
      abi: usdgArtifact.abi,
      functionName: 'mint',
      args: [env.depositor.address, 10_000n * 10n ** BigInt(USDG_DECIMALS)],
    });
  });

  it('correctly configures USDG pool token and denomination', async () => {
    const token = await env.publicClient.readContract({
      address: poolAddress,
      abi: poolArtifact.abi,
      functionName: 'token',
    });
    const denom = await env.publicClient.readContract({
      address: poolAddress,
      abi: poolArtifact.abi,
      functionName: 'denomination',
    });

    assert.strictEqual(token.toLowerCase(), env.usdgAddress.toLowerCase());
    assert.strictEqual(denom, DENOMINATION);
  });

  it('rejects native ETH sent to USDG pool during deposit', async () => {
    const commitment = padHex(toHex(111222n), { size: 32 });

    await assert.rejects(
      async () => {
        await env.depositor.client.writeContract({
          address: poolAddress,
          abi: poolArtifact.abi,
          functionName: 'deposit',
          args: [commitment],
          value: 1000000000000000n, // Non-zero ETH value
        });
      },
      /revert/i,
      'Sending native ETH to ERC-20 pool must revert'
    );
  });

  it('rejects deposit without prior token approval', async () => {
    const commitment = padHex(toHex(333444n), { size: 32 });

    await assert.rejects(
      async () => {
        await env.depositor.client.writeContract({
          address: poolAddress,
          abi: poolArtifact.abi,
          functionName: 'deposit',
          args: [commitment],
        });
      },
      /revert/i,
      'Deposit without approval must revert'
    );
  });

  it('accepts USDG deposit after approval and transfers tokens into escrow', async () => {
    // 1. Approve pool to spend denomination
    await env.depositor.client.writeContract({
      address: env.usdgAddress,
      abi: usdgArtifact.abi,
      functionName: 'approve',
      args: [poolAddress, DENOMINATION],
    });

    const depositorBalanceBefore = await env.publicClient.readContract({
      address: env.usdgAddress,
      abi: usdgArtifact.abi,
      functionName: 'balanceOf',
      args: [env.depositor.address],
    });

    // 2. Deposit into pool
    const commitment = padHex(toHex(555666n), { size: 32 });
    const tx = await env.depositor.client.writeContract({
      address: poolAddress,
      abi: poolArtifact.abi,
      functionName: 'deposit',
      args: [commitment],
    });
    const receipt = await env.publicClient.waitForTransactionReceipt({ hash: tx });
    assert.strictEqual(receipt.status, 'success');

    // 3. Verify token balances
    const depositorBalanceAfter = await env.publicClient.readContract({
      address: env.usdgAddress,
      abi: usdgArtifact.abi,
      functionName: 'balanceOf',
      args: [env.depositor.address],
    });
    const poolBalance = await env.publicClient.readContract({
      address: env.usdgAddress,
      abi: usdgArtifact.abi,
      functionName: 'balanceOf',
      args: [poolAddress],
    });

    assert.strictEqual(
      depositorBalanceBefore - depositorBalanceAfter,
      DENOMINATION,
      'Depositor must have exactly denomination deducted'
    );
    assert.strictEqual(poolBalance, DENOMINATION, 'Pool escrow balance must equal denomination');
  });

  it('executes USDG withdrawal with safe token payout to recipient and relayer', async () => {
    const root = await env.publicClient.readContract({
      address: poolAddress,
      abi: poolArtifact.abi,
      functionName: 'getLastRoot',
    });

    const nullifierHash = padHex(toHex(999000n), { size: 32 });
    const fee = 5n * 10n ** BigInt(USDG_DECIMALS); // 5 USDG relayer fee

    // Execute withdrawal
    const tx = await env.relayer.client.writeContract({
      address: poolAddress,
      abi: poolArtifact.abi,
      functionName: 'withdraw',
      args: ['0x1234', root, nullifierHash, env.recipient.address, env.relayer.address, fee],
    });
    const receipt = await env.publicClient.waitForTransactionReceipt({ hash: tx });
    assert.strictEqual(receipt.status, 'success');

    // Verify USDG balances
    const recipientBalance = await env.publicClient.readContract({
      address: env.usdgAddress,
      abi: usdgArtifact.abi,
      functionName: 'balanceOf',
      args: [env.recipient.address],
    });
    const relayerBalance = await env.publicClient.readContract({
      address: env.usdgAddress,
      abi: usdgArtifact.abi,
      functionName: 'balanceOf',
      args: [env.relayer.address],
    });

    assert.strictEqual(recipientBalance, DENOMINATION - fee, 'Recipient must receive net USDG payout');
    assert.strictEqual(relayerBalance, fee, 'Relayer must receive exact USDG fee');
  });

  it('prevents double spending with USDG: second withdrawal reverts', async () => {
    const root = await env.publicClient.readContract({
      address: poolAddress,
      abi: poolArtifact.abi,
      functionName: 'getLastRoot',
    });

    const alreadySpentNullifier = padHex(toHex(999000n), { size: 32 });

    await assert.rejects(
      async () => {
        await env.relayer.client.writeContract({
          address: poolAddress,
          abi: poolArtifact.abi,
          functionName: 'withdraw',
          args: ['0x1234', root, alreadySpentNullifier, env.recipient.address, env.relayer.address, 0n],
        });
      },
      /revert/i,
      'Reusing nullifier on USDG pool must revert'
    );
  });
});
