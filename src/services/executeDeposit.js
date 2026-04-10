// src/services/executeDeposit.js
// Full Composer integration — deposit from ANY token on ANY chain into ANY vault
// Supports: same-chain, cross-chain, any-token → vault
// Docs: https://docs.li.fi/composer/guides/api-integration

import { ethers } from 'ethers'

const ERC20_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
]

const NATIVE_TOKEN_ADDRESSES = [
  '0x0000000000000000000000000000000000000000',
  '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
]

function isNativeToken(address) {
  if (!address) return true
  return NATIVE_TOKEN_ADDRESSES.includes(address.toLowerCase())
}

/**
 * Get a LI.FI Composer quote for depositing into a vault.
 * Handles cross-chain: fromChain can differ from vault's chain.
 *
 * @param {object} params
 * @param {number} params.fromChain - chain ID the user is sending FROM
 * @param {number} params.toChain - chain ID the vault is on
 * @param {string} params.fromToken - token address the user is depositing FROM
 * @param {string} params.toToken - vault address (IS the toToken per LI.FI docs)
 * @param {string} params.fromAddress - user wallet address
 * @param {string} params.fromAmount - raw amount string (with decimals)
 * @param {string} [params.apiKey] - LI.FI API key
 */
export async function getComposerQuote({
  fromChain,
  toChain,
  fromToken,
  toToken,
  fromAddress,
  fromAmount,
  apiKey,
}) {
  const params = new URLSearchParams({
    fromChain: String(fromChain),
    toChain: String(toChain),
    fromToken,
    toToken,
    fromAddress,
    toAddress: fromAddress,
    fromAmount: String(fromAmount),
    slippage: '0.005',
  })

  const headers = { 'Content-Type': 'application/json' }
  if (apiKey) headers['x-lifi-api-key'] = apiKey

  // Call directly to li.quest (Composer endpoint)
  // Uses the /lifi-api proxy in dev, direct in prod
  const baseUrl = typeof window !== 'undefined' && window.location.hostname === 'localhost'
    ? '/lifi-api'
    : 'https://li.quest'

  const res = await fetch(`${baseUrl}/v1/quote?${params}`, { headers })

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText)
    if (res.status === 404 || errText.toLowerCase().includes('no routes')) {
      throw new Error('No routes found. This vault may not support deposits from this token/chain combination.')
    }
    if (res.status === 422) {
      throw new Error(`Deposit not supported: ${errText.slice(0, 200)}`)
    }
    throw new Error(`Quote failed (${res.status}): ${errText.slice(0, 200)}`)
  }

  const quote = await res.json()

  if (quote.message && !quote.transactionRequest) {
    throw new Error(`Quote error: ${quote.message}`)
  }
  if (!quote.transactionRequest) {
    throw new Error('No transaction data returned from Composer. Please try again.')
  }

  return quote
}

/**
 * Execute a vault deposit via LI.FI Composer.
 *
 * Supports ANY source token on ANY chain → vault on ANY chain.
 * This is the "DeFi Mullet": one click, composer handles swap+bridge+deposit.
 *
 * Flow:
 *   1. GET /v1/quote (Composer builds swap+bridge+deposit in one tx)
 *   2. Set ERC-20 allowance if needed (using quote.estimate.approvalAddress)
 *   3. Send quote.transactionRequest
 *   4. For cross-chain: poll /v1/status until DONE
 *
 * @param {object} opts
 * @param {object} opts.vault - vault object (chainId, address, underlyingTokens)
 * @param {object} opts.fromToken - { address, decimals, symbol } — the token user wants to deposit
 * @param {string} opts.fromAmount - raw amount string (already converted with decimals)
 * @param {string} opts.userAddress - user wallet address
 * @param {number} [opts.fromChainId] - override source chain (defaults to vault.chainId for same-chain)
 * @param {function} [opts.onApprovalSent] - called when approval tx is sent
 * @param {function} [opts.onApprovalDone] - called when approval is confirmed
 * @param {function} [opts.onDepositSent] - called with txHash when deposit tx is sent
 * @param {function} [opts.onCrossChainPending] - called if cross-chain, with txHash
 */
