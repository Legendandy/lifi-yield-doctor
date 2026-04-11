// src/services/executeDeposit.js
//
// COMPOSER DEPOSIT - How it works (from docs):
//
// GET https://li.quest/v1/quote
//   fromChain = chain wallet is on
//   toChain   = chain vault is on
//   fromToken = token user wants to deposit (e.g. USDC on Base)
//   toToken   = VAULT ADDRESS (the vault LP/share token)  <-- THIS triggers Composer
//   fromAmount = raw integer string (with correct decimals)
//
// The vault address is the KEY. When toToken is a Composer-supported vault token,
// LI.FI builds a route that includes swap+bridge+deposit atomically.
//
// IMPORTANT: Not all vaults are supported by Composer. If unsupported, you get
// "No routes found". Check https://docs.li.fi/composer/reference/supported-protocols

import { ethers } from 'ethers'

const ERC20_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
]

const NATIVE_ADDRESSES = new Set([
  '0x0000000000000000000000000000000000000000',
  '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
])

export function isNativeToken(address) {
  if (!address) return true
  return NATIVE_ADDRESSES.has(address.toLowerCase())
}

function getLifiBase() {
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    return '/lifi-api'
  }
  return 'https://li.quest'
}

/**
 * Convert human-readable float to raw integer string for API.
 * "1.5" with decimals=6 → "1500000"
 */
export function toRawAmount(humanAmount, decimals) {
  if (!humanAmount || isNaN(parseFloat(humanAmount))) return '0'
  const str = String(humanAmount).trim()
  const dotIdx = str.indexOf('.')
  if (dotIdx === -1) {
    // Whole number
    return (BigInt(str) * BigInt(10 ** decimals)).toString()
  }
  const whole = str.slice(0, dotIdx) || '0'
  const frac = str.slice(dotIdx + 1).padEnd(decimals, '0').slice(0, decimals)
  return (BigInt(whole) * BigInt(10 ** decimals) + BigInt(frac)).toString()
}

/**
 * Request a Composer quote from LI.FI.
 * toToken = vault address = tells Composer to DEPOSIT into the vault.
 */
export async function getComposerQuote({
  fromChain,
  toChain,
  fromToken,
  toToken,     // MUST be the vault LP/share token address
  fromAddress,
  fromAmount,  // raw integer string
  apiKey,
}) {
  // Validate amount
  let rawAmount
  try {
    rawAmount = BigInt(fromAmount).toString()
    if (rawAmount === '0') throw new Error('zero amount')
  } catch (e) {
    throw new Error(`Invalid amount "${fromAmount}": must be a non-zero integer string representing the token amount with decimals applied.`)
  }

  const params = new URLSearchParams({
    fromChain: String(fromChain),
    toChain: String(toChain),
    fromToken,
    toToken,
    fromAddress,
    toAddress: fromAddress,
    fromAmount: rawAmount,
    slippage: '0.005',
    integrator: 'yield-doctor',
  })

  const reqHeaders = { 'Content-Type': 'application/json' }
  if (apiKey) reqHeaders['x-lifi-api-key'] = apiKey

  const base = getLifiBase()

  console.log('[Composer] Quote request:', {
    fromChain, toChain,
    fromToken: fromToken.slice(0, 10) + '...',
    toToken: toToken.slice(0, 10) + '...',
    fromAmount: rawAmount,
  })

  const res = await fetch(`${base}/v1/quote?${params}`, { headers: reqHeaders })

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText)
    console.error('[Composer] Quote error:', res.status, errText.slice(0, 200))

    if (res.status === 404 || errText.toLowerCase().includes('no routes')) {
      throw new Error(
        `No deposit route found for this vault.\n\nThis vault may not yet be supported by Composer. Try:\n• Using the same underlying token as the vault\n• Depositing on the same chain as the vault`
      )
    }
    if (res.status === 400) {
      throw new Error(`Bad request to Composer: ${errText.slice(0, 200)}`)
    }
    throw new Error(`Composer quote failed (${res.status}): ${errText.slice(0, 200)}`)
  }

  const quote = await res.json()

  console.log('[Composer] Quote response:', {
    type: quote.type,
    tool: quote.tool,
    toTokenSymbol: quote.action?.toToken?.symbol,
    toTokenAddress: quote.action?.toToken?.address?.slice(0, 10),
    steps: quote.includedSteps?.length,
    hasTransactionRequest: !!quote.transactionRequest,
  })

  if (!quote.transactionRequest) {
    throw new Error('Composer returned no transaction data. This vault may not support Composer deposits.')
  }

  return quote
}

