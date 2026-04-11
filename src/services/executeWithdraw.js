// src/services/executeDeposit.js
// Full Composer integration — deposit from ANY token on ANY chain into ANY vault
// Key fix: toToken = vault.address (the vault share/LP token)
// For cross-chain this requires Composer to bridge+swap+deposit atomically

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

function getLifiBase() {
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    return '/lifi-api'
  }
  return 'https://li.quest'
}

/**
 * Get a LI.FI Composer quote for depositing into a vault.
 *
 * CRITICAL: toToken = vault.address (the vault's share/LP token address).
 * This is what tells Composer to deposit into the vault rather than just swap/bridge.
 * The vault address must be a token from a Composer-supported protocol.
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
    integrator: 'yield-doctor',
  })

  const headers = { 'Content-Type': 'application/json' }
  if (apiKey) headers['x-lifi-api-key'] = apiKey

  const base = getLifiBase()
  const res = await fetch(`${base}/v1/quote?${params}`, { headers })

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText)
    if (res.status === 404 || errText.toLowerCase().includes('no routes')) {
      throw new Error(
        'No deposit route found. This vault may not be supported by Composer, or try a different source token.'
      )
    }
    if (res.status === 422) {
      throw new Error(`Deposit not supported for this vault/token combination: ${errText.slice(0, 200)}`)
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
 * For same-chain: fromToken → vault (swap + deposit in one tx)
 * For cross-chain: fromToken on fromChain → vault on toChain (bridge + swap + deposit in one tx)
 *
 * The wallet MUST be on fromChainId when sending the transaction.
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

  const network = await provider.getNetwork()
  const walletChainId = Number(network.chainId)

  const sourceChainId = fromChainId ?? walletChainId
  const destChainId = vault.chainId
  const isCrossChain = sourceChainId !== destChainId

  // Ensure wallet is on the correct source chain
  if (walletChainId !== sourceChainId) {
    throw new Error(
      `Wallet is on chain ${walletChainId} but deposit requires chain ${sourceChainId}. Please switch networks.`
    )
  }

  const apiKey = import.meta.env.VITE_LIFI_API_KEY

  // Validate fromAmount is a valid integer string
  let rawAmount
  try {
    rawAmount = BigInt(fromAmount).toString()
    if (rawAmount === '0') throw new Error('Amount is zero')
  } catch {
    throw new Error(`Invalid deposit amount: ${fromAmount}`)
  }

  // Get Composer quote
  // toToken = vault.address — this is the key: vault share token triggers Composer deposit action
  const quote = await getComposerQuote({
    fromChain: walletChainId,
    toChain: destChainId,
    fromToken: fromToken.address,
    toToken: vault.address,
    fromAddress: userAddress,
    fromAmount: rawAmount,
    apiKey,
  })

  // Handle ERC-20 approval using quote.estimate.approvalAddress
  const native = isNativeToken(fromToken.address)

  if (!native && quote.estimate?.approvalAddress) {
    const erc20 = new ethers.Contract(fromToken.address, ERC20_ABI, signer)
    const owner = await signer.getAddress()
    const spender = quote.estimate.approvalAddress

    let currentAllowance = 0n
    try {
      currentAllowance = await erc20.allowance(owner, spender)
    } catch {
      currentAllowance = 0n
    }

    const needed = BigInt(rawAmount)
    if (currentAllowance < needed) {
      onApprovalSent?.()
      const approveTx = await erc20.approve(spender, rawAmount)
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
  console.log('[executeDeposit] Confirmed in block:', receipt.blockNumber)

  if (isCrossChain) {
    onCrossChainPending?.(tx.hash)
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
 */
export async function pollCrossChainStatus(txHash, fromChain, toChain, apiKey, maxAttempts = 60) {
  const headers = {}
  if (apiKey) headers['x-lifi-api-key'] = apiKey

  const base = getLifiBase()

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 5000))
    try {
      const params = new URLSearchParams({
        txHash,
        fromChain: String(fromChain),
        toChain: String(toChain),
      })
      const res = await fetch(`${base}/v1/status?${params}`, { headers })
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