export async function executeDeposit({
  vault,
  fromToken,
  fromAmount,
  userAddress,
  fromChainId,
  onApprovalSent,
  onApprovalDone,
  onDepositSent,
  onCrossChainPending,
}) {
  if (!window.ethereum) {
    throw new Error('No wallet detected. Please install MetaMask or another Web3 wallet.')
  }

  const provider = new ethers.BrowserProvider(window.ethereum)
  const signer = await provider.getSigner()

  // Determine actual source chain from wallet
  const network = await provider.getNetwork()
  const walletChainId = Number(network.chainId)

  // Use wallet's current chain as fromChain (Composer handles cross-chain)
  const sourceChainId = fromChainId ?? walletChainId
  const destChainId = vault.chainId
  const isCrossChain = sourceChainId !== destChainId

  const apiKey = import.meta.env.VITE_LIFI_API_KEY

  // Step 1: Get Composer quote
  // fromToken = what user has, toToken = vault address (vault LP token)
  const quote = await getComposerQuote({
    fromChain: walletChainId, // Must match wallet's current chain
    toChain: destChainId,
    fromToken: fromToken.address,
    toToken: vault.address, // Per LI.FI docs: vault address IS the toToken
    fromAddress: userAddress,
    fromAmount: String(fromAmount),
    apiKey,
  })

  // Step 2: Handle ERC-20 approval
  // ALWAYS use quote.estimate.approvalAddress — never hardcode
  const native = isNativeToken(fromToken.address)

  if (!native && quote.estimate?.approvalAddress) {
    const erc20 = new ethers.Contract(fromToken.address, ERC20_ABI, signer)
    const owner = await signer.getAddress()
    const spender = quote.estimate.approvalAddress

    let currentAllowance = 0n
    try {
      currentAllowance = await erc20.allowance(owner, spender)
    } catch {
      // If allowance check fails, assume 0
      currentAllowance = 0n
    }

    const needed = BigInt(fromAmount)
    if (currentAllowance < needed) {
      onApprovalSent?.()
      const approveTx = await erc20.approve(spender, fromAmount)
      await approveTx.wait()
      onApprovalDone?.()
    } else {
      // Already approved — skip
      onApprovalDone?.()
    }
  } else {
    // Native token or no approval needed
    onApprovalDone?.()
  }

  // Step 3: Send the deposit transaction
  // transactionRequest is ready-to-sign from Composer
  const tx = await signer.sendTransaction(quote.transactionRequest)
  onDepositSent?.(tx.hash)

  const receipt = await tx.wait()
  console.log('[executeDeposit] Confirmed in block:', receipt.blockNumber)

  // Step 4: For cross-chain deposits, notify UI to poll status
  if (isCrossChain) {
    onCrossChainPending?.(tx.hash)
    // Optionally poll status (non-blocking)
    pollCrossChainStatus(tx.hash, walletChainId, destChainId, apiKey).catch(err => {
      console.warn('[executeDeposit] Cross-chain poll error:', err)
    })
  }

  return {
    txHash: tx.hash,
    receipt,
    isCrossChain,
    quote,
  }
}

/**
 * Poll /v1/status for cross-chain transfers.
 * Resolves when status is DONE or FAILED.
 */
export async function pollCrossChainStatus(txHash, fromChain, toChain, apiKey, maxAttempts = 60) {
  const headers = {}
  if (apiKey) headers['x-lifi-api-key'] = apiKey

  const baseUrl = typeof window !== 'undefined' && window.location.hostname === 'localhost'
    ? '/lifi-api'
    : 'https://li.quest'

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 5000))
    try {
      const params = new URLSearchParams({
        txHash,
        fromChain: String(fromChain),
        toChain: String(toChain),
      })
      const res = await fetch(`${baseUrl}/v1/status?${params}`, { headers })
      if (!res.ok) continue
      const data = await res.json()
      console.log(`[pollCrossChainStatus] ${data.status} (${data.substatus ?? ''})`)
      if (data.status === 'DONE' || data.status === 'FAILED') return data
    } catch {
      // Keep polling
    }
  }
  return null
}