/**
 * Execute a vault deposit via LI.FI Composer.
 *
 * The wallet must already be switched to fromChainId before calling this.
 * The DepositModal handles chain switching.
 */
export async function executeDeposit({
  vault,
  fromToken,
  fromAmount,    // raw integer string (amount with decimals)
  userAddress,
  fromChainId,   // source chain (wallet must be on this chain)
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

  const network = await provider.getNetwork()
  const walletChainId = Number(network.chainId)
  const sourceChainId = fromChainId ?? walletChainId
  const destChainId = vault.chainId
  const isCrossChain = sourceChainId !== destChainId

  if (walletChainId !== sourceChainId) {
    throw new Error(
      `Wallet is on chain ${walletChainId} but deposit is from chain ${sourceChainId}. Please switch networks.`
    )
  }

  const apiKey = import.meta.env.VITE_LIFI_API_KEY

  // Get Composer quote
  // vault.address = vault LP/share token = triggers Composer deposit action
  const quote = await getComposerQuote({
    fromChain: walletChainId,
    toChain: destChainId,
    fromToken: fromToken.address,
    toToken: vault.address,
    fromAddress: userAddress,
    fromAmount: String(fromAmount),
    apiKey,
  })

  // Handle token approval (use approvalAddress from quote, never hardcode)
  const native = isNativeToken(fromToken.address)

  if (!native && quote.estimate?.approvalAddress) {
    const erc20 = new ethers.Contract(fromToken.address, ERC20_ABI, signer)
    const owner = await signer.getAddress()
    const spender = quote.estimate.approvalAddress

    let currentAllowance = 0n
    try { currentAllowance = await erc20.allowance(owner, spender) } catch { /* assume 0 */ }

    if (currentAllowance < BigInt(fromAmount)) {
      onApprovalSent?.()
      const approveTx = await erc20.approve(spender, fromAmount)
      await approveTx.wait()
      onApprovalDone?.()
    } else {
      onApprovalDone?.()
    }
  } else {
    onApprovalDone?.()
  }

  // Send the transaction
  const tx = await signer.sendTransaction(quote.transactionRequest)
  onDepositSent?.(tx.hash)

  const receipt = await tx.wait()
  console.log('[executeDeposit] Confirmed:', receipt.blockNumber)

  if (isCrossChain) {
    onCrossChainPending?.(tx.hash)
    pollCrossChainStatus(tx.hash, walletChainId, destChainId, apiKey).catch(err => {
      console.warn('[executeDeposit] Poll error:', err)
    })
  }

  return { txHash: tx.hash, receipt, isCrossChain, quote }
}

/**
 * Poll /v1/status for cross-chain transfers.
 */
export async function pollCrossChainStatus(txHash, fromChain, toChain, apiKey, maxAttempts = 60) {
  const reqHeaders = {}
  if (apiKey) reqHeaders['x-lifi-api-key'] = apiKey
  const base = getLifiBase()

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 5000))
    try {
      const params = new URLSearchParams({ txHash, fromChain: String(fromChain), toChain: String(toChain) })
      const res = await fetch(`${base}/v1/status?${params}`, { headers: reqHeaders })
      if (!res.ok) continue
      const data = await res.json()
      console.log(`[pollStatus] ${data.status} (${data.substatus ?? ''})`)
      if (data.status === 'DONE' || data.status === 'FAILED') return data
    } catch { /* keep polling */ }
  }
  return null
}