// src/components/WithdrawModal.jsx
// Withdrawal via LI.FI Composer
// - Default: withdraw to same underlying token on vault's chain
// - Option: receive any token on any of the 17 supported chains
// - Picking a chain also switches the wallet

import { useState, useEffect, useRef } from 'react'
import { useAccount, useSwitchChain } from 'wagmi'
import { useToast } from './ToastNotifications'
import { SUPPORTED_CHAINS, CHAIN_TOKENS, NATIVE_ADDRESS } from '../services/tokenBalances'
import { ethers } from 'ethers'

const CHAIN_NAMES = Object.fromEntries(SUPPORTED_CHAINS.map(c => [c.id, c.name]))

function getChainName(chainId) {
  return CHAIN_NAMES[chainId] ?? `Chain ${chainId}`
}

function getTokenSymbol(vault) {
  return vault?.underlyingTokens?.[0]?.symbol ?? 'tokens'
}

function getTokenDecimals(vault) {
  return vault?.underlyingTokens?.[0]?.decimals ?? 18
}

const ERC20_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address owner) view returns (uint256)',
]

async function executeWithdrawViaComposer({ vault, userAddress, withdrawAmount, destChainId, destToken, onTxSent }) {
  if (!window.ethereum) throw new Error('No wallet detected.')

  const provider = new ethers.BrowserProvider(window.ethereum)
  const signer = await provider.getSigner()

  const network = await provider.getNetwork()
  const walletChainId = Number(network.chainId)
  if (walletChainId !== vault.chainId) {
    throw new Error(`Please switch your wallet to ${getChainName(vault.chainId)} first.`)
  }

  const apiKey = import.meta.env.VITE_LIFI_API_KEY
  const headers = { 'Content-Type': 'application/json' }
  if (apiKey) headers['x-lifi-api-key'] = apiKey

  const quoteParams = new URLSearchParams({
    fromChain:   String(vault.chainId),
    toChain:     String(destChainId),
    fromToken:   vault.address,
    toToken:     destToken.address,
    fromAddress: userAddress,
    toAddress:   userAddress,
    fromAmount:  withdrawAmount,
    slippage:    '0.005',
  })

  const quoteRes = await fetch(`https://li.quest/v1/quote?${quoteParams}`, { headers })

  if (!quoteRes.ok) {
    const errText = await quoteRes.text().catch(() => quoteRes.statusText)
    if (quoteRes.status === 404 || errText.includes('No routes')) {
      throw new Error('No withdrawal route found. Try withdrawing to the underlying asset on the same chain first.')
    }
    throw new Error(`Quote failed (${quoteRes.status}): ${errText.slice(0, 200)}`)
  }

  const quote = await quoteRes.json()
  if (!quote.transactionRequest) throw new Error('No transaction data returned. Please try again.')

  // Approve vault shares if needed
  if (quote.estimate?.approvalAddress) {
    const erc20 = new ethers.Contract(vault.address, ERC20_ABI, signer)
    const owner = await signer.getAddress()
    const spender = quote.estimate.approvalAddress
    let currentAllowance = 0n
    try { currentAllowance = await erc20.allowance(owner, spender) } catch { /**/ }
    if (currentAllowance < BigInt(withdrawAmount)) {
      const approveTx = await erc20.approve(spender, withdrawAmount)
      await approveTx.wait()
    }
  }

  const tx = await signer.sendTransaction(quote.transactionRequest)
  onTxSent?.(tx.hash)
  const receipt = await tx.wait()
  return { txHash: tx.hash, receipt }
}

