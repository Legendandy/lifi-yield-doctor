// src/services/executeWithdraw.js
//
// WITHDRAWAL: fromToken = vault LP/share token, toToken = what user wants to receive
//
// For ERC-4626 vaults (Morpho, Euler, Yearn, etc.), the vault contract address IS
// the share token. When you deposit, the vault mints share tokens to you from its
// own contract address. So vault.address === LP share token address.
//
// Resolution order:
//   1. vault.lpTokens[0].address  — explicit LP share token from vault API
//   2. vault.address              — for ERC-4626 vaults, this IS the share token
//   3. position.asset.address     — only if it's NOT an underlying token
//   4. throw

import { ethers } from 'ethers'

const ERC20_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address owner) view returns (uint256)',
]

function getLifiBase() {
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') return '/lifi-api'
  return 'https://li.quest'
}

function getLifiHeaders() {
  const h = { 'Content-Type': 'application/json' }
  const key = import.meta.env.VITE_LIFI_API_KEY
  if (key) h['x-lifi-api-key'] = key
  return h
}

/**
 * Resolve the vault LP/share token address to use as fromToken for withdrawal.
 *
 * For ERC-4626 vaults, depositing mints share tokens from the vault contract itself.
 * So vault.address IS the share token you received. This is the standard for
 * Morpho, Euler, Yearn, Beefy, and most modern DeFi vaults.
 *
 * Priority:
 *   1. vault.lpTokens[0].address  — explicit from vault API (most accurate)
 *   2. vault.address              — ERC-4626 share token (the vault IS the token)
 *   3. position.asset.address     — only if NOT an underlying token
 */
export function resolveWithdrawFromToken(vault, position) {
  // 1. Best source: vault.lpTokens from the vault API
  if (vault?.lpTokens?.length > 0 && vault.lpTokens[0]?.address) {
    return vault.lpTokens[0].address
  }

  // 2. vault.address — for ERC-4626 vaults, this IS the share token contract.
  //    When you deposit into a vault, it mints share tokens TO YOU from this address.
  //    This is the correct fromToken for withdrawals on Morpho, Euler, Yearn, etc.
  if (vault?.address) {
    return vault.address
  }

  // 3. position.asset.address — only if it's NOT an underlying token
  if (position?.asset?.address) {
    const assetAddr   = position.asset.address.toLowerCase()
    const assetSymbol = (position.asset.symbol ?? '').toUpperCase()

    const underlyingAddrs   = (vault?.underlyingTokens ?? []).map(t => (t.address ?? '').toLowerCase()).filter(Boolean)
    const underlyingSymbols = (vault?.underlyingTokens ?? []).map(t => (t.symbol ?? '').toUpperCase()).filter(Boolean)

    const isUnderlying = underlyingAddrs.includes(assetAddr) || underlyingSymbols.includes(assetSymbol)

    if (!isUnderlying) {
      return position.asset.address
    }
  }

  throw new Error(
    `Cannot find the vault share token for "${vault?.name ?? 'this vault'}". ` +
    `vault.address is missing, vault.lpTokens is empty, and position.asset is an underlying token.`
  )
}

export function resolveWithdrawFromDecimals(vault, position) {
  if (vault?.lpTokens?.[0]?.decimals != null) return vault.lpTokens[0].decimals
  if (position?.asset?.decimals != null) return position.asset.decimals
  return 18
}

export function resolveWithdrawFromSymbol(vault, position) {
  if (vault?.lpTokens?.[0]?.symbol) return vault.lpTokens[0].symbol
  if (vault?.name) return vault.name
  if (position?.asset?.symbol) return position.asset.symbol
  return 'shares'
}

/**
 * Fetch a Composer withdrawal quote.
 * fromToken = vault share token (resolveWithdrawFromToken result)
 * toToken   = destination token the user wants
 */
