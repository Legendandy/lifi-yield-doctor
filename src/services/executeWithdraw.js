// src/services/executeWithdraw.js
// Withdrawal flow using LI.FI Composer in reverse:
// The user's vault shares (LP tokens) are the fromToken; the underlying token is the toToken.
// GET /v1/quote with vault LP token as fromToken → approve → send

import { ethers } from 'ethers'

const ERC20_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address owner) view returns (uint256)',
]

/**
 * Execute a vault withdrawal via LI.FI Composer.
 *
 * For withdrawals, we swap the vault LP token back to the underlying token.
 * fromToken = vault LP token (vault.address)
 * toToken   = underlying token (vault.underlyingTokens[0].address)
 *
 * @param {object} opts
 * @param {object} opts.vault - vault object
 * @param {string} opts.userAddress - user wallet address
 * @param {string} opts.amount - raw amount of vault shares to withdraw
 * @param {boolean} opts.isFullWithdraw - if true, withdraw entire balance
 * @param {function} [opts.onTxSent] - called with txHash when tx is sent
 */
export async function executeWithdraw({
  vault,
  userAddress,
  amount,
  isFullWithdraw,
  onTxSent,
}) {
  if (!window.ethereum) {
    throw new Error('No wallet detected. Please install MetaMask or another Web3 wallet.')
  }

  const provider = new ethers.BrowserProvider(window.ethereum)
  const signer = await provider.getSigner()

  // Validate chain
  const network = await provider.getNetwork()
  const walletChainId = Number(network.chainId)
  if (walletChainId !== vault.chainId) {
    throw new Error(
      `Wallet is on chain ${walletChainId} but vault is on chain ${vault.chainId}. Please switch networks first.`
    )
  }

  // If full withdraw, get actual on-chain balance
  let withdrawAmount = amount
  if (isFullWithdraw) {
    try {
      const vaultToken = new ethers.Contract(vault.address, ERC20_ABI, provider)
      const bal = await vaultToken.balanceOf(userAddress)
      withdrawAmount = bal.toString()
      if (withdrawAmount === '0') {
        throw new Error('No vault shares found in your wallet. Your position may already be withdrawn.')
      }
    } catch (err) {
      if (err.message.includes('No vault shares')) throw err
      // If contract call fails, fall back to provided amount
      withdrawAmount = amount
    }
  }

  const underlyingToken = vault.underlyingTokens?.[0]
  if (!underlyingToken) {
    throw new Error('No underlying token found for this vault.')
  }

  // Build quote: vault LP → underlying token
  const quoteParams = new URLSearchParams({
    fromChain: String(vault.chainId),
    toChain: String(vault.chainId),
    fromToken: vault.address, // vault LP/share token
    toToken: underlyingToken.address,
    fromAddress: userAddress,
    toAddress: userAddress,
    fromAmount: withdrawAmount,
    slippage: '0.005',
  })

  const apiKey = import.meta.env.VITE_LIFI_API_KEY
  const headers = { 'Content-Type': 'application/json' }
  if (apiKey) headers['x-lifi-api-key'] = apiKey

  const quoteRes = await fetch(`https://li.quest/v1/quote?${quoteParams}`, { headers })

  if (!quoteRes.ok) {
    const errText = await quoteRes.text().catch(() => quoteRes.statusText)
    if (quoteRes.status === 404 || errText.includes('No routes')) {
      throw new Error('No withdrawal route found. You may need to withdraw directly on the protocol\'s website.')
    }
    throw new Error(`Quote failed (${quoteRes.status}): ${errText.slice(0, 200)}`)
  }

  const quote = await quoteRes.json()

  if (!quote.transactionRequest) {
    throw new Error('No transaction data returned. Please try again.')
  }

  // Approve vault shares if needed
  if (quote.estimate?.approvalAddress) {
    const erc20 = new ethers.Contract(vault.address, ERC20_ABI, signer)
    const owner = await signer.getAddress()
    const spender = quote.estimate.approvalAddress

    let currentAllowance
    try {
      currentAllowance = await erc20.allowance(owner, spender)
    } catch {
      currentAllowance = 0n
    }

    if (currentAllowance < BigInt(withdrawAmount)) {
      const approveTx = await erc20.approve(spender, withdrawAmount)
      await approveTx.wait()
    }
  }

  // Send withdrawal transaction
  const tx = await signer.sendTransaction(quote.transactionRequest)
  onTxSent?.(tx.hash)

  const receipt = await tx.wait()
  console.log('[executeWithdraw] Confirmed in block:', receipt.blockNumber)

  return { txHash: tx.hash, receipt }
}