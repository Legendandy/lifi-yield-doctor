// src/components/DepositModal.jsx
import { useState, useEffect, useRef, useCallback } from 'react'
import { useAccount, useSwitchChain } from 'wagmi'
import { useToast } from './ToastNotifications'
import { executeDeposit, validateComposerQuote } from '../services/executeDeposit'
import { getTokenBalancesOnChain, SUPPORTED_CHAINS, isNativeToken } from '../services/tokenBalances'

const CHAIN_NAMES = Object.fromEntries(SUPPORTED_CHAINS.map(c => [c.id, c.name]))
function getChainName(id) { return CHAIN_NAMES[id] ?? `Chain ${id}` }

function getLifiBase() {
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') return '/lifi-api'
  return 'https://li.quest'
}

// ─── Quote expiry timer (90 seconds) ─────────────────────────────────────────
const QUOTE_TTL = 90 // seconds

function QuoteExpiryTimer({ expiresAt, onExpired }) {
  const [secondsLeft, setSecondsLeft] = useState(() => {
    if (!expiresAt) return QUOTE_TTL
    return Math.max(0, Math.round((expiresAt - Date.now()) / 1000))
  })

  useEffect(() => {
    if (!expiresAt) return
    const tick = setInterval(() => {
      const left = Math.max(0, Math.round((expiresAt - Date.now()) / 1000))
      setSecondsLeft(left)
      if (left === 0) { clearInterval(tick); onExpired?.() }
    }, 1000)
    return () => clearInterval(tick)
  }, [expiresAt, onExpired])

  if (!expiresAt) return null

  const isUrgent = secondsLeft <= 20
  const progress = secondsLeft / QUOTE_TTL

  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-colors ${
      isUrgent ? 'bg-amber-50 border border-amber-200 text-amber-700' : 'bg-surface-container border border-surface-container-high text-on-surface-variant'
    }`}>
      <span className={`material-symbols-outlined text-[14px] ${isUrgent ? 'text-amber-500 animate-pulse' : 'text-on-surface-variant'}`}>
        timer
      </span>
      <span>Quote expires in <span className={`font-black tabular-nums ${isUrgent ? 'text-amber-700' : 'text-on-surface'}`}>{secondsLeft}s</span></span>
      {/* thin progress bar */}
      <div className="flex-1 h-1 bg-surface-container-high rounded-full overflow-hidden ml-1">
        <div
          className={`h-full rounded-full transition-all duration-1000 ${isUrgent ? 'bg-amber-400' : 'bg-on-tertiary-container/40'}`}
          style={{ width: `${progress * 100}%` }}
        />
      </div>
    </div>
  )
}

// ─── Poll status inside modal ─────────────────────────────────────────────────
async function pollStatusInModal(txHash, fromChain, toChain, onUpdate, maxAttempts = 72) {
  const apiKey = import.meta.env.VITE_LIFI_API_KEY
  const base   = getLifiBase()
  const headers = {}
  if (apiKey) headers['x-lifi-api-key'] = apiKey
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 5000))
    try {
      const params = new URLSearchParams({ txHash, fromChain: String(fromChain), toChain: String(toChain) })
      const res = await fetch(`${base}/v1/status?${params}`, { headers })
      if (!res.ok) continue
      const data = await res.json()
      onUpdate(data)
      if (data.status === 'DONE' || data.status === 'FAILED') return data
    } catch { /* keep polling */ }
  }
  return null
}

// ─── Slippage selector ────────────────────────────────────────────────────────
const SLIPPAGE_PRESETS = [
  { label: '0.1%', value: 0.001 },
  { label: '0.5%', value: 0.005 },
  { label: '1%',   value: 0.01  },
]

function SlippageSelector({ slippage, onChange, disabled }) {
  const [custom, setCustom] = useState('')
  const [showCustom, setShowCustom] = useState(false)
  const isPreset = SLIPPAGE_PRESETS.some(p => p.value === slippage)
  const pct = (slippage * 100).toFixed(1).replace(/\.0$/, '')
  const isHigh = slippage > 0.01

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">Slippage Tolerance</label>
        {isHigh && <span className="flex items-center gap-1 text-[10px] font-bold text-amber-600"><span className="material-symbols-outlined text-[12px]">warning</span>High slippage</span>}
      </div>
      <div className="flex items-center gap-2">
        {SLIPPAGE_PRESETS.map(p => (
          <button key={p.value} type="button" disabled={disabled}
            onClick={() => { setShowCustom(false); setCustom(''); onChange(p.value) }}
            className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all border-2 disabled:opacity-40 ${
              slippage === p.value && !showCustom
                ? 'bg-primary-container text-white border-primary-container'
                : 'border-surface-container-high text-on-surface-variant hover:border-primary-container/40'
            }`}>{p.label}</button>
        ))}
        <button type="button" disabled={disabled}
          onClick={() => setShowCustom(s => !s)}
          className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all border-2 disabled:opacity-40 ${
            showCustom || !isPreset ? 'bg-primary-container text-white border-primary-container' : 'border-surface-container-high text-on-surface-variant hover:border-primary-container/40'
          }`}>Custom</button>
        {(showCustom || !isPreset) && (
          <div className="relative">
            <input type="number" min="0.01" max="50" step="0.1"
              value={custom || pct}
              onChange={e => { setCustom(e.target.value); const n = parseFloat(e.target.value); if (!isNaN(n) && n > 0 && n <= 50) onChange(n / 100) }}
              className="w-20 px-2 py-1.5 pr-5 rounded-lg border-2 border-primary-container/40 bg-surface-container-low text-xs font-bold text-on-surface outline-none"
              placeholder="0.5" />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-on-surface-variant">%</span>
          </div>
        )}
      </div>
    </div>
  )
}

function StepIndicator({ label, status }) {
  return (
    <div className={`flex items-center gap-3 p-2.5 rounded-xl transition-all ${
      status === 'active' ? 'bg-primary-container/5 border border-primary-container/20' :
      status === 'done'   ? 'opacity-50' : 'opacity-30'}`}>
      {status === 'active'
        ? <span className="material-symbols-outlined text-primary-container text-[16px] animate-spin">progress_activity</span>
        : status === 'done'
          ? <span className="material-symbols-outlined text-on-tertiary-container text-[16px]">check_circle</span>
          : <span className="material-symbols-outlined text-on-surface-variant text-[16px]">radio_button_unchecked</span>}
      <p className={`text-sm font-bold ${status === 'active' ? 'text-on-surface' : 'text-on-surface-variant'}`}>{label}</p>
    </div>
  )
}

function SourcePicker({ onConfirm, vaultChainId, vaultUnderlyingToken, walletChainId, crossChainEnabled }) {
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

  useEffect(() => {
    function h(e) { if (chainPickerRef.current && !chainPickerRef.current.contains(e.target)) setShowChainPicker(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  useEffect(() => {
    if (!address || !selectedChainId) return
    setLoadingTokens(true); setSelectedToken(null); setSearch(''); setTokens([])
    getTokenBalancesOnChain(address, selectedChainId)
      .then(list => {
        setTokens(list)
        const sym = vaultUnderlyingToken?.symbol?.toUpperCase()
        const bySymbol = sym ? list.find(t => t.symbol?.toUpperCase() === sym) : null
        const withBal  = list.find(t => t.balanceFloat > 0)
        setSelectedToken(bySymbol ?? withBal ?? list[0] ?? null)
      })
      .catch(() => setTokens([]))
      .finally(() => setLoadingTokens(false))
  }, [address, selectedChainId])

  async function handleChainSelect(chainId) {
    setShowChainPicker(false)
    if (chainId === selectedChainId) return
    setSwitchingChain(true)
    try { await switchChainAsync({ chainId }) } catch { /* user rejected */ }
    finally { setSwitchingChain(false) }
    setSelectedChainId(chainId)
  }

  const filtered = tokens.filter(t =>
    !search || t.symbol?.toLowerCase().includes(search.toLowerCase()) || t.name?.toLowerCase().includes(search.toLowerCase()))
  const isCrossChain = selectedChainId !== vaultChainId
  const availableChains = crossChainEnabled ? SUPPORTED_CHAINS : SUPPORTED_CHAINS.filter(c => c.id === vaultChainId)

  return (
    <div className="flex flex-col gap-4">
      {!crossChainEnabled && (
        <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
          <span className="material-symbols-outlined text-amber-500 text-[16px]">info</span>
          <p className="text-xs font-medium text-amber-800">Same-chain deposits only. Cross-chain not available for this vault.</p>
        </div>
      )}

      <div>
        <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant block mb-2">Deposit from chain</label>
        <div className="relative" ref={chainPickerRef}>
          <button type="button"
            onClick={() => crossChainEnabled && setShowChainPicker(o => !o)}
            disabled={switchingChain || !crossChainEnabled}
            className={`w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl border-2 border-surface-container-high bg-surface-container-low transition-all text-left
              ${crossChainEnabled ? 'hover:border-primary-container/40' : 'opacity-60 cursor-not-allowed'}`}>
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-bold text-sm text-on-surface truncate">{getChainName(selectedChainId)}</span>
              {selectedChainId === walletChainId && <span className="text-[10px] bg-on-tertiary-container/10 text-on-tertiary-container px-2 py-0.5 rounded-full font-black shrink-0">Wallet</span>}
              {isCrossChain && <span className="text-[10px] bg-on-tertiary-container/10 text-on-tertiary-container px-2 py-0.5 rounded-full font-black shrink-0 flex items-center gap-0.5"><span className="material-symbols-outlined text-[11px]">bolt</span>Cross-chain</span>}
            </div>
            {switchingChain
              ? <span className="material-symbols-outlined text-[16px] text-on-surface-variant animate-spin shrink-0">progress_activity</span>
              : crossChainEnabled
                ? <span className="material-symbols-outlined text-[16px] text-on-surface-variant shrink-0">expand_more</span>
                : <span className="material-symbols-outlined text-[16px] text-on-surface-variant shrink-0">lock</span>}
          </button>
          {showChainPicker && crossChainEnabled && (
            <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-2xl shadow-2xl border border-surface-container z-[200] overflow-hidden">
              <div className="grid grid-cols-2 gap-1 p-2 max-h-48 overflow-y-auto">
                {availableChains.map(chain => (
                  <button key={chain.id} type="button" onClick={() => handleChainSelect(chain.id)}
                    className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-left transition-colors text-sm font-bold
                      ${chain.id === selectedChainId ? 'bg-primary-container text-white' : 'text-on-surface hover:bg-surface-container'}`}>
                    <span className="truncate">{chain.name}</span>
                    {chain.id === walletChainId && chain.id !== selectedChainId && <span className="w-1.5 h-1.5 rounded-full bg-on-tertiary-container shrink-0" />}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        {isCrossChain && crossChainEnabled && (
          <p className="mt-1.5 text-[11px] text-on-tertiary-container font-semibold px-1 leading-tight">
            ⚡ Composer bridges {getChainName(selectedChainId)} → {getChainName(vaultChainId)} and deposits in one tx.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2 min-h-0">
        <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant shrink-0">Token to deposit</label>
        {loadingTokens ? (
          <div className="space-y-2 animate-pulse">{[1,2,3,4].map(i => <div key={i} className="h-12 bg-surface-container rounded-xl" />)}</div>
        ) : (
          <>
            <div className="relative shrink-0">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-[14px] text-on-surface-variant">search</span>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search token…"
                className="w-full pl-8 pr-3 py-2 rounded-xl border border-surface-container-high bg-surface-container-low text-sm focus:outline-none focus:ring-2 focus:ring-primary-container/20 font-medium" />
            </div>
            <div className="overflow-y-auto space-y-0.5" style={{ maxHeight: '168px' }}>
              {filtered.length === 0 && <p className="text-center text-sm text-on-surface-variant py-4">No tokens found</p>}
              {filtered.map((token, i) => {
                const hasBal = token.balanceFloat > 0
                const isSelected = selectedToken?.address?.toLowerCase() === token.address?.toLowerCase()
                return (
                  <button key={token.address + i} type="button" onClick={() => setSelectedToken(token)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left border-2
                      ${isSelected ? 'border-primary-container/40 bg-primary-container/5' : 'border-transparent hover:bg-surface-container'}`}>
                    {token.logoURI
                      ? <img src={token.logoURI} alt={token.symbol} className="w-8 h-8 rounded-full shrink-0 object-cover" onError={e => { e.target.style.display='none' }} />
                      : <div className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-xs font-black text-on-surface-variant shrink-0">{token.symbol?.[0] ?? '?'}</div>}
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm text-on-surface">{token.symbol}</p>
                      <p className="text-[10px] text-on-surface-variant truncate">{token.name}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`font-bold text-sm ${hasBal ? 'text-on-surface' : 'text-on-surface-variant/50'}`}>{token.formattedBalance}</p>
                      {hasBal && <div className="w-1.5 h-1.5 rounded-full bg-on-tertiary-container ml-auto mt-0.5" />}
                    </div>
                  </button>
                )
              })}
            </div>
          </>
        )}
      </div>

      <button type="button"
        onClick={() => selectedToken && onConfirm({ chainId: selectedChainId, token: selectedToken })}
        disabled={!selectedToken || loadingTokens}
        className={`w-full py-3.5 rounded-2xl font-headline font-black text-sm transition-all flex items-center justify-center gap-2 shrink-0
          ${selectedToken && !loadingTokens ? 'bg-primary-container text-white hover:opacity-90 shadow-md' : 'bg-surface-container text-on-surface-variant cursor-not-allowed'}`}>
        <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
        {selectedToken ? `Continue with ${selectedToken.symbol}` : 'Select a token'}
      </button>
    </div>
  )
}

// ─── Amount + Execute ─────────────────────────────────────────────────────────
function AmountStep({ vault, sourceChainId, sourceToken, onBack, onSuccess, onClose }) {
  const { address, chainId: walletChainId } = useAccount()
  const { switchChainAsync } = useSwitchChain()
  const toast = useToast()

  const [amount, setAmount]                     = useState('')
  const [slippage, setSlippage]                 = useState(0.005)
  const [txStep, setTxStep]                     = useState('idle')
  const [error, setError]                       = useState(null)
  const [crossChainTxHash, setCrossChainTxHash] = useState(null)
  const [crossChainStatus, setCrossChainStatus] = useState(null)

  // Preview quote state
  const [previewQuote, setPreviewQuote]           = useState(null)
  const [previewLoading, setPreviewLoading]       = useState(false)
  const [previewError, setPreviewError]           = useState(null)
  const [composerSupported, setComposerSupported] = useState(null)
  const [quoteExpiresAt, setQuoteExpiresAt]       = useState(null) // timestamp ms
  const [quoteExpired, setQuoteExpired]           = useState(false)

  const inputRef = useRef(null)
  const debounceRef = useRef(null)

  const isCrossChain      = sourceChainId !== vault.chainId
  const needsWalletSwitch = walletChainId !== sourceChainId

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 100) }, [])

  const apy        = vault?.analytics?.apy?.total
  const apyDisplay = apy != null ? `${apy.toFixed(2)}%` : 'N/A'
  const amountNum  = parseFloat(amount) || 0
  const balFloat   = sourceToken?.balanceFloat ?? 0
  const hasInsuf   = amountNum > 0 && amountNum > balFloat
  const isValid    = amountNum > 0 && !hasInsuf && amount.trim() !== ''
  const isBusy     = ['switching', 'approving', 'depositing'].includes(txStep)

  const quoteReady = previewQuote !== null && composerSupported === true && !previewLoading && !quoteExpired
  const depositEnabled = isValid && !isBusy && quoteReady

  function toRaw(human, decimals) {
    if (!human || isNaN(parseFloat(human))) return '0'
    const [whole, frac = ''] = String(human).split('.')
    const fp = frac.padEnd(decimals, '0').slice(0, decimals)
    return (BigInt(whole || '0') * BigInt(10 ** decimals) + BigInt(fp || '0')).toString()
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

  // Handle quote expiry — reset so user must re-enter amount or wait for re-fetch
  const handleQuoteExpired = useCallback(() => {
    setQuoteExpired(true)
    setPreviewQuote(null)
    setComposerSupported(null)
    setQuoteExpiresAt(null)
  }, [])

  // Debounced preview quote fetch
  useEffect(() => {
    if (!isValid || !sourceToken || !vault?.address) {
      setPreviewQuote(null); setPreviewError(null); setComposerSupported(null)
      setQuoteExpiresAt(null); setQuoteExpired(false)
      return
    }
    setPreviewLoading(true); setPreviewError(null); setPreviewQuote(null)
    setComposerSupported(null); setQuoteExpiresAt(null); setQuoteExpired(false)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        const apiKey  = import.meta.env.VITE_LIFI_API_KEY
        const base    = getLifiBase()
        const rawAmt  = toRaw(amount, sourceToken.decimals)
        const headers = { 'Content-Type': 'application/json' }
        if (apiKey) headers['x-lifi-api-key'] = apiKey
        const params = new URLSearchParams({
          fromChain:  String(sourceChainId),
          toChain:    String(vault.chainId),
          fromToken:  sourceToken.address,
          toToken:    vault.address,
          fromAddress: address,
          toAddress:  address,
          fromAmount: rawAmt,
          slippage:   String(slippage),
          integrator: 'yield-doctor',
        })
        const res = await fetch(`${base}/v1/quote?${params}`, { headers })
        if (!res.ok) {
          const txt = await res.text().catch(() => '')
          if (res.status === 404 || txt.toLowerCase().includes('no routes')) {
            setComposerSupported(false)
            setPreviewError('No Composer route found. Try the same chain as the vault or a different token.')
          } else {
            setPreviewError(`Quote unavailable (${res.status}).`)
          }
          setPreviewLoading(false); return
        }
        const q = await res.json()

        const valid = q?.action?.toToken?.address?.toLowerCase() === vault.address?.toLowerCase()
        if (!valid) {
          const returnedSymbol = q?.action?.toToken?.symbol ?? '?'
          setComposerSupported(false)
          setPreviewError(
            `Cross-chain deposit not available for this vault via Composer. ` +
            `The route would only bridge funds as ${returnedSymbol} on the destination chain — ` +
            `NOT deposit them into the vault. Use same-chain deposit instead.`
          )
          setPreviewQuote(null)
        } else {
          setComposerSupported(true)
          setPreviewQuote(q)
          setPreviewError(null)
          // Start the 90-second expiry clock from when we received the quote
          setQuoteExpiresAt(Date.now() + QUOTE_TTL * 1000)
          setQuoteExpired(false)
        }
      } catch {
        setPreviewError('Could not fetch quote.')
      } finally {
        setPreviewLoading(false)
      }
    }, 800)
    return () => clearTimeout(debounceRef.current)
  }, [amount, slippage, sourceToken, sourceChainId, vault?.address, vault?.chainId, address, isValid])

  // Re-fetch quote after expiry automatically
  useEffect(() => {
    if (!quoteExpired) return
    if (!isValid || !sourceToken || !vault?.address) return
    // Trigger re-fetch by touching previewLoading state
    const timer = setTimeout(() => {
      setQuoteExpired(false)
      setPreviewLoading(true); setPreviewError(null); setPreviewQuote(null)
      setComposerSupported(null); setQuoteExpiresAt(null)
      // The main effect will pick up naturally — we just need the deps to re-run
      // We'll force it by resetting a key piece of state that the effect watches
    }, 100)
    return () => clearTimeout(timer)
  }, [quoteExpired])

  const minReceived = previewQuote?.estimate?.toAmountMin
    ? (() => {
        try {
          const dec  = previewQuote.action?.toToken?.decimals ?? 18
          const human = Number(BigInt(previewQuote.estimate.toAmountMin)) / 10 ** dec
          const sym  = previewQuote.action?.toToken?.symbol ?? ''
          return `${human.toFixed(4)} ${sym}`
        } catch { return null }
      })()
    : null

  const priceImpact = previewQuote?.estimate
    ? (() => {
        try {
          const fromUSD = parseFloat(previewQuote.estimate.fromAmountUSD ?? '0')
          const toUSD   = parseFloat(previewQuote.estimate.toAmountUSD   ?? '0')
          if (!fromUSD || !toUSD) return null
          return ((fromUSD - toUSD) / fromUSD) * 100
        } catch { return null }
      })()
    : null

  async function handleDeposit() {
    if (!depositEnabled) return
    setError(null)
    let approvingId = null
    try {
      if (walletChainId !== sourceChainId) {
        setTxStep('switching')
        try { await switchChainAsync({ chainId: sourceChainId }) }
        catch (err) {
          setTxStep('idle')
          const rej = err?.message?.toLowerCase().includes('rejected')
          setError(rej ? 'Please approve the network switch.' : `Could not switch to ${getChainName(sourceChainId)}.`)
          toast.error('Network Switch Failed', rej ? 'You rejected the switch.' : 'Failed to switch.')
          return
        }
      }
      setTxStep('approving')
      const rawAmount = toRaw(amount, sourceToken.decimals)
      approvingId = toast.loading('Preparing Deposit', 'Building transaction via Composer...')

      const result = await executeDeposit({
        vault, fromToken: sourceToken, fromAmount: rawAmount,
        userAddress: address, fromChainId: sourceChainId, slippage,
        onApprovalSent: () => {
          toast.update(approvingId, { type: 'loading', title: 'Approve Token', message: `Approving ${sourceToken.symbol}...` })
        },
        onApprovalDone: () => {
          toast.update(approvingId, { type: 'success', title: 'Approved', message: `${sourceToken.symbol} approved`, duration: 2000 })
          approvingId = null; setTxStep('depositing')
        },
        onDepositSent: (txHash) => {
          if (approvingId) { toast.dismiss(approvingId); approvingId = null }
          isCrossChain
            ? toast.tx('Cross-Chain Deposit Sent', txHash, { title: 'Bridge + Deposit In Progress' })
            : toast.tx('Deposit Submitted', txHash, { title: 'Transaction Sent' })
          setTxStep('depositing')
        },
        onCrossChainPending: (txHash) => {
          setCrossChainTxHash(txHash); setTxStep('crosschain')
        },
      })

      if (approvingId) { toast.dismiss(approvingId); approvingId = null }

      if (!result.isCrossChain) {
        setTxStep('done')
        toast.success('Deposit Successful! 🎉', `${amount} ${sourceToken.symbol} deposited into ${vault.name}`, { duration: 8000 })
        onSuccess?.({ vault, amount, txHash: result?.txHash })
      } else {
        setTxStep('crosschain')
        setCrossChainTxHash(result.txHash)
        const from = sourceChainId, to = vault.chainId, hash = result.txHash
        pollStatusInModal(hash, from, to, (statusData) => {
          setCrossChainStatus(statusData)
          const s = statusData.status, sub = statusData.substatus
          if (s === 'DONE' && sub === 'COMPLETED') {
            setTxStep('done')
            toast.success('Deposit Complete! 🎉', `Funds deposited into ${vault.name} on ${getChainName(to)}`, { duration: 8000 })
            onSuccess?.({ vault, amount, txHash: hash })
          } else if (s === 'DONE' && sub === 'PARTIAL') {
            setTxStep('partial')
          } else if (s === 'DONE' && sub === 'REFUNDED') {
            setTxStep('refunded')
          } else if (s === 'FAILED') {
            const msg = sub ?? 'UNKNOWN_ERROR'
            setTxStep('failed')
            setError(`Bridge failed: ${msg.toLowerCase().replace(/_/g, ' ')}`)
            toast.error('Bridge Failed', msg.toLowerCase().replace(/_/g, ' '))
          }
        })
      }
    } catch (err) {
      if (approvingId) { toast.dismiss(approvingId); approvingId = null }
      const msg = err?.message ?? ''
      if (msg.startsWith('COMPOSER_NOT_TRIGGERED:')) {
        const sym = msg.split(':')[1] ?? 'tokens'
        setTxStep('idle')
        setError(
          `Cross-chain deposit via Composer is not available for this vault. ` +
          `The best available route would only bridge your funds as ${sym} to the destination chain without depositing into the vault. ` +
          `Please select the same chain as the vault and deposit directly.`
        )
        toast.error('Vault Not Supported Cross-Chain', 'Use same-chain deposit instead.')
        return
      }
      const isRejected = msg.toLowerCase().includes('user rejected') || msg.toLowerCase().includes('rejected')
      setTxStep('idle')
      if (isRejected) {
        toast.error('Transaction Rejected', 'You cancelled the transaction.')
        setError('Transaction was rejected.')
      } else if (msg.includes('NO_ROUTES') || msg.includes('no routes')) {
        toast.error('No Route Found', 'Try a different token or use same-chain deposit.')
        setError('No deposit route found. Try depositing from the same chain as the vault.')
      } else {
        toast.error('Deposit Failed', msg.slice(0, 120))
        setError(msg.slice(0, 120))
      }
    }
  }

  const substatusLabel = crossChainStatus?.substatus
    ? crossChainStatus.substatus.toLowerCase().replace(/_/g, ' ')
    : 'waiting for bridge...'

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
          <span className="material-symbols-outlined text-on-tertiary-container text-[20px]">{isCrossChain ? 'bolt' : 'arrow_forward'}</span>
          <p className="text-[9px] font-black uppercase text-on-surface-variant">{isCrossChain ? 'Composer' : 'Direct'}</p>
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

      {needsWalletSwitch && txStep === 'idle' && (
        <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
          <span className="material-symbols-outlined text-amber-500 text-[16px]">swap_horiz</span>
          <p className="text-xs font-medium text-amber-800">Your wallet is on {getChainName(walletChainId)}. We'll switch to {getChainName(sourceChainId)} before depositing.</p>
        </div>
      )}

      {/* Amount input */}
      {!['done','crosschain','partial','refunded','failed'].includes(txStep) && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">Amount ({sourceToken.symbol})</label>
            <span className="text-xs font-medium text-on-surface-variant">
              Balance: <span className={balFloat > 0 ? 'text-on-tertiary-container font-bold' : ''}>{sourceToken.formattedBalance}</span> {sourceToken.symbol}
            </span>
          </div>

          <div className={`relative flex items-center border-2 rounded-xl transition-all ${
            hasInsuf ? 'border-red-400 bg-red-50'
            : amount && isValid ? 'border-on-tertiary-container/50 bg-surface-container-low'
            : 'border-surface-container-high bg-surface-container-low hover:border-primary-container/40'}`}>
            <input ref={inputRef} type="number" min="0" step="any" value={amount}
              onChange={e => { setError(null); setAmount(e.target.value); setPreviewQuote(null); setComposerSupported(null); setQuoteExpiresAt(null); setQuoteExpired(false) }}
              placeholder="0.00" disabled={isBusy}
              className="flex-1 px-4 py-3.5 bg-transparent text-xl font-headline font-black text-on-surface outline-none placeholder:text-on-surface-variant/40 disabled:opacity-50" />
            <div className="flex items-center gap-1 pr-3">
              <button onClick={setHalf} disabled={isBusy || balFloat === 0}
                className="px-2 py-1 text-[10px] font-black uppercase text-on-surface-variant bg-surface-container rounded-lg hover:bg-surface-container-high transition-colors disabled:opacity-40">50%</button>
              <button onClick={setMax} disabled={isBusy || balFloat === 0}
                className="px-2 py-1 text-[10px] font-black uppercase text-on-tertiary-container bg-on-tertiary-container/10 rounded-lg hover:bg-on-tertiary-container/20 transition-colors disabled:opacity-40">MAX</button>
            </div>
          </div>

          {hasInsuf && (
            <div className="flex items-center gap-2 text-red-600">
              <span className="material-symbols-outlined text-[14px]">error</span>
              <p className="text-xs font-bold">Insufficient balance. You have {sourceToken.formattedBalance} {sourceToken.symbol}.</p>
            </div>
          )}

          {/* Slippage */}
          {isValid && !isBusy && <SlippageSelector slippage={slippage} onChange={v => { setSlippage(v); setPreviewQuote(null); setComposerSupported(null); setQuoteExpiresAt(null); setQuoteExpired(false) }} disabled={isBusy} />}

          {/* Quote preview box */}
          {isValid && !isBusy && (
            <div className="p-3 bg-surface-container rounded-xl space-y-1.5 border border-surface-container-high">
              {/* Loading state */}
              {previewLoading && (
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[14px] text-on-surface-variant animate-spin">progress_activity</span>
                  <p className="text-xs text-on-surface-variant">Checking Composer route...</p>
                </div>
              )}

              {/* Quote expired notice */}
              {!previewLoading && quoteExpired && (
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-amber-500 text-[14px] animate-spin">progress_activity</span>
                  <p className="text-xs text-amber-700 font-medium">Quote expired — fetching fresh quote...</p>
                </div>
              )}

              {/* Composer not supported error */}
              {!previewLoading && !quoteExpired && previewError && composerSupported === false && (
                <div className="flex items-start gap-2">
                  <span className="material-symbols-outlined text-error text-[15px] shrink-0 mt-0.5">block</span>
                  <p className="text-xs font-medium text-error">{previewError}</p>
                </div>
              )}

              {/* General quote error */}
              {!previewLoading && !quoteExpired && previewError && composerSupported !== false && (
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-amber-500 text-[14px]">warning</span>
                  <p className="text-xs text-amber-700">{previewError}</p>
                </div>
              )}

              {/* Quote loaded OK */}
              {!previewLoading && !quoteExpired && previewQuote && composerSupported === true && (
                <>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-on-surface-variant font-medium">Minimum received</span>
                    <span className="font-black text-on-surface">{minReceived ?? '—'}</span>
                  </div>
                  {priceImpact !== null && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-on-surface-variant font-medium">Price impact</span>
                      <span className={`font-black ${priceImpact > 2 ? 'text-error' : priceImpact > 0.5 ? 'text-amber-600' : 'text-on-tertiary-container'}`}>
                        {priceImpact > 0 ? `-${priceImpact.toFixed(2)}%` : '~0%'}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-on-surface-variant font-medium">Max slippage</span>
                    <span className="font-black text-on-surface">{(slippage * 100).toFixed(1)}%</span>
                  </div>
                  <div className="flex items-center gap-1 pt-0.5">
                    <span className="material-symbols-outlined text-on-tertiary-container text-[12px]">check_circle</span>
                    {/* ✅ Fixed text: matches withdrawal modal exactly */}
                    <p className="text-[10px] font-bold text-on-tertiary-container">Route confirmed via Composer</p>
                  </div>

                  {/* ⏱ Quote expiry timer */}
                  {quoteExpiresAt && (
                    <div className="pt-1">
                      <QuoteExpiryTimer expiresAt={quoteExpiresAt} onExpired={handleQuoteExpired} />
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* High price impact warning */}
          {priceImpact !== null && priceImpact > 2 && composerSupported === true && (
            <div className="flex items-center gap-2 p-3 bg-error/5 border border-error/20 rounded-xl">
              <span className="material-symbols-outlined text-error text-[16px] shrink-0">warning</span>
              <p className="text-xs font-medium text-on-error-container">High price impact ({priceImpact.toFixed(2)}%). You may receive significantly less than expected.</p>
            </div>
          )}

          {/* Projected earnings */}
          {isValid && apy != null && composerSupported === true && !quoteExpired && (
            <div className="flex items-center justify-between p-2.5 bg-on-tertiary-container/5 rounded-xl border border-on-tertiary-container/10">
              <p className="text-xs text-on-surface-variant font-medium">Projected earnings</p>
              <div className="text-right">
                <p className="text-xs font-black text-on-tertiary-container">+{(amountNum * apy / 100 / 12).toFixed(4)} {sourceToken.symbol}/mo</p>
                <p className="text-[10px] text-on-surface-variant">+{(amountNum * apy / 100).toFixed(4)}/yr</p>
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
          <p className="text-sm text-on-surface-variant">{getChainName(sourceChainId)} → {getChainName(vault.chainId)}. Takes 1–5 minutes.</p>
          <div className="p-3 bg-surface-container rounded-xl text-left space-y-1">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[14px] text-on-surface-variant animate-pulse">pending</span>
              <p className="text-xs font-bold text-on-surface capitalize">{substatusLabel}</p>
            </div>
            {crossChainStatus?.substatus === 'WAIT_DESTINATION_TRANSACTION' && <p className="text-[11px] text-on-surface-variant pl-5">Funds bridged — executing vault deposit on destination...</p>}
            {crossChainStatus?.substatus === 'WAIT_SOURCE_CONFIRMATIONS' && <p className="text-[11px] text-on-surface-variant pl-5">Waiting for source chain confirmations...</p>}
          </div>
          {crossChainTxHash && (
            <a href={`https://explorer.li.fi/?txHash=${crossChainTxHash}`} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-on-tertiary-container font-bold hover:underline">
              <span className="material-symbols-outlined text-[14px]">open_in_new</span>Track on LI.FI Explorer
            </a>
          )}
          <p className="text-[10px] text-on-surface-variant">This modal updates automatically when the deposit completes.</p>
        </div>
      )}

      {/* Done */}
      {txStep === 'done' && (
        <div className="text-center space-y-3 py-4">
          <div className="w-16 h-16 bg-on-tertiary-container/10 rounded-full flex items-center justify-center mx-auto">
            <span className="material-symbols-outlined text-on-tertiary-container text-3xl">check_circle</span>
          </div>
          <h3 className="font-headline font-extrabold text-xl text-on-surface">Deposit Complete!</h3>
          <p className="text-sm text-on-surface-variant">{amount} {sourceToken?.symbol} is now earning {apyDisplay} APY in {vault?.name}.</p>
          {crossChainTxHash && (
            <a href={`https://explorer.li.fi/?txHash=${crossChainTxHash}`} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-on-tertiary-container font-bold hover:underline">
              <span className="material-symbols-outlined text-[14px]">open_in_new</span>View on LI.FI Explorer
            </a>
          )}
        </div>
      )}

      {/* Partial */}
      {txStep === 'partial' && (
        <div className="text-center space-y-4 py-4">
          <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto">
            <span className="material-symbols-outlined text-amber-600 text-3xl">warning</span>
          </div>
          <h3 className="font-headline font-extrabold text-xl text-on-surface">Bridge Succeeded, Deposit Incomplete</h3>
          <p className="text-sm text-on-surface-variant leading-relaxed">
            Your funds were bridged to {getChainName(vault.chainId)}, but the vault deposit step did not complete.
            You should have the bridged tokens in your wallet on {getChainName(vault.chainId)}.
          </p>
          {crossChainTxHash && (
            <a href={`https://explorer.li.fi/?txHash=${crossChainTxHash}`} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-amber-700 font-bold hover:underline">
              <span className="material-symbols-outlined text-[14px]">open_in_new</span>View full status on LI.FI Explorer
            </a>
          )}
        </div>
      )}

      {/* Refunded */}
      {txStep === 'refunded' && (
        <div className="text-center space-y-3 py-4">
          <div className="w-16 h-16 bg-surface-container rounded-full flex items-center justify-center mx-auto">
            <span className="material-symbols-outlined text-on-surface-variant text-3xl">undo</span>
          </div>
          <h3 className="font-headline font-extrabold text-xl text-on-surface">Transaction Refunded</h3>
          <p className="text-sm text-on-surface-variant">Your funds were refunded to your wallet on {getChainName(sourceChainId)}.</p>
        </div>
      )}

      {/* Failed */}
      {txStep === 'failed' && (
        <div className="text-center space-y-3 py-4">
          <div className="w-16 h-16 bg-error/10 rounded-full flex items-center justify-center mx-auto">
            <span className="material-symbols-outlined text-error text-3xl">error</span>
          </div>
          <h3 className="font-headline font-extrabold text-xl text-on-surface">Bridge Failed</h3>
          <p className="text-sm text-on-surface-variant">The cross-chain transfer failed. Your funds should be automatically refunded.</p>
          {error && <p className="text-xs text-error font-medium">{error}</p>}
          {crossChainTxHash && (
            <a href={`https://explorer.li.fi/?txHash=${crossChainTxHash}`} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-error font-bold hover:underline">
              <span className="material-symbols-outlined text-[14px]">open_in_new</span>Check status on LI.FI Explorer
            </a>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2">
        {!['done','crosschain','partial','refunded','failed'].includes(txStep) && !isBusy && (
          <button type="button" onClick={onBack}
            className="px-4 py-4 rounded-2xl font-headline font-black text-sm border-2 border-surface-container-high text-on-surface-variant hover:border-primary-container/40 transition-all flex items-center">
            <span className="material-symbols-outlined text-[16px]">arrow_back</span>
          </button>
        )}

        {!['done','crosschain','partial','refunded','failed'].includes(txStep) ? (
          <button onClick={handleDeposit} disabled={!depositEnabled}
            className={`flex-1 py-4 rounded-2xl font-headline font-black text-sm transition-all flex items-center justify-center gap-2
              ${depositEnabled ? 'bg-primary-container text-white hover:opacity-90 shadow-md' : 'bg-surface-container text-on-surface-variant cursor-not-allowed'}`}>
            {isBusy ? (
              <>
                <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
                {txStep === 'switching' && `Switching to ${getChainName(sourceChainId)}...`}
                {txStep === 'approving' && 'Preparing...'}
                {txStep === 'depositing' && 'Depositing...'}
              </>
            ) : previewLoading && isValid ? (
              <>
                <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
                Checking route...
              </>
            ) : quoteExpired && isValid ? (
              <>
                <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
                Refreshing quote...
              </>
            ) : composerSupported === false ? (
              <>
                <span className="material-symbols-outlined text-[18px]">block</span>
                Cross-chain not supported for this vault
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
        ) : txStep === 'failed' ? (
          <div className="flex gap-2 w-full">
            <button onClick={() => { setTxStep('idle'); setError(null); setCrossChainTxHash(null); setCrossChainStatus(null) }}
              className="flex-1 py-4 rounded-2xl font-headline font-black text-base bg-surface-container text-on-surface-variant hover:bg-surface-container-high transition-all">
              Try Again
            </button>
            <button onClick={onClose}
              className="flex-1 py-4 rounded-2xl font-headline font-black text-base border-2 border-surface-container-high text-on-surface-variant hover:border-primary-container/40 transition-all">
              Close
            </button>
          </div>
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

// ─── Main Modal ───────────────────────────────────────────────────────────────
export default function DepositModal({ vault, onClose, onSuccess }) {
  const { chainId: walletChainId } = useAccount()
  const [modalStep, setModalStep] = useState('pick-source')
  const [source, setSource]       = useState(null)
  const crossChainEnabled = vault?.isTransactional !== false

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={modalStep === 'pick-source' ? onClose : undefined} />
      <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl flex flex-col" style={{ maxHeight: '92vh' }}>
        <div className="px-6 pt-6 pb-4 border-b border-surface-container shrink-0">
          <div className="flex items-center justify-between">
            <div className="min-w-0 pr-4">
              <h2 className="font-headline font-extrabold text-xl text-on-surface">
                {modalStep === 'pick-source' ? 'Choose Source' : 'Deposit'}
              </h2>
              <p className="text-xs text-on-surface-variant mt-0.5 font-medium truncate">
                {vault?.name} · {getChainName(vault?.chainId)}
                {vault?.analytics?.apy?.total != null ? ` · ${(vault.analytics.apy.total).toFixed(2)}% APY` : ''}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {crossChainEnabled
                ? <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest bg-on-tertiary-container/10 text-on-tertiary-container px-2 py-1 rounded-full"><span className="material-symbols-outlined text-[10px]">bolt</span>Composer</span>
                : <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest bg-surface-container text-on-surface-variant px-2 py-1 rounded-full"><span className="material-symbols-outlined text-[10px]">lock</span>Same-chain only</span>}
              <button onClick={onClose} className="w-8 h-8 rounded-full bg-surface-container hover:bg-surface-container-high flex items-center justify-center transition-colors">
                <span className="material-symbols-outlined text-[16px] text-on-surface-variant">close</span>
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-3">
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${modalStep === 'pick-source' ? 'bg-primary-container text-white' : 'bg-on-tertiary-container text-white'}`}>
              {modalStep !== 'pick-source' && <span className="material-symbols-outlined text-[10px]">check</span>}
              1. Source
            </div>
            <span className="material-symbols-outlined text-[14px] text-on-surface-variant">chevron_right</span>
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${modalStep === 'amount' ? 'bg-primary-container text-white' : 'bg-surface-container text-on-surface-variant'}`}>
              2. Amount
            </div>
          </div>
        </div>
        <div className="p-6 overflow-y-auto flex-1">
          {modalStep === 'pick-source'
            ? <SourcePicker onConfirm={src => { setSource(src); setModalStep('amount') }}
                vaultChainId={vault?.chainId} vaultUnderlyingToken={vault?.underlyingTokens?.[0]}
                walletChainId={walletChainId} crossChainEnabled={crossChainEnabled} />
            : <AmountStep vault={vault} sourceChainId={source.chainId} sourceToken={source.token}
                onBack={() => setModalStep('pick-source')} onSuccess={onSuccess} onClose={onClose} />}
        </div>
      </div>
    </div>
  )
}