export async function getWithdrawQuote({
  vaultChainId,
  destChainId,
  fromTokenAddress,
  toTokenAddress,
  userAddress,
  fromAmount,
  slippage = 0.005,
}) {
  if (!fromTokenAddress) throw new Error('fromTokenAddress is required.')
  if (!toTokenAddress)   throw new Error('toTokenAddress is required.')
  if (!fromAmount || fromAmount === '0') throw new Error('Withdrawal amount is zero.')

  if (
    vaultChainId === destChainId &&
    fromTokenAddress.toLowerCase() === toTokenAddress.toLowerCase()
  ) {
    throw new Error(
      'The source and destination tokens are the same. Please select a different token to receive.'
    )
  }

  const params = new URLSearchParams({
    fromChain:   String(vaultChainId),
    toChain:     String(destChainId),
    fromToken:   fromTokenAddress,
    toToken:     toTokenAddress,
    fromAddress: userAddress,
    toAddress:   userAddress,
    fromAmount:  String(fromAmount),
    slippage:    String(slippage),
    integrator:  'yield-doctor',
  })

  const res = await fetch(`${getLifiBase()}/v1/quote?${params}`, { headers: getLifiHeaders() })

  if (!res.ok) {
    const txt = await res.text().catch(() => res.statusText)
    let msg = `Quote failed (${res.status}).`
    try { const p = JSON.parse(txt); if (p.message) msg = p.message } catch {}
    if (res.status === 404 || txt.toLowerCase().includes('no routes')) {
      msg = 'No withdrawal route found. Try a different destination token.'
    }
    throw new Error(msg)
  }

  const quote = await res.json()
  if (!quote.transactionRequest) {
    throw new Error('No transaction data from Composer. This vault may not support withdrawals via this route.')
  }
  return quote
}

/**
 * Execute a vault withdrawal via LI.FI Composer.
 */
export async function executeWithdraw({
  vault,
  position,
  rawAmount,
  withdrawAll = false,
  destTokenAddress,
  destChainId,
  userAddress,
  slippage = 0.005,
  onApprovalSent,
  onApprovalDone,
  onTxSent,
}) {
  if (!window.ethereum) throw new Error('No wallet detected.')

  const provider     = new ethers.BrowserProvider(window.ethereum)
  const signer       = await provider.getSigner()
  const vaultChainId = vault.chainId
  const isCrossChain = destChainId !== vaultChainId

  const fromTokenAddress = resolveWithdrawFromToken(vault, position)

  let withdrawRaw = rawAmount
  if (withdrawAll) {
    try {
      const contract   = new ethers.Contract(fromTokenAddress, ERC20_ABI, provider)
      const onChainBal = await contract.balanceOf(userAddress)
      withdrawRaw      = onChainBal.toString()
    } catch {
      // fall back to rawAmount passed in
    }
  }

  if (!withdrawRaw || withdrawRaw === '0') {
    throw new Error('Withdrawal amount is zero. No vault shares found.')
  }

  const quote = await getWithdrawQuote({
    vaultChainId, destChainId,
    fromTokenAddress,
    toTokenAddress: destTokenAddress,
    userAddress, fromAmount: withdrawRaw, slippage,
  })

  if (quote.estimate?.approvalAddress) {
    const erc20   = new ethers.Contract(fromTokenAddress, ERC20_ABI, signer)
    const owner   = await signer.getAddress()
    const spender = quote.estimate.approvalAddress
    let cur = 0n
    try { cur = await erc20.allowance(owner, spender) } catch {}
    if (cur < BigInt(withdrawRaw)) {
      onApprovalSent?.()
      const tx = await erc20.approve(spender, withdrawRaw)
      await tx.wait()
    }
  }
  onApprovalDone?.()

  const tx = await signer.sendTransaction(quote.transactionRequest)
  onTxSent?.(tx.hash)

  const receipt = await tx.wait()

  return { txHash: tx.hash, receipt, isCrossChain, quote }
}