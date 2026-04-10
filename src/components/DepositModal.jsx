// src/components/DepositModal.jsx
// 2-step UX (restored from original):
//   Step 1 — pick source chain + token (ALL tokens from LI.FI API, real balances)
//   Step 2 — enter amount + execute deposit
//
// Fixes:
// - Chain switcher right in the modal (no need to close modal to switch chain)
// - Token list uses LI.FI /v1/tokens for ALL tokens (USDe, EURC, etc.)
// - Balances use wallet provider directly for the connected chain → no zero balance bug
// - Continue button always visible, no scrolling needed
// - Defaults to vault chain + underlying token on open
// - Cross-chain notice is a single compact text line — no banner, no height change
// - Stablecoin 2dp formatting handled in tokenBalances.js, not here

import { useState, useEffect, useRef } from 'react'
import { useAccount, useSwitchChain } from 'wagmi'
import { useToast } from './ToastNotifications'
import { executeDeposit } from '../services/executeDeposit'
import { getTokenBalancesOnChain, SUPPORTED_CHAINS, NATIVE_ADDRESS, isNativeToken } from '../services/tokenBalances'

const CHAIN_NAMES = Object.fromEntries(SUPPORTED_CHAINS.map(c => [c.id, c.name]))
function getChainName(chainId) {
  return CHAIN_NAMES[chainId] ?? `Chain ${chainId}`
}

