// src/services/executeDeposit.js
// Updated to follow LI.FI Composer API integration guide:
// https://docs.li.fi/composer/guides/api-integration
// Flow: GET /v1/quote → set allowance → send transactionRequest

import { ethers } from 'ethers'

const ERC20_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
]

/**
 * Execute a vault deposit via LI.FI Composer.
 *
 * According to the LI.FI API guide:
 * 1. GET /v1/quote — gets best route + transactionRequest in one call
 * 2. Set token allowance using quote.estimate.approvalAddress (NEVER hardcode)
 * 3. Send quote.transactionRequest
 *
 * @param {object} opts
 * @param {object} opts.vault - vault object with chainId, address, underlyingTokens
 * @param {object} opts.fromToken - { address, decimals, symbol }
 * @param {string} opts.fromAmount - raw amount string (with decimals)
 * @param {string} opts.userAddress - user wallet address
 * @param {function} [opts.onApprovalSent] - called when approval tx is sent
 * @param {function} [opts.onApprovalDone] - called when approval is confirmed
 * @param {function} [opts.onDepositSent] - called with txHash when deposit tx is sent
 */
export async function executeDeposit({
  vault,
  fromToken,
  fromAmount,
  userAddress,
  onApprovalSent,
  onApprovalDone,
  onDepositSent,
}) {
  if (!window.ethereum) {
    throw new Error('No wallet detected. Please install MetaMask or another Web3 wallet.')
  }

  const provider = new ethers.BrowserProvider(window.ethereum)
  const signer = await provider.getSigner()

  // Validate we're on the right chain
  const network = await provider.getNetwork()
  const walletChainId = Number(network.chainId)
  if (walletChainId !== vault.chainId) {
    throw new Error(
      `Wallet is on chain ${walletChainId} but vault is on chain ${vault.chainId}. Please switch networks first.`
    )
  }

  // Step 1: Get quote via GET /v1/quote (recommended by LI.FI docs)
  // The quote includes transactionRequest directly, no extra steps needed
  const quoteParams = new URLSearchParams({
    fromChain: String(vault.chainId),
    toChain: String(vault.chainId),
    fromToken: fromToken.address,
    toToken: vault.address, // vault LP token address
    fromAddress: userAddress,
    toAddress: userAddress,
    fromAmount: String(fromAmount),
    slippage: '0.005', // 0.5% slippage as recommended
  })

  const apiKey = import.meta.env.VITE_LIFI_API_KEY
  const headers = { 'Content-Type': 'application/json' }
  if (apiKey) headers['x-lifi-api-key'] = apiKey

  const quoteRes = await fetch(`https://li.quest/v1/quote?${quoteParams}`, { headers })

  if (!quoteRes.ok) {
    const errText = await quoteRes.text().catch(() => quoteRes.statusText)
    // Provide user-friendly errors
    if (quoteRes.status === 404 || errText.includes('No routes')) {
      throw new Error('No routes found. This vault may not support deposits from this token on this chain.')
    }
    throw new Error(`Quote failed (${quoteRes.status}): ${errText.slice(0, 200)}`)
  }

  const quote = await quoteRes.json()

  if (quote.message && !quote.transactionRequest) {
    throw new Error(`Quote error: ${quote.message}`)
  }

  if (!quote.transactionRequest) {
    throw new Error('No transaction data returned from quote. Please try again.')
  }

  // Step 2: Handle token approval
  // CRITICAL: Always use quote.estimate.approvalAddress — never hardcode
  const isNative =
    !fromToken.address ||
    fromToken.address === ethers.ZeroAddress ||
    fromToken.address.toLowerCase() === '0x0000000000000000000000000000000000000000' ||
    fromToken.address.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'

  if (!isNative && quote.estimate?.approvalAddress) {
    const erc20 = new ethers.Contract(fromToken.address, ERC20_ABI, signer)
    const owner = await signer.getAddress()
    const spender = quote.estimate.approvalAddress

    let currentAllowance
    try {
      currentAllowance = await erc20.allowance(owner, spender)
    } catch {
      // If allowance check fails, assume 0
      currentAllowance = 0n
    }

    if (currentAllowance < BigInt(fromAmount)) {
      onApprovalSent?.()
      const approveTx = await erc20.approve(spender, fromAmount)
      await approveTx.wait()
      onApprovalDone?.()
    } else {
      // Already approved
      onApprovalDone?.()
    }
  } else {
    // Native token or no approval needed
    onApprovalDone?.()
  }

  // Step 3: Send the deposit transaction
  // Use quote.transactionRequest exactly as returned
  const tx = await signer.sendTransaction(quote.transactionRequest)
  onDepositSent?.(tx.hash)

  const receipt = await tx.wait()
  console.log('[executeDeposit] Confirmed in block:', receipt.blockNumber)

  return { txHash: tx.hash, receipt }
}