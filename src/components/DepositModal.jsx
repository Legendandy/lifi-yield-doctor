// src/components/DepositModal.jsx
// Cross-chain deposit via LI.FI Composer
// - Default: vault's underlying token on the vault's chain
// - User can switch source chain (also switches wallet) and pick any token
// - Real balances via direct RPC (no zero balance bug)

import { useState, useEffect, useRef } from 'react'
import { useAccount, useSwitchChain } from 'wagmi'
import { useToast } from './ToastNotifications'
import { executeDeposit } from '../services/executeDeposit'
import { getTokenBalancesOnChain, SUPPORTED_CHAINS, CHAIN_TOKENS, NATIVE_ADDRESS } from '../services/tokenBalances'

const CHAIN_NAMES = Object.fromEntries(SUPPORTED_CHAINS.map(c => [c.id, c.name]))

function getChainName(chainId) {
  return CHAIN_NAMES[chainId] ?? `Chain ${chainId}`
}

// ─── Inline chain picker ───────────────────────────────────────────────────────
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
        className="w-full flex items-center justify-between gap-2 px-4 py-3 rounded-xl border-2 border-surface-container-high bg-surface-container-low hover:border-primary-container/50 transition-all text-left"
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

// ─── Token picker ──────────────────────────────────────────────────────────────
function TokenPicker({ tokens, value, onChange, loading }) {
  const [search, setSearch] = useState('')

  const filtered = tokens.filter(t =>
    t.symbol?.toLowerCase().includes(search.toLowerCase()) ||
    t.name?.toLowerCase().includes(search.toLowerCase())
  )

  if (loading) {
    return (
      <div className="space-y-2 animate-pulse">
        {[1, 2, 3].map(i => <div key={i} className="h-12 bg-surface-container rounded-xl" />)}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-[14px] text-on-surface-variant">search</span>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search token..."
          className="w-full pl-8 pr-3 py-2 rounded-xl border border-surface-container-high bg-surface-container-low text-sm focus:outline-none focus:ring-2 focus:ring-primary-container/20 font-medium"
        />
      </div>
      <div className="space-y-1 max-h-44 overflow-y-auto pr-1">
        {filtered.length === 0 && (
          <p className="text-center text-sm text-on-surface-variant py-4">No tokens found</p>
        )}
        {filtered.map((token, i) => {
          const hasBalance = token.balanceFloat > 0
          const isSelected = value?.address?.toLowerCase() === token.address?.toLowerCase()
          return (
            <button
              key={token.address + i}
              type="button"
              onClick={() => onChange(token)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left border-2
                ${isSelected
                  ? 'border-primary-container/40 bg-primary-container/5'
                  : 'border-transparent hover:bg-surface-container'
                }`}
            >
              <div className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-xs font-black text-on-surface-variant shrink-0">
                {token.symbol?.[0] ?? '?'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm text-on-surface">{token.symbol}</p>
                <p className="text-[10px] text-on-surface-variant truncate">{token.name}</p>
              </div>
              <div className="text-right shrink-0">
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
    </div>
  )
}

// ─── Step indicator ────────────────────────────────────────────────────────────
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
export default function DepositModal({ vault, onClose, onSuccess }) {
  const { address, chainId: walletChainId } = useAccount()
  const { switchChainAsync } = useSwitchChain()
  const toast = useToast()

  // Vault info
  const vaultChainId = vault?.chainId
  const vaultUnderlyingToken = vault?.underlyingTokens?.[0]

  // ── Source chain — default to vault's chain ────────────────────────────────
  const [sourceChainId, setSourceChainId] = useState(vaultChainId ?? walletChainId)
  const [tokens, setTokens] = useState([])
  const [loadingTokens, setLoadingTokens] = useState(false)
  const [selectedToken, setSelectedToken] = useState(null)

  // ── Deposit flow state ─────────────────────────────────────────────────────
  const [amount, setAmount] = useState('')
  const [txStep, setTxStep] = useState('idle') // idle | switching | approving | depositing | crosschain | done
  const [error, setError] = useState(null)
  const [crossChainTxHash, setCrossChainTxHash] = useState(null)
  const inputRef = useRef(null)

  // Load tokens when source chain changes
  useEffect(() => {
    if (!address || !sourceChainId) return
    setLoadingTokens(true)
    setSelectedToken(null)
    setAmount('')
    setError(null)

    getTokenBalancesOnChain(address, sourceChainId).then(list => {
      setTokens(list)

      // Default selection logic:
      // 1. Try to match the vault's underlying token on this chain (by symbol)
      // 2. Otherwise pick the first token with a balance
      // 3. Otherwise pick the first token
      const vaultSymbol = vaultUnderlyingToken?.symbol?.toUpperCase()
      const matchBySymbol = vaultSymbol
        ? list.find(t => t.symbol?.toUpperCase() === vaultSymbol)
        : null
      const withBalance = list.find(t => t.balanceFloat > 0)
      setSelectedToken(matchBySymbol ?? withBalance ?? list[0] ?? null)
    }).catch(() => {
      setTokens([])
    }).finally(() => setLoadingTokens(false))
  }, [address, sourceChainId])

  // Auto-focus amount input
  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 100) }, [])

  const isCrossChain = sourceChainId !== vaultChainId
  const needsWalletSwitch = walletChainId !== sourceChainId

  const apy = vault?.analytics?.apy?.total
  const apyDisplay = apy != null ? `${(apy * 100).toFixed(2)}%` : 'N/A'
  const amountNum = parseFloat(amount) || 0
  const balanceFloat = selectedToken?.balanceFloat ?? 0
  const hasInsufficientBalance = amountNum > 0 && amountNum > balanceFloat
  const isValid = amountNum > 0 && !hasInsufficientBalance && amount.trim() !== ''
  const isBusy = ['switching', 'approving', 'depositing'].includes(txStep)

  function toRawAmount(humanAmount, decimals) {
    if (!humanAmount || isNaN(parseFloat(humanAmount))) return '0'
    const [whole, frac = ''] = String(humanAmount).split('.')
    const fracPadded = frac.padEnd(decimals, '0').slice(0, decimals)
    return (BigInt(whole || '0') * BigInt(10 ** decimals) + BigInt(fracPadded || '0')).toString()
  }

  function setMax() {
    if (!selectedToken) return
    const isNative = !selectedToken.address || selectedToken.address === NATIVE_ADDRESS
    if (isNative) {
      const max = Math.max(0, balanceFloat - 0.002)
      setAmount(max > 0 ? max.toFixed(6) : '0')
    } else {
      setAmount(selectedToken.formattedBalance)
    }
  }

  function setHalf() {
    if (!selectedToken || balanceFloat === 0) return
    setAmount((balanceFloat / 2).toFixed(6))
  }

  // When user picks a new source chain — also switch the wallet
  async function handleSourceChainChange(newChainId) {
    setSourceChainId(newChainId)
    // Switch wallet too (so the transaction is sent from the right chain)
    if (newChainId !== walletChainId) {
      try {
        await switchChainAsync({ chainId: newChainId })
      } catch {
        // User might reject — that's ok, we still show balances for that chain
      }
    }
  }

  async function handleDeposit() {
    if (!isValid || !selectedToken) return
    setError(null)

    try {
      // If wallet isn't on the source chain yet, switch first
      if (walletChainId !== sourceChainId) {
        setTxStep('switching')
        try {
          await switchChainAsync({ chainId: sourceChainId })
        } catch (switchErr) {
          setTxStep('idle')
          const rejected = switchErr?.message?.toLowerCase().includes('rejected')
          setError(rejected ? 'Please approve the network switch.' : `Could not switch to ${getChainName(sourceChainId)}.`)
          toast.error('Network Switch Failed', rejected ? 'You rejected the switch.' : `Failed to switch to ${getChainName(sourceChainId)}.`)
          return
        }
      }

      setTxStep('approving')
      const rawAmount = toRawAmount(amount, selectedToken.decimals)
      const approvingId = toast.loading('Preparing Deposit', 'Building transaction via Composer...')

      const result = await executeDeposit({
        vault,
        fromToken: selectedToken,
        fromAmount: rawAmount,
        userAddress: address,
        fromChainId: sourceChainId,
        onApprovalSent: () => {
          toast.update(approvingId, {
            type: 'loading',
            title: 'Approve Token',
            message: `Approving ${selectedToken.symbol}...`,
          })
        },
        onApprovalDone: () => {
          toast.update(approvingId, { type: 'success', title: 'Approved', message: `${selectedToken.symbol} approved`, duration: 2000 })
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
        toast.success('Deposit Successful! 🎉', `${amount} ${selectedToken.symbol} deposited into ${vault.name}`, { duration: 8000 })
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
        toast.error('No Route Found', 'Try a different source token or chain.')
        setError('No deposit route found. Try a different source token or chain combination.')
      } else {
        toast.error('Deposit Failed', msg.slice(0, 120))
        setError(msg.slice(0, 120))
      }
    }
  }

  const showForm = txStep === 'idle' || txStep === 'switching' || txStep === 'approving' || txStep === 'depositing'

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={!isBusy ? onClose : undefined}
      />

      <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
        {/* ── Header ── */}
        <div className="px-6 pt-6 pb-4 border-b border-surface-container shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-headline font-extrabold text-xl text-on-surface">Deposit</h2>
              <p className="text-xs text-on-surface-variant mt-0.5 font-medium truncate max-w-[280px]">
                {vault?.name} · {getChainName(vaultChainId)} · {apyDisplay} APY
              </p>
            </div>
            <button
              onClick={onClose}
              disabled={isBusy}
              className="w-8 h-8 rounded-full bg-surface-container hover:bg-surface-container-high flex items-center justify-center transition-colors disabled:opacity-40"
            >
              <span className="material-symbols-outlined text-[16px] text-on-surface-variant">close</span>
            </button>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">

          {/* Cross-chain badge */}
          {isCrossChain && showForm && (
            <div className="flex items-center gap-3 p-3 bg-on-tertiary-container/5 border border-on-tertiary-container/20 rounded-xl">
              <span className="material-symbols-outlined text-on-tertiary-container text-[18px] shrink-0">bolt</span>
              <p className="text-xs font-medium text-on-surface">
                Cross-chain: Composer will bridge from <strong>{getChainName(sourceChainId)}</strong> → <strong>{getChainName(vaultChainId)}</strong> in one transaction.
              </p>
            </div>
          )}

          {/* ── Source chain picker ── */}
          {showForm && (
            <div className="space-y-3">
              <ChainPicker
                value={sourceChainId}
                onChange={handleSourceChainChange}
                label="Deposit from chain"
              />

              {/* Token picker */}
              <div>
                <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant block mb-2">
                  Token to deposit
                </label>
                <TokenPicker
                  tokens={tokens}
                  value={selectedToken}
                  onChange={setSelectedToken}
                  loading={loadingTokens}
                />
              </div>
            </div>
          )}

          {/* ── Amount input ── */}
          {showForm && selectedToken && !loadingTokens && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">
                  Amount
                </label>
                <span className="text-xs text-on-surface-variant font-medium">
                  Balance: <span className={selectedToken.balanceFloat > 0 ? 'text-on-tertiary-container font-bold' : ''}>
                    {selectedToken.formattedBalance}
                  </span> {selectedToken.symbol}
                </span>
              </div>

              <div className={`relative flex items-center border-2 rounded-xl transition-all ${
                hasInsufficientBalance
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
                  <button onClick={setHalf} disabled={isBusy || balanceFloat === 0}
                    className="px-2 py-1 text-[10px] font-black uppercase tracking-wider text-on-surface-variant bg-surface-container rounded-lg hover:bg-surface-container-high transition-colors disabled:opacity-40">
                    50%
                  </button>
                  <button onClick={setMax} disabled={isBusy || balanceFloat === 0}
                    className="px-2 py-1 text-[10px] font-black uppercase tracking-wider text-on-tertiary-container bg-on-tertiary-container/10 rounded-lg hover:bg-on-tertiary-container/20 transition-colors disabled:opacity-40">
                    MAX
                  </button>
                </div>
              </div>

              {hasInsufficientBalance && (
                <div className="flex items-center gap-2 text-red-600">
                  <span className="material-symbols-outlined text-[14px]">error</span>
                  <p className="text-xs font-bold">
                    Insufficient balance. You have {selectedToken.formattedBalance} {selectedToken.symbol}.
                  </p>
                </div>
              )}

              {isValid && apy != null && (
                <div className="flex items-center justify-between p-2.5 bg-on-tertiary-container/5 rounded-xl border border-on-tertiary-container/10">
                  <p className="text-xs text-on-surface-variant font-medium">Projected earnings</p>
                  <div className="text-right">
                    <p className="text-xs font-black text-on-tertiary-container">
                      +{(amountNum * apy / 12).toFixed(4)} {selectedToken.symbol}/mo
                    </p>
                    <p className="text-[10px] text-on-surface-variant">+{(amountNum * apy).toFixed(4)}/yr</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Error ── */}
          {error && txStep === 'idle' && (
            <div className="flex items-start gap-2 p-3 bg-error-container/20 border border-error-container rounded-xl">
              <span className="material-symbols-outlined text-error text-[16px] shrink-0 mt-0.5">error</span>
              <p className="text-xs font-medium text-on-error-container">{error}</p>
            </div>
          )}

          {/* ── Tx progress ── */}
          {isBusy && (
            <div className="space-y-2">
              {needsWalletSwitch && <StepIndicator label={`Switch to ${getChainName(sourceChainId)}`} status={txStep === 'switching' ? 'active' : 'done'} />}
              <StepIndicator label="Build Composer Route" status={txStep === 'approving' ? 'active' : txStep === 'depositing' ? 'done' : 'pending'} />
              <StepIndicator label="Approve Token" status={txStep === 'approving' ? 'active' : txStep === 'depositing' ? 'done' : 'pending'} />
              <StepIndicator label="Submit Deposit" status={txStep === 'depositing' ? 'active' : 'pending'} />
            </div>
          )}

          {/* ── Cross-chain pending ── */}
          {txStep === 'crosschain' && (
            <div className="text-center space-y-4 py-4">
              <div className="w-16 h-16 bg-on-tertiary-container/10 rounded-full flex items-center justify-center mx-auto">
                <span className="material-symbols-outlined text-on-tertiary-container text-3xl animate-spin">autorenew</span>
              </div>
              <h3 className="font-headline font-extrabold text-xl text-on-surface">Bridge In Progress</h3>
              <p className="text-sm text-on-surface-variant">
                {getChainName(sourceChainId)} → {getChainName(vaultChainId)}. Takes 1–5 minutes.
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

          {/* ── Done ── */}
          {txStep === 'done' && (
            <div className="text-center space-y-3 py-4">
              <div className="w-16 h-16 bg-on-tertiary-container/10 rounded-full flex items-center justify-center mx-auto">
                <span className="material-symbols-outlined text-on-tertiary-container text-3xl">check_circle</span>
              </div>
              <h3 className="font-headline font-extrabold text-xl text-on-surface">Deposit Complete!</h3>
              <p className="text-sm text-on-surface-variant">
                {amount} {selectedToken?.symbol} is now earning {apyDisplay} APY in {vault?.name}.
              </p>
            </div>
          )}

          {/* ── Action button ── */}
          {txStep !== 'done' && txStep !== 'crosschain' ? (
            <button
              onClick={handleDeposit}
              disabled={!isValid || isBusy || !selectedToken || loadingTokens}
              className={`w-full py-4 rounded-2xl font-headline font-black text-base transition-all flex items-center justify-center gap-2
                ${isValid && !isBusy && selectedToken && !loadingTokens
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
                  {amount
                    ? `Deposit ${amount} ${selectedToken?.symbol ?? ''} via Composer`
                    : 'Enter an amount'}
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[18px]">add_circle</span>
                  {amount
                    ? `Deposit ${amount} ${selectedToken?.symbol ?? ''}`
                    : 'Enter an amount'}
                </>
              )}
            </button>
          ) : txStep === 'crosschain' ? (
            <button
              onClick={() => { onSuccess?.({ vault, amount }); onClose() }}
              className="w-full py-4 rounded-2xl font-headline font-black text-base bg-surface-container text-on-surface-variant hover:bg-surface-container-high transition-all"
            >
              Close (Bridge Continuing)
            </button>
          ) : (
            <button
              onClick={onClose}
              className="w-full py-4 rounded-2xl font-headline font-black text-base bg-on-tertiary-container text-white hover:opacity-90 transition-all"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  )
}