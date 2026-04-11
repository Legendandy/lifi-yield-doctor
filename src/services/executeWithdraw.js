// src/services/executeWithdraw.js
//
// WITHDRAWAL: fromToken = vault LP/share token, toToken = what user wants to receive
//
// How to get the LP token address:
//   The ONLY reliable source is vault.lpTokens[0].address from GET /v1/earn/vaults/:chainId/:address
//   vault.address is NOT always the LP token — for some protocols it IS the underlying token address
//   position.asset.address is sometimes the LP token (Morpho mUSDC) and sometimes the underlying (Aave USDC)
//
// Resolution order:
//   1. vault.lpTokens[0].address  — always the LP share token per vault API schema
//   2. position.asset.address     — only if its address/symbol does NOT match any underlyingToken
//   3. throw — never silently fall through to vault.address

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
 * Resolve the vault LP/share token address to use as fromToken.
 *
 * Priority:
 *   1. vault.lpTokens[0].address — explicit LP token from vault API (always correct)
 *   2. position.asset.address    — only if NOT an underlying token address/symbol
 *
 * vault.address is deliberately excluded — for many protocols it equals the underlying
 * token address (e.g. WBTC), not the LP share token.
 */
export function resolveWithdrawFromToken(vault, position) {
  // 1. Best source: vault.lpTokens from the vault API
  if (vault?.lpTokens?.length > 0 && vault.lpTokens[0]?.address) {
    console.log('[resolveWithdrawFromToken] vault.lpTokens[0].address:', vault.lpTokens[0].address)
    return vault.lpTokens[0].address
  }

  // 2. position.asset.address — safe only if it's NOT an underlying token
  if (position?.asset?.address) {
    const assetAddr   = position.asset.address.toLowerCase()
    const assetSymbol = (position.asset.symbol ?? '').toUpperCase()

    const underlyingAddrs   = (vault?.underlyingTokens ?? []).map(t => (t.address ?? '').toLowerCase()).filter(Boolean)
    const underlyingSymbols = (vault?.underlyingTokens ?? []).map(t => (t.symbol ?? '').toUpperCase()).filter(Boolean)

    const isUnderlying = underlyingAddrs.includes(assetAddr) || underlyingSymbols.includes(assetSymbol)

    if (!isUnderlying) {
      console.log('[resolveWithdrawFromToken] position.asset.address (not underlying):', position.asset.address)
      return position.asset.address
    }

    console.warn('[resolveWithdrawFromToken] position.asset is an underlying token, skipping.', {
      assetSymbol, assetAddr, underlyingSymbols, underlyingAddrs,
    })
  }

  console.error('[resolveWithdrawFromToken] FAILED. vault data:', {
    'vault.address':          vault?.address,
    'vault.lpTokens':         vault?.lpTokens,
    'vault.underlyingTokens': vault?.underlyingTokens?.map(t => `${t.symbol}@${t.address}`),
    'position.asset':         position?.asset,
  })

  throw new Error(
    `Cannot find LP token for "${vault?.name ?? 'vault'}". ` +
    `vault.lpTokens is empty and position.asset is an underlying token. ` +
    `The vault object must include lpTokens from GET /v1/earn/vaults/:chainId/:address.`
  )
}

export function resolveWithdrawFromDecimals(vault, position) {
  if (vault?.lpTokens?.[0]?.decimals != null) return vault.lpTokens[0].decimals
  if (position?.asset?.decimals != null) return position.asset.decimals
  return 18
}

export function resolveWithdrawFromSymbol(vault, position) {
  if (vault?.lpTokens?.[0]?.symbol) return vault.lpTokens[0].symbol
  if (position?.asset?.symbol) return position.asset.symbol
  return 'shares'
}

/**
 * Fetch a Composer withdrawal quote.
 * fromToken = LP share token (resolveWithdrawFromToken result)
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
      `fromToken and toToken are the same address (${fromTokenAddress.slice(0, 10)}...). ` +
      `vault.lpTokens is likely missing — check the console for resolveWithdrawFromToken output.`
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

  console.log('[getWithdrawQuote]', {
    fromChain: vaultChainId, toChain: destChainId,
    fromToken: fromTokenAddress, toToken: toTokenAddress, fromAmount,
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
      console.log('[executeWithdraw] On-chain LP balance:', withdrawRaw)
    } catch (e) {
      console.warn('[executeWithdraw] Could not read on-chain balance, using rawAmount:', e.message)
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
  console.log('[executeWithdraw] Confirmed:', receipt.blockNumber)

  return { txHash: tx.hash, receipt, isCrossChain, quote }
}