// ─── Chain picker dropdown ────────────────────────────────────────────────────
function ChainPicker({ value, onChange, label }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function h(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 rounded-xl border-2 border-surface-container-high bg-surface-container-low hover:border-on-tertiary-container/40 transition-all text-left"
      >
        <div>
          <p className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant">{label}</p>
          <p className="font-bold text-sm text-on-surface mt-0.5">{getChainName(value)}</p>
        </div>
        <span className="material-symbols-outlined text-[16px] text-on-surface-variant shrink-0">expand_more</span>
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-2xl shadow-2xl border border-surface-container z-50 overflow-hidden">
          <div className="py-1 max-h-52 overflow-y-auto">
            {SUPPORTED_CHAINS.map(chain => (
              <button
                key={chain.id}
                type="button"
                onClick={() => { onChange(chain.id); setOpen(false) }}
                className={`w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-surface-container-low transition-colors
                  ${chain.id === value ? 'bg-surface-container' : ''}`}
              >
                <span className={`text-sm font-bold ${chain.id === value ? 'text-on-tertiary-container' : 'text-on-surface'}`}>
                  {chain.name}
                </span>
                {chain.id === value && (
                  <span className="material-symbols-outlined text-on-tertiary-container text-[14px]">check_circle</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Token picker for destination ─────────────────────────────────────────────
function DestTokenPicker({ chainId, value, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const tokens = CHAIN_TOKENS[chainId] ?? []

  useEffect(() => {
    function h(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  if (tokens.length === 0) return null

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 rounded-xl border-2 border-surface-container-high bg-surface-container-low hover:border-on-tertiary-container/40 transition-all text-left"
      >
        <div>
          <p className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant">Receive as</p>
          <p className="font-bold text-sm text-on-surface mt-0.5">{value?.symbol ?? 'Select token'}</p>
        </div>
        <span className="material-symbols-outlined text-[16px] text-on-surface-variant shrink-0">expand_more</span>
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-2xl shadow-2xl border border-surface-container z-50 overflow-hidden">
          <div className="py-1 max-h-48 overflow-y-auto">
            {tokens.map((token, i) => (
              <button
                key={token.address + i}
                type="button"
                onClick={() => { onChange(token); setOpen(false) }}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-surface-container-low transition-colors
                  ${value?.address?.toLowerCase() === token.address.toLowerCase() ? 'bg-surface-container' : ''}`}
              >
                <div className="w-7 h-7 rounded-full bg-surface-container flex items-center justify-center text-xs font-black text-on-surface-variant shrink-0">
                  {token.symbol[0]}
                </div>
                <div>
                  <p className="font-bold text-sm text-on-surface">{token.symbol}</p>
                  <p className="text-[10px] text-on-surface-variant">{token.name}</p>
                </div>
                {value?.address?.toLowerCase() === token.address.toLowerCase() && (
                  <span className="material-symbols-outlined text-on-tertiary-container text-[14px] ml-auto">check_circle</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function StepIndicator({ label, status }) {
  return (
    <div className={`flex items-center gap-3 p-2.5 rounded-xl transition-all ${
      status === 'active' ? 'bg-primary-container/5 border border-primary-container/20' :
      status === 'done' ? 'opacity-50' : 'opacity-30'
    }`}>
      {status === 'active'
        ? <span className="material-symbols-outlined text-primary-container text-[16px] animate-spin">progress_activity</span>
        : status === 'done'
          ? <span className="material-symbols-outlined text-on-tertiary-container text-[16px]">check_circle</span>
          : <span className="material-symbols-outlined text-on-surface-variant text-[16px]">radio_button_unchecked</span>
      }
      <p className={`text-sm font-bold ${status === 'active' ? 'text-on-surface' : 'text-on-surface-variant'}`}>{label}</p>
    </div>
  )
}

// ─── Main Modal ────────────────────────────────────────────────────────────────
export default function WithdrawModal({ vault, position, onClose, onSuccess }) {
  const { address, chainId: walletChainId } = useAccount()
  const { switchChainAsync } = useSwitchChain()
  const toast = useToast()

  const vaultChainId = vault?.chainId ?? position?.chainId
  const underlyingToken = vault?.underlyingTokens?.[0] ?? null
  const underlyingSymbol = getTokenSymbol(vault)
  const underlyingDecimals = getTokenDecimals(vault)

  // Position info
  const positionBalanceUsd = position?.balanceUsd ?? vault?._positionBalanceUsd ?? 0
  const positionBalance = position?.balance ?? vault?._positionBalance ?? null
  const maxBalance = positionBalance ? parseFloat(positionBalance) : 0
  const hasZeroBalance = maxBalance === 0 && (!positionBalanceUsd || positionBalanceUsd <= 0)

  // Destination — default: same chain, underlying token
  const [destMode, setDestMode] = useState('same') // 'same' | 'custom'
  const [destChainId, setDestChainId] = useState(vaultChainId)
  const [destToken, setDestToken] = useState(underlyingToken)

  // Form state
  const [amount, setAmount] = useState('')
  const [withdrawType, setWithdrawType] = useState('partial')
  const [txStep, setTxStep] = useState('idle')
  const [error, setError] = useState(null)
  const inputRef = useRef(null)

  useEffect(() => {
    setDestChainId(vaultChainId)
    setDestToken(underlyingToken)
  }, [vault])

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 100) }, [])

  const amountNum = parseFloat(amount) || 0
  const hasInsufficientBalance = maxBalance > 0 && amountNum > 0 && amountNum > maxBalance
  const isValidPartial = withdrawType === 'partial' && amountNum > 0 && !hasInsufficientBalance && amount.trim() !== '' && maxBalance > 0
  const isValidFull = withdrawType === 'full' && !hasZeroBalance
  const isValid = isValidPartial || isValidFull
  const isBusy = ['switching', 'withdrawing'].includes(txStep)

  const needsChainSwitch = walletChainId !== vaultChainId
  const isCrossChainWithdraw = destChainId !== vaultChainId

  const apy = vault?.analytics?.apy?.total
  const apyDisplay = apy != null ? `${(apy * 100).toFixed(2)}%` : 'N/A'

  function toRawAmount(humanAmount, decimals) {
    if (!humanAmount || isNaN(parseFloat(humanAmount))) return '0'
    const [whole, frac = ''] = String(humanAmount).split('.')
    const fracPadded = frac.padEnd(decimals, '0').slice(0, decimals)
    return (BigInt(whole || '0') * BigInt(10 ** decimals) + BigInt(fracPadded || '0')).toString()
  }

  function setMax() { if (maxBalance > 0) setAmount(maxBalance.toFixed(6)) }
  function setHalf() { if (maxBalance > 0) setAmount((maxBalance / 2).toFixed(6)) }

  function handleDestModeChange(mode) {
    setDestMode(mode)
    if (mode === 'same') {
      setDestChainId(vaultChainId)
      setDestToken(underlyingToken)
    } else {
      // Start with same chain but allow change
      setDestChainId(vaultChainId)
      const tokens = CHAIN_TOKENS[vaultChainId] ?? []
      // Try to match underlying token symbol
      const match = tokens.find(t => t.symbol?.toUpperCase() === underlyingToken?.symbol?.toUpperCase())
      setDestToken(match ?? tokens[0] ?? underlyingToken)
    }
  }

  async function handleDestChainChange(newChainId) {
    setDestChainId(newChainId)
    const tokens = CHAIN_TOKENS[newChainId] ?? []
    // Try to match same symbol, otherwise first token
    const match = tokens.find(t => t.symbol?.toUpperCase() === destToken?.symbol?.toUpperCase())
    setDestToken(match ?? tokens[0] ?? null)
  }

  async function handleWithdraw() {
    if (!isValid || !destToken) return
    setError(null)

    try {
      // Switch wallet to vault's chain first
      if (needsChainSwitch) {
        setTxStep('switching')
        try {
          await switchChainAsync({ chainId: vaultChainId })
        } catch (switchErr) {
          setTxStep('idle')
          const rejected = switchErr?.message?.toLowerCase().includes('rejected')
          setError(rejected ? 'Please approve the network switch.' : `Could not switch to ${getChainName(vaultChainId)}.`)
          toast.error('Network Switch Failed', rejected ? 'You rejected the switch.' : `Failed to switch to ${getChainName(vaultChainId)}.`)
          return
        }
      }

      setTxStep('withdrawing')
      const isFullWithdraw = withdrawType === 'full'

      // For partial: convert user input. For full: get on-chain balance via EVM.
      let withdrawAmount
      if (isFullWithdraw) {
        try {
          const provider = new ethers.BrowserProvider(window.ethereum)
          const contract = new ethers.Contract(vault.address, ERC20_ABI, provider)
          const bal = await contract.balanceOf(address)
          withdrawAmount = bal.toString()
          if (withdrawAmount === '0') throw new Error('No vault shares found. Your position may already be withdrawn.')
        } catch (err) {
          if (err.message.includes('No vault shares')) throw err
          withdrawAmount = positionBalance ? toRawAmount(positionBalance, underlyingDecimals) : '0'
        }
      } else {
        withdrawAmount = toRawAmount(amount, underlyingDecimals)
      }

      const withdrawId = toast.loading(
        'Processing Withdrawal',
        isFullWithdraw ? 'Withdrawing all funds...' : `Withdrawing ${amount} ${underlyingSymbol}...`
      )

      let result
      try {
        result = await executeWithdrawViaComposer({
          vault,
          userAddress: address,
          withdrawAmount,
          destChainId,
          destToken,
          onTxSent: (txHash) => {
            toast.dismiss(withdrawId)
            isCrossChainWithdraw
              ? toast.tx('Cross-Chain Withdrawal Sent', txHash, { title: 'Bridge In Progress' })
              : toast.tx('Withdrawal Submitted', txHash, { title: 'Transaction Sent' })
          },
        })
      } catch (withdrawErr) {
        toast.dismiss(withdrawId)
        const msg = withdrawErr?.message ?? ''
        const isRejected = msg.toLowerCase().includes('user rejected') || msg.toLowerCase().includes('rejected')
        toast.error(isRejected ? 'Transaction Rejected' : 'Withdrawal Failed', isRejected ? 'You cancelled the withdrawal.' : msg.slice(0, 120))
        setTxStep('idle')
        setError(isRejected ? 'Transaction was rejected.' : msg.slice(0, 100))
        return
      }

      setTxStep('done')
      toast.success(
        'Withdrawal Successful! 🎉',
        isFullWithdraw ? `All funds withdrawn from ${vault?.name}` : `${amount} ${underlyingSymbol} withdrawn from ${vault?.name}`,
        { duration: 8000 }
      )
      onSuccess?.({ vault, amount, txHash: result?.txHash })
    } catch (err) {
      setTxStep('idle')
      setError(err?.message ?? 'Unknown error')
      toast.error('Error', err?.message ?? 'Something went wrong')
    }
  }

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={!isBusy ? onClose : undefined} />

      <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
        {/* ── Header ── */}
        <div className="px-6 pt-6 pb-4 border-b border-surface-container shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-headline font-extrabold text-xl text-on-surface">Withdraw</h2>
              <p className="text-xs text-on-surface-variant mt-0.5 font-medium">{vault?.name}</p>
            </div>
            <button onClick={onClose} disabled={isBusy}
              className="w-8 h-8 rounded-full bg-surface-container hover:bg-surface-container-high flex items-center justify-center transition-colors disabled:opacity-40">
              <span className="material-symbols-outlined text-[16px] text-on-surface-variant">close</span>
            </button>
          </div>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {/* Vault summary */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-surface-container rounded-xl p-3 text-center">
              <p className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant mb-1">APY</p>
              <p className="font-headline font-black text-lg text-on-tertiary-container">{apyDisplay}</p>
            </div>
            <div className="bg-surface-container rounded-xl p-3 text-center">
              <p className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant mb-1">Deposited</p>
              <p className="font-bold text-sm text-on-surface truncate">
                {positionBalance
                  ? `${Number(positionBalance).toFixed(4)} ${underlyingSymbol}`
                  : `$${Number(positionBalanceUsd).toLocaleString()}`}
              </p>
            </div>
            <div className="bg-surface-container rounded-xl p-3 text-center">
              <p className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant mb-1">Network</p>
              <p className="font-bold text-sm text-on-surface truncate">{getChainName(vaultChainId)}</p>
            </div>
          </div>

          {/* Zero balance warning */}
          {hasZeroBalance && txStep !== 'done' && (
            <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
              <span className="material-symbols-outlined text-amber-500 text-[18px] shrink-0 mt-0.5">info</span>
              <div>
                <p className="font-bold text-sm text-amber-800">No Balance to Withdraw</p>
                <p className="text-xs text-amber-700 mt-0.5">No funds detected in this vault position.</p>
              </div>
            </div>
          )}

          {/* ── Destination mode ── */}
          {txStep === 'idle' && !hasZeroBalance && (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant block mb-2">
                  Receive funds to
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleDestModeChange('same')}
                    className={`py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all border-2 ${
                      destMode === 'same'
                        ? 'bg-primary-container text-white border-primary-container'
                        : 'border-surface-container-high text-on-surface-variant hover:border-primary-container'
                    }`}
                  >
                    Same Token
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDestModeChange('custom')}
                    className={`py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all border-2 flex items-center justify-center gap-1 ${
                      destMode === 'custom'
                        ? 'bg-on-tertiary-container text-white border-on-tertiary-container'
                        : 'border-surface-container-high text-on-surface-variant hover:border-on-tertiary-container'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[13px]">bolt</span>
                    Any Chain
                  </button>
                </div>
              </div>

              {/* Same mode — show current destination */}
              {destMode === 'same' && destToken && (
                <div className="flex items-center gap-3 p-3 bg-surface-container rounded-xl">
                  <div className="w-8 h-8 rounded-full bg-surface-container-high flex items-center justify-center text-sm font-black text-on-surface-variant shrink-0">
                    {destToken.symbol?.[0] ?? '?'}
                  </div>
                  <div className="flex-1">
                    <p className="font-bold text-sm text-on-surface">Receive {destToken.symbol}</p>
                    <p className="text-xs text-on-surface-variant">{getChainName(vaultChainId)}</p>
                  </div>
                  <span className="material-symbols-outlined text-on-tertiary-container text-[18px]">check_circle</span>
                </div>
              )}

              {/* Custom mode — chain + token pickers */}
              {destMode === 'custom' && (
                <div className="space-y-2 p-3 bg-on-tertiary-container/5 border border-on-tertiary-container/20 rounded-xl">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="material-symbols-outlined text-on-tertiary-container text-[14px]">bolt</span>
                    <p className="text-[10px] font-black uppercase tracking-widest text-on-tertiary-container">
                      Composer — withdraw to any chain
                    </p>
                  </div>
                  <ChainPicker
                    value={destChainId}
                    onChange={handleDestChainChange}
                    label="Receive on chain"
                  />
                  <DestTokenPicker
                    chainId={destChainId}
                    value={destToken}
                    onChange={setDestToken}
                  />
                  {isCrossChainWithdraw && (
                    <p className="text-[10px] text-on-tertiary-container font-medium mt-1">
                      Composer will bridge {getChainName(vaultChainId)} → {getChainName(destChainId)} automatically.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Withdraw type ── */}
          {txStep === 'idle' && !hasZeroBalance && (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setWithdrawType('partial')}
                className={`py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all border-2 ${
                  withdrawType === 'partial'
                    ? 'bg-primary-container text-white border-primary-container'
                    : 'border-surface-container-high text-on-surface-variant hover:border-primary-container'
                }`}
              >
                Partial
              </button>
              <button
                type="button"
                onClick={() => setWithdrawType('full')}
                className={`py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all border-2 ${
                  withdrawType === 'full'
                    ? 'bg-error text-white border-error'
                    : 'border-surface-container-high text-on-surface-variant hover:border-error'
                }`}
              >
                Withdraw All
              </button>
            </div>
          )}

          {/* ── Partial amount ── */}
          {txStep === 'idle' && withdrawType === 'partial' && !hasZeroBalance && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">
                  Amount ({underlyingSymbol})
                </label>
                <span className="text-xs text-on-surface-variant font-medium">
                  Available: {positionBalance ? `${Number(positionBalance).toFixed(4)} ${underlyingSymbol}` : `$${Number(positionBalanceUsd).toLocaleString()}`}
                </span>
              </div>

              <div className={`relative flex items-center border-2 rounded-xl transition-all ${
                hasInsufficientBalance
                  ? 'border-red-400 bg-red-50'
                  : amount && !hasInsufficientBalance
                    ? 'border-on-tertiary-container/50 bg-surface-container-low'
                    : 'border-surface-container-high bg-surface-container-low hover:border-primary-container/40'
              }`}>
                <input
                  ref={inputRef}
                  type="number"
                  min="0"
                  step="any"
                  value={amount}
                  onChange={e => { setError(null); setAmount(e.target.value) }}
                  placeholder="0.00"
                  disabled={isBusy || maxBalance === 0}
                  className="flex-1 px-4 py-3.5 bg-transparent text-xl font-headline font-black text-on-surface outline-none placeholder:text-on-surface-variant/40 disabled:opacity-50"
                />
                <div className="flex items-center gap-1 pr-3">
                  <button onClick={setHalf} disabled={isBusy || maxBalance === 0}
                    className="px-2 py-1 text-[10px] font-black uppercase tracking-wider text-on-surface-variant bg-surface-container rounded-lg hover:bg-surface-container-high transition-colors disabled:opacity-40">
                    50%
                  </button>
                  <button onClick={setMax} disabled={isBusy || maxBalance === 0}
                    className="px-2 py-1 text-[10px] font-black uppercase tracking-wider text-error bg-error/10 rounded-lg hover:bg-error/20 transition-colors disabled:opacity-40">
                    MAX
                  </button>
                </div>
              </div>

              {hasInsufficientBalance && (
                <div className="flex items-center gap-2 text-red-600">
                  <span className="material-symbols-outlined text-[14px]">error</span>
                  <p className="text-xs font-bold">Exceeds deposited balance of {maxBalance.toFixed(4)} {underlyingSymbol}.</p>
                </div>
              )}
            </div>
          )}

          {/* Full withdraw summary */}
          {txStep === 'idle' && withdrawType === 'full' && !hasZeroBalance && (
            <div className="p-4 bg-error/5 border border-error/20 rounded-xl">
              <p className="font-bold text-sm text-on-surface">Withdraw everything</p>
              <p className="text-xs text-on-surface-variant mt-1">
                Your full position of{' '}
                <span className="font-bold text-on-surface">
                  {positionBalance ? `${Number(positionBalance).toFixed(4)} ${underlyingSymbol}` : `$${Number(positionBalanceUsd).toLocaleString()}`}
                </span>
                {destMode === 'custom' && destToken
                  ? ` → ${destToken.symbol} on ${getChainName(destChainId)}`
                  : ` → ${underlyingSymbol} on ${getChainName(vaultChainId)}`}
              </p>
            </div>
          )}

          {/* Error */}
          {error && txStep === 'idle' && (
            <div className="flex items-start gap-2 p-3 bg-error-container/20 border border-error-container rounded-xl">
              <span className="material-symbols-outlined text-error text-[16px] shrink-0 mt-0.5">error</span>
              <p className="text-xs font-medium text-on-error-container">{error}</p>
            </div>
          )}

          {/* Busy steps */}
          {isBusy && (
            <div className="space-y-2">
              {needsChainSwitch && <StepIndicator label={`Switch to ${getChainName(vaultChainId)}`} status={txStep === 'switching' ? 'active' : 'done'} />}
              <StepIndicator label="Approve Vault Shares" status={txStep === 'withdrawing' ? 'active' : 'pending'} />
              <StepIndicator label="Submit Withdrawal" status={txStep === 'withdrawing' ? 'active' : 'pending'} />
            </div>
          )}

          {/* Done */}
          {txStep === 'done' && (
            <div className="text-center space-y-3 py-4">
              <div className="w-16 h-16 bg-on-tertiary-container/10 rounded-full flex items-center justify-center mx-auto">
                <span className="material-symbols-outlined text-on-tertiary-container text-3xl">check_circle</span>
              </div>
              <h3 className="font-headline font-extrabold text-xl text-on-surface">Withdrawal Complete!</h3>
              <p className="text-sm text-on-surface-variant">
                Funds sent to {getChainName(destChainId)} as {destToken?.symbol}.
                {isCrossChainWithdraw && ' Bridge may take 1–5 minutes.'}
              </p>
            </div>
          )}

          {/* Action button */}
          {txStep !== 'done' ? (
            <button
              onClick={handleWithdraw}
              disabled={!isValid || isBusy || !destToken}
              className={`w-full py-4 rounded-2xl font-headline font-black text-base transition-all flex items-center justify-center gap-2
                ${isValid && !isBusy && destToken
                  ? withdrawType === 'full'
                    ? 'bg-error text-white hover:opacity-90 shadow-md'
                    : 'bg-primary-container text-white hover:opacity-90 shadow-md'
                  : 'bg-surface-container text-on-surface-variant cursor-not-allowed'
                }`}
            >
              {isBusy ? (
                <>
                  <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
                  {txStep === 'switching' && 'Switching Network...'}
                  {txStep === 'withdrawing' && 'Withdrawing...'}
                </>
              ) : needsChainSwitch && isValid ? (
                <>
                  <span className="material-symbols-outlined text-[18px]">swap_horiz</span>
                  Switch & Withdraw
                </>
              ) : withdrawType === 'full' ? (
                <>
                  <span className="material-symbols-outlined text-[18px]">logout</span>
                  Withdraw All
                  {destMode === 'custom' && destToken ? ` → ${destToken.symbol} on ${getChainName(destChainId)}` : ''}
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[18px]">remove_circle</span>
                  Withdraw {amount ? `${amount} ${underlyingSymbol}` : ''}
                  {destMode === 'custom' && destToken ? ` → ${destToken.symbol}` : ''}
                </>
              )}
            </button>
          ) : (
            <button onClick={onClose}
              className="w-full py-4 rounded-2xl font-headline font-black text-base bg-on-tertiary-container text-white hover:opacity-90 transition-all">
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  )
}