// ─── Step indicator ────────────────────────────────────────────────────────────
function StepIndicator({ label, status }) {
  return (
    <div className={`flex items-center gap-3 p-2.5 rounded-xl transition-all ${
      status === 'active' ? 'bg-primary-container/5 border border-primary-container/20' :
      status === 'done'   ? 'opacity-50' : 'opacity-30'
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

// ─── Step 1: Source picker ────────────────────────────────────────────────────
function SourcePicker({ onConfirm, vaultChainId, vaultUnderlyingToken, walletChainId }) {
  const { address } = useAccount()
  const { switchChainAsync } = useSwitchChain()

  const [selectedChainId, setSelectedChainId] = useState(vaultChainId ?? walletChainId)
  const [showChainPicker, setShowChainPicker] = useState(false)
  const [switchingChain, setSwitchingChain] = useState(false)

  const [tokens, setTokens] = useState([])
  const [loadingTokens, setLoadingTokens] = useState(false)
  const [selectedToken, setSelectedToken] = useState(null)
  const [search, setSearch] = useState('')

  const chainPickerRef = useRef(null)

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e) {
      if (chainPickerRef.current && !chainPickerRef.current.contains(e.target)) {
        setShowChainPicker(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Load tokens whenever chain changes
  useEffect(() => {
    if (!address || !selectedChainId) return
    setLoadingTokens(true)
    setSelectedToken(null)
    setSearch('')
    setTokens([])

    getTokenBalancesOnChain(address, selectedChainId)
      .then(list => {
        setTokens(list)
        // Default: match vault underlying token symbol, else first with balance, else first
        const vaultSymbol = vaultUnderlyingToken?.symbol?.toUpperCase()
        const bySymbol    = vaultSymbol ? list.find(t => t.symbol?.toUpperCase() === vaultSymbol) : null
        const withBal     = list.find(t => t.balanceFloat > 0)
        setSelectedToken(bySymbol ?? withBal ?? list[0] ?? null)
      })
      .catch(err => {
        console.error('[SourcePicker] token load failed:', err)
        setTokens([])
      })
      .finally(() => setLoadingTokens(false))
  }, [address, selectedChainId])

  async function handleChainSelect(chainId) {
    setShowChainPicker(false)
    if (chainId === selectedChainId) return

    setSwitchingChain(true)
    try {
      await switchChainAsync({ chainId })
    } catch {
      // User rejected or can't switch — that's fine, we'll use public RPC
    } finally {
      setSwitchingChain(false)
    }
    setSelectedChainId(chainId)
  }

  const filtered = tokens.filter(t =>
    !search ||
    t.symbol?.toLowerCase().includes(search.toLowerCase()) ||
    t.name?.toLowerCase().includes(search.toLowerCase())
  )

  const isCrossChain = selectedChainId !== vaultChainId

  return (
    <div className="flex flex-col gap-4">

      {/* ── Chain picker ── */}
      <div>
        <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant block mb-2">
          Deposit from chain
        </label>
        <div className="relative" ref={chainPickerRef}>
          <button
            type="button"
            onClick={() => setShowChainPicker(o => !o)}
            disabled={switchingChain}
            className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl border-2 border-surface-container-high bg-surface-container-low hover:border-primary-container/40 transition-all text-left disabled:opacity-60"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-bold text-sm text-on-surface truncate">{getChainName(selectedChainId)}</span>
              {selectedChainId === walletChainId && (
                <span className="text-[10px] bg-on-tertiary-container/10 text-on-tertiary-container px-2 py-0.5 rounded-full font-black shrink-0">
                  Wallet
                </span>
              )}
              {/* Inline cross-chain badge — sits in the button row, adds zero height */}
              {isCrossChain && (
                <span className="text-[10px] bg-on-tertiary-container/10 text-on-tertiary-container px-2 py-0.5 rounded-full font-black shrink-0 flex items-center gap-0.5">
                  <span className="material-symbols-outlined text-[11px]">bolt</span>
                  Cross-chain
                </span>
              )}
            </div>
            {switchingChain
              ? <span className="material-symbols-outlined text-[16px] text-on-surface-variant animate-spin shrink-0">progress_activity</span>
              : <span className="material-symbols-outlined text-[16px] text-on-surface-variant shrink-0">expand_more</span>
            }
          </button>

          {showChainPicker && (
            <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-2xl shadow-2xl border border-surface-container z-[200] overflow-hidden">
              <div className="grid grid-cols-2 gap-1 p-2 max-h-48 overflow-y-auto">
                {SUPPORTED_CHAINS.map(chain => (
                  <button
                    key={chain.id}
                    type="button"
                    onClick={() => handleChainSelect(chain.id)}
                    className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-left transition-colors text-sm font-bold
                      ${chain.id === selectedChainId
                        ? 'bg-primary-container text-white'
                        : 'text-on-surface hover:bg-surface-container'
                      }`}
                  >
                    <span className="truncate">{chain.name}</span>
                    {chain.id === walletChainId && chain.id !== selectedChainId && (
                      <span className="w-1.5 h-1.5 rounded-full bg-on-tertiary-container shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Cross-chain hint — single compact line, no box/banner, no extra padding */}
        {isCrossChain && (
          <p className="mt-1.5 text-[11px] text-on-tertiary-container font-semibold px-1 leading-tight">
            ⚡ Composer bridges {getChainName(selectedChainId)} → {getChainName(vaultChainId)} and deposits in one tx.
          </p>
        )}
      </div>

      {/* ── Token picker ── */}
      <div className="flex flex-col gap-2 min-h-0">
        <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant shrink-0">
          Token to deposit
        </label>

        {loadingTokens ? (
          <div className="space-y-2 animate-pulse">
            {[1,2,3,4].map(i => <div key={i} className="h-12 bg-surface-container rounded-xl" />)}
          </div>
        ) : (
          <>
            {/* Search */}
            <div className="relative shrink-0">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-[14px] text-on-surface-variant">search</span>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search token… (USDe, EURC, USDC…)"
                className="w-full pl-8 pr-3 py-2 rounded-xl border border-surface-container-high bg-surface-container-low text-sm focus:outline-none focus:ring-2 focus:ring-primary-container/20 font-medium"
              />
            </div>

            {/* Token list — restricted height so Continue is always visible */}
            <div className="overflow-y-auto space-y-0.5" style={{ maxHeight: '168px' }}>
              {filtered.length === 0 && (
                <p className="text-center text-sm text-on-surface-variant py-4">No tokens found</p>
              )}
              {filtered.map((token, i) => {
                const hasBalance = token.balanceFloat > 0
                const isSelected = selectedToken?.address?.toLowerCase() === token.address?.toLowerCase()
                return (
                  <button
                    key={token.address + i}
                    type="button"
                    onClick={() => setSelectedToken(token)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left border-2
                      ${isSelected
                        ? 'border-primary-container/40 bg-primary-container/5'
                        : 'border-transparent hover:bg-surface-container'
                      }`}
                  >
                    {token.logoURI ? (
                      <img
                        src={token.logoURI}
                        alt={token.symbol}
                        className="w-8 h-8 rounded-full shrink-0 object-cover"
                        onError={e => { e.target.style.display = 'none' }}
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-xs font-black text-on-surface-variant shrink-0">
                        {token.symbol?.[0] ?? '?'}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm text-on-surface">{token.symbol}</p>
                      <p className="text-[10px] text-on-surface-variant truncate">{token.name}</p>
                    </div>
                    <div className="text-right shrink-0">
                      {/* formattedBalance precision is handled in tokenBalances.js:
                          stablecoins → 2dp, ETH/BTC/etc → full meaningful precision */}
                      <p className={`font-bold text-sm ${hasBalance ? 'text-on-surface' : 'text-on-surface-variant/50'}`}>
                        {token.formattedBalance}
                      </p>
                      {hasBalance && (
                        <div className="w-1.5 h-1.5 rounded-full bg-on-tertiary-container ml-auto mt-0.5" />
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* ── Continue button — always visible, never needs scrolling ── */}
      <button
        type="button"
        onClick={() => selectedToken && onConfirm({ chainId: selectedChainId, token: selectedToken })}
        disabled={!selectedToken || loadingTokens}
        className={`w-full py-3.5 rounded-2xl font-headline font-black text-sm transition-all flex items-center justify-center gap-2 shrink-0
          ${selectedToken && !loadingTokens
            ? 'bg-primary-container text-white hover:opacity-90 shadow-md'
            : 'bg-surface-container text-on-surface-variant cursor-not-allowed'
          }`}
      >
        <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
        {selectedToken ? `Continue with ${selectedToken.symbol}` : 'Select a token'}
      </button>
    </div>
  )
}

// ─── Step 2: Amount + Execute ─────────────────────────────────────────────────
function AmountStep({ vault, sourceChainId, sourceToken, onBack, onSuccess, onClose }) {
  const { address, chainId: walletChainId } = useAccount()
  const { switchChainAsync } = useSwitchChain()
  const toast = useToast()

  const [amount, setAmount] = useState('')
  const [txStep, setTxStep] = useState('idle') // idle | switching | approving | depositing | crosschain | done
  const [error, setError] = useState(null)
  const [crossChainTxHash, setCrossChainTxHash] = useState(null)
  const inputRef = useRef(null)

  const isCrossChain      = sourceChainId !== vault.chainId
  const needsWalletSwitch = walletChainId !== sourceChainId

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 100) }, [])

  const apy        = vault?.analytics?.apy?.total
  const apyDisplay = apy != null ? `${(apy * 100).toFixed(2)}%` : 'N/A'
  const amountNum  = parseFloat(amount) || 0
  const balFloat   = sourceToken?.balanceFloat ?? 0
  const hasInsuf   = amountNum > 0 && amountNum > balFloat
  const isValid    = amountNum > 0 && !hasInsuf && amount.trim() !== ''
  const isBusy     = ['switching', 'approving', 'depositing'].includes(txStep)

  function toRaw(human, decimals) {
    if (!human || isNaN(parseFloat(human))) return '0'
    const [whole, frac = ''] = String(human).split('.')
    const fracPadded = frac.padEnd(decimals, '0').slice(0, decimals)
    return (BigInt(whole || '0') * BigInt(10 ** decimals) + BigInt(fracPadded || '0')).toString()
  }

  function setMax() {
    if (!sourceToken) return
    if (isNativeToken(sourceToken.address)) {
      const max = Math.max(0, balFloat - 0.002)
      setAmount(max > 0 ? max.toFixed(6) : '0')
    } else {
      setAmount(sourceToken.formattedBalance)
    }
  }

  function setHalf() {
    if (!sourceToken || balFloat === 0) return
    setAmount((balFloat / 2).toFixed(6))
  }

  async function handleDeposit() {
    if (!isValid || !sourceToken) return
    setError(null)

    try {
      if (walletChainId !== sourceChainId) {
        setTxStep('switching')
        try {
          await switchChainAsync({ chainId: sourceChainId })
        } catch (err) {
          setTxStep('idle')
          const rejected = err?.message?.toLowerCase().includes('rejected')
          setError(rejected ? 'Please approve the network switch.' : `Could not switch to ${getChainName(sourceChainId)}.`)
          toast.error('Network Switch Failed', rejected ? 'You rejected the switch.' : `Failed to switch.`)
          return
        }
      }

      setTxStep('approving')
      const rawAmount    = toRaw(amount, sourceToken.decimals)
      const approvingId  = toast.loading('Preparing Deposit', 'Building transaction via Composer...')

      const result = await executeDeposit({
        vault,
        fromToken: sourceToken,
        fromAmount: rawAmount,
        userAddress: address,
        fromChainId: sourceChainId,
        onApprovalSent: () => {
          toast.update(approvingId, { type: 'loading', title: 'Approve Token', message: `Approving ${sourceToken.symbol}...` })
        },
        onApprovalDone: () => {
          toast.update(approvingId, { type: 'success', title: 'Approved', message: `${sourceToken.symbol} approved`, duration: 2000 })
          setTxStep('depositing')
        },
        onDepositSent: (txHash) => {
          toast.dismiss(approvingId)
          isCrossChain
            ? toast.tx('Cross-Chain Deposit Sent', txHash, { title: 'Bridge + Deposit In Progress' })
            : toast.tx('Deposit Submitted', txHash, { title: 'Transaction Sent' })
          setTxStep('depositing')
        },
        onCrossChainPending: (txHash) => {
          setCrossChainTxHash(txHash)
          setTxStep('crosschain')
        },
      })

      if (!result.isCrossChain) {
        setTxStep('done')
        toast.success('Deposit Successful! 🎉', `${amount} ${sourceToken.symbol} deposited into ${vault.name}`, { duration: 8000 })
        onSuccess?.({ vault, amount, txHash: result?.txHash })
      } else {
        setTxStep('crosschain')
        setCrossChainTxHash(result.txHash)
      }
    } catch (err) {
      const msg = err?.message ?? ''
      const isRejected = msg.toLowerCase().includes('user rejected') || msg.toLowerCase().includes('rejected')
      setTxStep('idle')
      if (isRejected) {
        toast.error('Transaction Rejected', 'You cancelled the transaction.')
        setError('Transaction was rejected.')
      } else if (msg.includes('No routes found') || msg.includes('no routes')) {
        toast.error('No Route Found', 'Try a different token or chain.')
        setError('No deposit route found. Try a different source token or chain.')
      } else {
        toast.error('Deposit Failed', msg.slice(0, 120))
        setError(msg.slice(0, 120))
      }
    }
  }

  return (
    <div className="space-y-5">
      {/* Route summary */}
      <div className="flex items-center gap-3 p-3 bg-surface-container rounded-xl">
        <div className="text-center flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant">From</p>
          <p className="font-bold text-sm text-on-surface mt-0.5 truncate">{getChainName(sourceChainId)}</p>
          <p className="text-xs text-on-surface-variant">{sourceToken.symbol}</p>
        </div>
        <div className="flex flex-col items-center gap-1 shrink-0">
          <span className="material-symbols-outlined text-on-tertiary-container text-[20px]">
            {isCrossChain ? 'bolt' : 'arrow_forward'}
          </span>
          <p className="text-[9px] font-black uppercase text-on-surface-variant">
            {isCrossChain ? 'Composer' : 'Direct'}
          </p>
        </div>
        <div className="text-center flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant">Into</p>
          <p className="font-bold text-sm text-on-surface mt-0.5 truncate">{getChainName(vault.chainId)}</p>
          <p className="text-xs text-on-surface-variant truncate">{vault.name}</p>
        </div>
      </div>

      {/* Vault metrics */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-surface-container rounded-xl p-3 text-center">
          <p className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant mb-1">APY</p>
          <p className="font-headline font-black text-lg text-on-tertiary-container">{apyDisplay}</p>
        </div>
        <div className="bg-surface-container rounded-xl p-3 text-center">
          <p className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant mb-1">Protocol</p>
          <p className="font-bold text-sm text-on-surface truncate">{vault?.protocol?.name}</p>
        </div>
      </div>

      {/* Wallet switch warning */}
      {needsWalletSwitch && txStep === 'idle' && (
        <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
          <span className="material-symbols-outlined text-amber-500 text-[16px]">swap_horiz</span>
          <p className="text-xs font-medium text-amber-800">
            Your wallet is on {getChainName(walletChainId)}. We'll switch to {getChainName(sourceChainId)} before depositing.
          </p>
        </div>
      )}

      {/* Amount input */}
      {txStep !== 'done' && txStep !== 'crosschain' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">
              Amount ({sourceToken.symbol})
            </label>
            <span className="text-xs font-medium text-on-surface-variant">
              Balance:{' '}
              <span className={balFloat > 0 ? 'text-on-tertiary-container font-bold' : ''}>
                {sourceToken.formattedBalance}
              </span>{' '}
              {sourceToken.symbol}
            </span>
          </div>

          <div className={`relative flex items-center border-2 rounded-xl transition-all ${
            hasInsuf
              ? 'border-red-400 bg-red-50'
              : amount && isValid
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
              disabled={isBusy}
              className="flex-1 px-4 py-3.5 bg-transparent text-xl font-headline font-black text-on-surface outline-none placeholder:text-on-surface-variant/40 disabled:opacity-50"
            />
            <div className="flex items-center gap-1 pr-3">
              <button onClick={setHalf} disabled={isBusy || balFloat === 0}
                className="px-2 py-1 text-[10px] font-black uppercase text-on-surface-variant bg-surface-container rounded-lg hover:bg-surface-container-high transition-colors disabled:opacity-40">
                50%
              </button>
              <button onClick={setMax} disabled={isBusy || balFloat === 0}
                className="px-2 py-1 text-[10px] font-black uppercase text-on-tertiary-container bg-on-tertiary-container/10 rounded-lg hover:bg-on-tertiary-container/20 transition-colors disabled:opacity-40">
                MAX
              </button>
            </div>
          </div>

          {hasInsuf && (
            <div className="flex items-center gap-2 text-red-600">
              <span className="material-symbols-outlined text-[14px]">error</span>
              <p className="text-xs font-bold">
                Insufficient balance. You have {sourceToken.formattedBalance} {sourceToken.symbol}.
              </p>
            </div>
          )}

          {isValid && apy != null && (
            <div className="flex items-center justify-between p-2.5 bg-on-tertiary-container/5 rounded-xl border border-on-tertiary-container/10">
              <p className="text-xs text-on-surface-variant font-medium">Projected earnings</p>
              <div className="text-right">
                <p className="text-xs font-black text-on-tertiary-container">
                  +{(amountNum * apy / 12).toFixed(4)} {sourceToken.symbol}/mo
                </p>
                <p className="text-[10px] text-on-surface-variant">+{(amountNum * apy).toFixed(4)}/yr</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {error && txStep === 'idle' && (
        <div className="flex items-start gap-2 p-3 bg-error-container/20 border border-error-container rounded-xl">
          <span className="material-symbols-outlined text-error text-[16px] shrink-0 mt-0.5">error</span>
          <p className="text-xs font-medium text-on-error-container">{error}</p>
        </div>
      )}

      {/* Tx progress */}
      {isBusy && (
        <div className="space-y-2">
          {needsWalletSwitch && <StepIndicator label={`Switch to ${getChainName(sourceChainId)}`} status={txStep === 'switching' ? 'active' : 'done'} />}
          <StepIndicator label="Build Composer Route" status={txStep === 'approving' ? 'active' : txStep === 'depositing' ? 'done' : 'pending'} />
          <StepIndicator label="Approve Token"        status={txStep === 'approving' ? 'active' : txStep === 'depositing' ? 'done' : 'pending'} />
          <StepIndicator label="Submit Deposit"       status={txStep === 'depositing' ? 'active' : 'pending'} />
        </div>
      )}

      {/* Cross-chain pending */}
      {txStep === 'crosschain' && (
        <div className="text-center space-y-4 py-4">
          <div className="w-16 h-16 bg-on-tertiary-container/10 rounded-full flex items-center justify-center mx-auto">
            <span className="material-symbols-outlined text-on-tertiary-container text-3xl animate-spin">autorenew</span>
          </div>
          <h3 className="font-headline font-extrabold text-xl text-on-surface">Bridge In Progress</h3>
          <p className="text-sm text-on-surface-variant">
            {getChainName(sourceChainId)} → {getChainName(vault.chainId)}. Takes 1–5 minutes.
          </p>
          {crossChainTxHash && (
            <a href={`https://explorer.li.fi/?txHash=${crossChainTxHash}`} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-on-tertiary-container font-bold hover:underline">
              <span className="material-symbols-outlined text-[14px]">open_in_new</span>
              Track on LI.FI Explorer
            </a>
          )}
        </div>
      )}

      {/* Done */}
      {txStep === 'done' && (
        <div className="text-center space-y-3 py-4">
          <div className="w-16 h-16 bg-on-tertiary-container/10 rounded-full flex items-center justify-center mx-auto">
            <span className="material-symbols-outlined text-on-tertiary-container text-3xl">check_circle</span>
          </div>
          <h3 className="font-headline font-extrabold text-xl text-on-surface">Deposit Complete!</h3>
          <p className="text-sm text-on-surface-variant">
            {amount} {sourceToken?.symbol} is now earning {apyDisplay} APY in {vault?.name}.
          </p>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2">
        {txStep !== 'done' && txStep !== 'crosschain' && !isBusy && (
          <button type="button" onClick={onBack}
            className="px-4 py-4 rounded-2xl font-headline font-black text-sm border-2 border-surface-container-high text-on-surface-variant hover:border-primary-container/40 transition-all flex items-center">
            <span className="material-symbols-outlined text-[16px]">arrow_back</span>
          </button>
        )}

        {txStep !== 'done' && txStep !== 'crosschain' ? (
          <button
            onClick={handleDeposit}
            disabled={!isValid || isBusy}
            className={`flex-1 py-4 rounded-2xl font-headline font-black text-sm transition-all flex items-center justify-center gap-2
              ${isValid && !isBusy
                ? 'bg-primary-container text-white hover:opacity-90 shadow-md'
                : 'bg-surface-container text-on-surface-variant cursor-not-allowed'
              }`}
          >
            {isBusy ? (
              <>
                <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
                {txStep === 'switching' && `Switching to ${getChainName(sourceChainId)}...`}
                {txStep === 'approving' && 'Preparing...'}
                {txStep === 'depositing' && 'Depositing...'}
              </>
            ) : isCrossChain ? (
              <>
                <span className="material-symbols-outlined text-[18px]">bolt</span>
                {amount ? `Deposit ${amount} ${sourceToken?.symbol} via Composer` : 'Enter an amount'}
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-[18px]">add_circle</span>
                {amount ? `Deposit ${amount} ${sourceToken?.symbol}` : 'Enter an amount'}
              </>
            )}
          </button>
        ) : txStep === 'crosschain' ? (
          <button onClick={() => { onSuccess?.({ vault, amount }); onClose() }}
            className="w-full py-4 rounded-2xl font-headline font-black text-base bg-surface-container text-on-surface-variant hover:bg-surface-container-high transition-all">
            Close (Bridge Continuing)
          </button>
        ) : (
          <button onClick={onClose}
            className="w-full py-4 rounded-2xl font-headline font-black text-base bg-on-tertiary-container text-white hover:opacity-90 transition-all">
            Done
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Main Modal ────────────────────────────────────────────────────────────────
export default function DepositModal({ vault, onClose, onSuccess }) {
  const { chainId: walletChainId } = useAccount()
  const [modalStep, setModalStep] = useState('pick-source') // pick-source | amount
  const [source, setSource] = useState(null)

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={modalStep === 'pick-source' ? onClose : undefined}
      />

      <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl flex flex-col"
           style={{ maxHeight: '92vh' }}>

        {/* Header — fixed */}
        <div className="px-6 pt-6 pb-4 border-b border-surface-container shrink-0">
          <div className="flex items-center justify-between">
            <div className="min-w-0 pr-4">
              <h2 className="font-headline font-extrabold text-xl text-on-surface">
                {modalStep === 'pick-source' ? 'Choose Source' : 'Deposit'}
              </h2>
              <p className="text-xs text-on-surface-variant mt-0.5 font-medium truncate">
                {vault?.name} · {getChainName(vault?.chainId)}
                {vault?.analytics?.apy?.total != null ? ` · ${(vault.analytics.apy.total * 100).toFixed(2)}% APY` : ''}
              </p>
            </div>
            <button onClick={onClose}
              className="w-8 h-8 rounded-full bg-surface-container hover:bg-surface-container-high flex items-center justify-center transition-colors shrink-0">
              <span className="material-symbols-outlined text-[16px] text-on-surface-variant">close</span>
            </button>
          </div>

          {/* Step pills */}
          <div className="flex items-center gap-2 mt-3">
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${
              modalStep === 'pick-source' ? 'bg-primary-container text-white' : 'bg-on-tertiary-container text-white'
            }`}>
              {modalStep !== 'pick-source' && <span className="material-symbols-outlined text-[10px]">check</span>}
              1. Source
            </div>
            <span className="material-symbols-outlined text-[14px] text-on-surface-variant">chevron_right</span>
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${
              modalStep === 'amount' ? 'bg-primary-container text-white' : 'bg-surface-container text-on-surface-variant'
            }`}>
              2. Amount
            </div>
          </div>
        </div>

        {/* Body — scrollable */}
        <div className="p-6 overflow-y-auto flex-1">
          {modalStep === 'pick-source' ? (
            <SourcePicker
              onConfirm={src => { setSource(src); setModalStep('amount') }}
              vaultChainId={vault?.chainId}
              vaultUnderlyingToken={vault?.underlyingTokens?.[0]}
              walletChainId={walletChainId}
            />
          ) : (
            <AmountStep
              vault={vault}
              sourceChainId={source.chainId}
              sourceToken={source.token}
              onBack={() => setModalStep('pick-source')}
              onSuccess={onSuccess}
              onClose={onClose}
            />
          )}
        </div>
      </div>
    </div>
  )
}