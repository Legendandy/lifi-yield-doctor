// src/services/executeDeposit.js
//
// CRITICAL FIX: Composer only triggers when toToken === a supported vault address.
// When the vault is NOT Composer-supported cross-chain, the API silently returns
// a plain bridge/swap route (toToken = USDC on dest chain, NOT the vault share).
// We validate the returned toToken before executing to prevent fund loss.
//
// PARTIAL substatus = bridge succeeded but vault deposit failed on destination.
// User ends up with raw tokens on dest chain, not vault shares. We detect this.

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

export function toRawAmount(humanAmount, decimals) {
  if (!humanAmount || isNaN(parseFloat(humanAmount))) return '0'
  const str = String(humanAmount).trim()
  const dotIdx = str.indexOf('.')
  if (dotIdx === -1) {
    return (BigInt(str) * BigInt(10 ** decimals)).toString()
  }
  const whole = str.slice(0, dotIdx) || '0'
  const frac = str.slice(dotIdx + 1).padEnd(decimals, '0').slice(0, decimals)
  return (BigInt(whole) * BigInt(10 ** decimals) + BigInt(frac)).toString()
}

/**
 * Check that the quote's final toToken matches the vault address.
 * If not, Composer did NOT trigger — the API fell back to a plain bridge/swap.
 * Executing such a quote would send tokens to the destination chain without
 * depositing them into the vault.
 */
export function validateComposerQuote(quote, vaultAddress) {
  const returnedTo = quote?.action?.toToken?.address?.toLowerCase()
  const expected   = vaultAddress?.toLowerCase()
  if (!returnedTo || !expected) return { valid: false, returnedSymbol: '?' }
  if (returnedTo === expected)  return { valid: true }
  return {
    valid: false,
    returnedSymbol:  quote?.action?.toToken?.symbol ?? returnedTo.slice(0, 8),
    returnedAddress: returnedTo,
  }
}

export async function getComposerQuote({
  fromChain, toChain, fromToken, toToken, fromAddress, fromAmount, apiKey, slippage = 0.005,
}) {
  let rawAmount
  try {
    rawAmount = BigInt(fromAmount).toString()
    if (rawAmount === '0') throw new Error('zero')
  } catch {
    throw new Error(`Invalid amount: "${fromAmount}"`)
  }

  const params = new URLSearchParams({
    fromChain: String(fromChain),
    toChain:   String(toChain),
    fromToken, toToken, fromAddress,
    toAddress:  fromAddress,
    fromAmount: rawAmount,
    slippage:   String(slippage),
    integrator: 'yield-doctor',
  })

  const reqHeaders = { 'Content-Type': 'application/json' }
  if (apiKey) reqHeaders['x-lifi-api-key'] = apiKey

  const base = getLifiBase()
  console.log('[Composer] Quote:', { fromChain, toChain, slippage, rawAmount })

  const res = await fetch(`${base}/v1/quote?${params}`, { headers: reqHeaders })
  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText)
    console.error('[Composer] Quote error:', res.status, errText.slice(0, 200))
    if (res.status === 404 || errText.toLowerCase().includes('no routes')) {
      throw new Error(
        'NO_ROUTES: No Composer route found for this vault cross-chain. ' +
        'Try depositing from the same chain as the vault.'
      )
    }
    throw new Error(`Composer quote failed (${res.status}): ${errText.slice(0, 200)}`)
  }

  const quote = await res.json()
  console.log('[Composer] Response toToken:', quote.action?.toToken?.symbol, quote.action?.toToken?.address?.slice(0, 10))

  if (!quote.transactionRequest) {
    throw new Error('No transaction data returned. This vault may not support Composer deposits.')
  }
  return quote
}

export async function executeDeposit({
  vault, fromToken, fromAmount, userAddress, fromChainId, slippage = 0.005,
  onApprovalSent, onApprovalDone, onDepositSent, onCrossChainPending,
}) {
  if (!window.ethereum) throw new Error('No wallet detected.')

  const provider      = new ethers.BrowserProvider(window.ethereum)
  const signer        = await provider.getSigner()
  const network       = await provider.getNetwork()
  const walletChainId = Number(network.chainId)
  const sourceChainId = fromChainId ?? walletChainId
  const destChainId   = vault.chainId
  const isCrossChain  = sourceChainId !== destChainId

  if (walletChainId !== sourceChainId) {
    throw new Error(`Wallet is on chain ${walletChainId} but deposit is from chain ${sourceChainId}.`)
  }

  const apiKey = import.meta.env.VITE_LIFI_API_KEY

  const quote = await getComposerQuote({
    fromChain: walletChainId, toChain: destChainId,
    fromToken: fromToken.address,
    toToken:   vault.address,  // vault share token triggers Composer
    fromAddress: userAddress,
    fromAmount: String(fromAmount),
    apiKey, slippage,
  })

  // ── CRITICAL SAFETY CHECK ──────────────────────────────────────────────────
  // If the returned toToken != vault.address, Composer did NOT trigger.
  // The route is a plain bridge/swap — executing would give the user raw tokens
  // on the destination chain instead of vault shares. Block it.
  const validation = validateComposerQuote(quote, vault.address)
  if (!validation.valid) {
    throw new Error(
      `COMPOSER_NOT_TRIGGERED:${validation.returnedSymbol}`
    )
  }

  // ── Approval ───────────────────────────────────────────────────────────────
  const native = isNativeToken(fromToken.address)
  if (!native && quote.estimate?.approvalAddress) {
    const erc20   = new ethers.Contract(fromToken.address, ERC20_ABI, signer)
    const owner   = await signer.getAddress()
    const spender = quote.estimate.approvalAddress
    let cur = 0n
    try { cur = await erc20.allowance(owner, spender) } catch { /* assume 0 */ }
    if (cur < BigInt(fromAmount)) {
      onApprovalSent?.()
      const approveTx = await erc20.approve(spender, fromAmount)
      await approveTx.wait()
      onApprovalDone?.()
    } else { onApprovalDone?.() }
  } else { onApprovalDone?.() }

  // ── Execute ────────────────────────────────────────────────────────────────
  const tx = await signer.sendTransaction(quote.transactionRequest)
  onDepositSent?.(tx.hash)
  const receipt = await tx.wait()
  console.log('[executeDeposit] Confirmed block:', receipt.blockNumber)

  if (isCrossChain) onCrossChainPending?.(tx.hash)

  return { txHash: tx.hash, receipt, isCrossChain, quote }
}

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
      if (data.status === 'DONE' || data.status === 'FAILED') return data
    } catch { /* keep polling */ }
  }
  return null
}