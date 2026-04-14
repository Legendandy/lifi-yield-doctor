// src/components/WithdrawModal.jsx
import { useState, useEffect, useRef, useCallback } from 'react'
import { useAccount, useSwitchChain } from 'wagmi'
import { formatUnits } from 'viem'
import { getTokens, getTokenBalances } from '@lifi/sdk'
import { ethers } from 'ethers'
import { useToast } from './ToastNotifications'
import {
  resolveWithdrawFromToken,
  resolveWithdrawFromDecimals,
  resolveWithdrawFromSymbol,
  getWithdrawQuote,
  executeWithdraw,
} from '../services/executeWithdraw'
import { SUPPORTED_CHAINS } from '../services/tokenBalances'

const CHAIN_MAP = Object.fromEntries(SUPPORTED_CHAINS.map(c => [c.id, c.name]))
const getChainName = (id) => CHAIN_MAP[id] ?? `Chain ${id}`

function getLifiBase() {
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') return '/lifi-api'
  return 'https://li.quest'
}

function fmtBalance(f, symbol) {
  if (!f || f === 0) return '0.00'
  const stable = symbol && /^(USD|EUR|DAI|FRAX|LUSD|SUSD|BUSD|TUSD|PYUSD)/i.test(symbol)
  if (stable) return f.toFixed(2)
  if (f < 0.0001) return f.toFixed(8)
  if (f < 1) return f.toFixed(6)
  if (f < 1000) return f.toFixed(4)
  return f.toLocaleString(undefined, { maximumFractionDigits: 4 })
}

function parseBalanceNative(balanceNative, lpDecimals) {
  if (!balanceNative || balanceNative === '0') return { humanBalance: 0, rawBalance: '0' }
  const str = String(balanceNative).trim()
  if (str.includes('.')) {
    const humanBalance = parseFloat(str) || 0
    const raw = BigInt(Math.round(humanBalance * 10 ** Math.min(lpDecimals, 18))).toString()
    return { humanBalance, rawBalance: raw }
  }
  try {
    const humanBalance = parseFloat(formatUnits(BigInt(str), lpDecimals)) || 0
    return { humanBalance, rawBalance: str }
  } catch {
    return { humanBalance: 0, rawBalance: '0' }
  }
}

function toRaw(human, decimals) {
  if (!human || isNaN(parseFloat(human))) return '0'
  const d = Math.min(decimals, 18)
  const [whole, frac = ''] = String(human).trim().split('.')
  const fp = frac.padEnd(d, '0').slice(0, d)
  try { return (BigInt(whole || '0') * BigInt(10 ** d) + BigInt(fp || '0')).toString() }
  catch { return '0' }
}

// ─── Quote expiry timer (90 seconds) ─────────────────────────────────────────
const QUOTE_TTL = 90

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
      <span className={`material-symbols-outlined text-[14px] ${isUrgent ? 'text-amber-500 animate-pulse' : 'text-on-surface-variant'}`}>timer</span>
      <span>Quote expires in <span className={`font-black tabular-nums ${isUrgent ? 'text-amber-700' : 'text-on-surface'}`}>{secondsLeft}s</span></span>
      <div className="flex-1 h-1 bg-surface-container-high rounded-full overflow-hidden ml-1">
        <div
          className={`h-full rounded-full transition-all duration-1000 ${isUrgent ? 'bg-amber-400' : 'bg-on-tertiary-container/40'}`}
          style={{ width: `${progress * 100}%` }}
        />
      </div>
    </div>
  )
}

function StepRow({ label, status }) {
  return (
    <div className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
      status === 'active' ? 'bg-primary-container/5 border border-primary-container/20' :
      status === 'done'   ? 'opacity-40' : 'opacity-20'}`}>
      {status === 'active'
        ? <span className="material-symbols-outlined text-primary-container text-[16px] animate-spin shrink-0">progress_activity</span>
        : status === 'done'
          ? <span className="material-symbols-outlined text-on-tertiary-container text-[16px] shrink-0">check_circle</span>
          : <span className="material-symbols-outlined text-on-surface-variant/30 text-[16px] shrink-0">radio_button_unchecked</span>}
      <p className={`text-sm font-bold ${status === 'active' ? 'text-on-surface' : 'text-on-surface-variant'}`}>{label}</p>
    </div>
  )
}

function DestTokenPicker({ chainId, walletAddress, value, onChange }) {
  const [tokens, setTokens]   = useState([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch]   = useState('')
  const [open, setOpen]       = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!chainId || !walletAddress) return
    let cancelled = false
    setLoading(true); setTokens([])
    ;(async () => {
      try {
        const resp = await getTokens({ chains: [chainId] })
        let list = resp.tokens?.[chainId] ?? []
        const PRIORITY = new Set(['ETH','WETH','USDC','USDT','DAI','USDe','WBTC','BNB','MATIC','AVAX','POL','CELO','BERA','S','MNT','EURC','cbBTC','cbETH','wstETH'])
        list = [...list.filter(t => PRIORITY.has(t.symbol)), ...list.filter(t => !PRIORITY.has(t.symbol))].slice(0, 100)
        let withBal = list
        try {
          const balances = await getTokenBalances(walletAddress, list)
          const balMap   = new Map(balances.map(b => [b.address?.toLowerCase(), b]))
          withBal = list.map(t => {
            const b = balMap.get(t.address?.toLowerCase())
            const raw = b?.amount ?? '0'
            let float = 0
            try { float = parseFloat(formatUnits(BigInt(raw), t.decimals)) || 0 } catch {}
            return { ...t, balanceFloat: float, formattedBalance: fmtBalance(float, t.symbol) }
          }).sort((a, b) => b.balanceFloat - a.balanceFloat)
        } catch {}
        if (!cancelled) {
          setTokens(withBal)
          if (!value) onChange(withBal.find(t => t.balanceFloat > 0) ?? withBal[0] ?? null)
          else {
            const match = withBal.find(t => t.address?.toLowerCase() === value.address?.toLowerCase())
            if (match) onChange({ ...value, ...match })
          }
        }
      } catch (err) { console.warn('[DestTokenPicker]', err.message) }
      finally { if (!cancelled) setLoading(false) }
    })()
    return () => { cancelled = true }
  }, [chainId, walletAddress]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [])

  const filtered = tokens.filter(t => !search || t.symbol?.toLowerCase().includes(search.toLowerCase()) || t.name?.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => !loading && setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl border-2 border-surface-container-high bg-surface-container-low hover:border-primary-container/40 transition-all">
        <div className="flex items-center gap-2 min-w-0">
          {value ? (
            <>
              {value.logoURI && <img src={value.logoURI} alt={value.symbol} className="w-6 h-6 rounded-full shrink-0" onError={e => { e.target.style.display='none' }} />}
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant">Receive as</p>
                <p className="font-bold text-sm text-on-surface">{value.symbol}</p>
              </div>
            </>
          ) : (
            <p className="text-sm font-bold text-on-surface-variant">{loading ? 'Loading tokens...' : 'Select token'}</p>
          )}
        </div>
        {loading
          ? <span className="material-symbols-outlined text-[16px] text-on-surface-variant animate-spin shrink-0">progress_activity</span>
          : <span className="material-symbols-outlined text-[16px] text-on-surface-variant shrink-0">expand_more</span>}
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-2xl shadow-2xl border border-surface-container z-[300] overflow-hidden">
          <div className="p-2 border-b border-surface-container">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-[14px] text-on-surface-variant">search</span>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search token…" autoFocus
                className="w-full pl-8 pr-3 py-2 text-sm rounded-xl border border-surface-container-high bg-surface-container-low focus:outline-none font-medium" />
            </div>
          </div>
          <div className="py-1 max-h-56 overflow-y-auto">
            {filtered.length === 0 && <p className="text-center text-sm text-on-surface-variant py-4">No tokens found</p>}
            {filtered.map((t, i) => {
              const selected = value?.address?.toLowerCase() === t.address?.toLowerCase()
              return (
                <button key={t.address + i} type="button" onClick={() => { onChange(t); setOpen(false); setSearch('') }}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface-container-low ${selected ? 'bg-surface-container' : ''}`}>
                  {t.logoURI
                    ? <img src={t.logoURI} alt={t.symbol} className="w-7 h-7 rounded-full shrink-0" onError={e => { e.target.style.display='none' }} />
                    : <div className="w-7 h-7 rounded-full bg-surface-container flex items-center justify-center text-xs font-black text-on-surface-variant shrink-0">{t.symbol?.[0] ?? '?'}</div>}
                  <div className="flex-1 min-w-0">
                    <p className={`font-bold text-sm ${selected ? 'text-on-tertiary-container' : 'text-on-surface'}`}>{t.symbol}</p>
                    <p className="text-[10px] text-on-surface-variant truncate">{t.name}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-medium text-on-surface-variant">{t.formattedBalance ?? '0'}</p>
                    {t.balanceFloat > 0 && <div className="w-1.5 h-1.5 rounded-full bg-on-tertiary-container ml-auto mt-0.5" />}
                  </div>
                  {selected && <span className="material-symbols-outlined text-on-tertiary-container text-[14px] shrink-0">check_circle</span>}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function ChainPicker({ value, onChange, label }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [])
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 rounded-xl border-2 border-surface-container-high bg-surface-container-low hover:border-on-tertiary-container/40 transition-all text-left">
        <div>
          <p className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant">{label}</p>
          <p className="font-bold text-sm text-on-surface mt-0.5">{getChainName(value)}</p>
        </div>
        <span className="material-symbols-outlined text-[16px] text-on-surface-variant shrink-0">expand_more</span>
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-2xl shadow-2xl border border-surface-container z-[300] overflow-hidden">
          <div className="py-1 max-h-56 overflow-y-auto">
            {SUPPORTED_CHAINS.map(chain => (
              <button key={chain.id} type="button" onClick={() => { onChange(chain.id); setOpen(false) }}
                className={`w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-surface-container-low transition-colors ${chain.id === value ? 'bg-surface-container' : ''}`}>
                <span className={`text-sm font-bold ${chain.id === value ? 'text-on-tertiary-container' : 'text-on-surface'}`}>{chain.name}</span>
                {chain.id === value && <span className="material-symbols-outlined text-on-tertiary-container text-[14px]">check_circle</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function WithdrawModal({ vault, position, onClose, onSuccess }) {
  const { address, chainId: walletChainId } = useAccount()
  const { switchChainAsync } = useSwitchChain()
  const toast = useToast()

  const vaultChainId     = vault?.chainId ?? position?.chainId
  const vaultName        = vault?.name ?? 'Vault'
  const protocolName     = vault?.protocol?.name ?? 'Unknown'
  const withdrawEnabled  = vault?.isRedeemable !== false
  const underlyingTokens = vault?.underlyingTokens ?? position?.underlyingTokens ?? []
  const apy              = vault?.analytics?.apy?.total
  const apyDisplay = apy != null ? `${apy.toFixed(2)}%` : 'N/A'

  const lpDecimals = resolveWithdrawFromDecimals(vault, position)
  const lpSymbol   = resolveWithdrawFromSymbol(vault, position)

  useEffect(() => {
    console.log('[WithdrawModal] Opened. LP token resolution data:', {
      'vault.lpTokens':             vault?.lpTokens,
      'vault.address':              vault?.address,
      'vault.underlyingTokens':     vault?.underlyingTokens?.map(t => `${t.symbol}@${t.address}`),
      'position.asset.address':     position?.asset?.address,
      'position.asset.symbol':      position?.asset?.symbol,
      lpSymbol,
      lpDecimals,
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const balanceNativeRaw = position?.balanceNative ?? null
  const balanceUsd       = Number(position?.balanceUsd ?? vault?._positionBalanceUsd ?? 0)
  const { humanBalance: apiBalanceHuman, rawBalance: apiRawBalance } = parseBalanceNative(balanceNativeRaw, lpDecimals)
  const hasApiBalance = apiBalanceHuman > 0

  const [onChainRaw, setOnChainRaw]   = useState(null)
  const [fetchingBal, setFetchingBal] = useState(false)

  useEffect(() => {
    if (hasApiBalance || !address) return
    let lpAddr
    try { lpAddr = resolveWithdrawFromToken(vault, position) } catch { return }
    let cancelled = false
    setFetchingBal(true)
    ;(async () => {
      try {
        const provider  = new ethers.BrowserProvider(window.ethereum)
        const contract  = new ethers.Contract(lpAddr, ['function balanceOf(address) view returns (uint256)'], provider)
        const bal       = await contract.balanceOf(address)
        if (!cancelled) setOnChainRaw(bal.toString())
      } catch (e) { console.warn('[WithdrawModal] on-chain balance:', e.message) }
      finally { if (!cancelled) setFetchingBal(false) }
    })()
    return () => { cancelled = true }
  }, [hasApiBalance, address]) // eslint-disable-line react-hooks/exhaustive-deps

  const bestRawBalance = hasApiBalance ? apiRawBalance : (onChainRaw ?? '0')
  const bestBalanceHuman = hasApiBalance
    ? apiBalanceHuman
    : onChainRaw ? (parseFloat(formatUnits(BigInt(onChainRaw), lpDecimals)) || 0) : 0
  const hasBalance = bestBalanceHuman > 0

  const [withdrawType, setWithdrawType] = useState('partial')
  const [amount, setAmount]             = useState('')
  const [destChainId, setDestChainId]   = useState(vaultChainId)
  const [destToken, setDestToken]       = useState(null)
  const [quote, setQuote]               = useState(null)
  const [quoteLoading, setQuoteLoading] = useState(false)
  const [quoteError, setQuoteError]     = useState(null)
  const [quoteExpiresAt, setQuoteExpiresAt] = useState(null)
  const [quoteExpired, setQuoteExpired]     = useState(false)
  const debounceRef                     = useRef(null)
  const [txStep, setTxStep]             = useState('idle')
  const [txHash, setTxHash]             = useState(null)
  const [crossStatus, setCrossStatus]   = useState(null)
  const [error, setError]               = useState(null)
  const inputRef = useRef(null)
  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 100) }, [])

  const amountNum    = parseFloat(amount) || 0
  const isCrossChain = destChainId !== vaultChainId
  const needsSwitch  = walletChainId !== vaultChainId
  const isBusy       = ['switching', 'approving', 'withdrawing'].includes(txStep)

  const rawAmount = withdrawType === 'full' ? bestRawBalance : toRaw(amount, lpDecimals)
  const isValid   = withdrawType === 'full' || amountNum > 0
  const quoteReady = !!quote && !quoteLoading && !quoteError && !quoteExpired
  const canWithdraw = isValid && !isBusy && !!destToken && quoteReady

  const handleQuoteExpired = useCallback(() => {
    setQuoteExpired(true)
    setQuote(null)
    setQuoteExpiresAt(null)
  }, [])

  const fetchQuote = useCallback(async () => {
    if (!isValid || !destToken || !rawAmount || rawAmount === '0') {
      setQuote(null); setQuoteError(null); setQuoteExpiresAt(null); setQuoteExpired(false); return
    }
    let fromTokenAddress
    try { fromTokenAddress = resolveWithdrawFromToken(vault, position) }
    catch (e) { setQuoteError(e.message); setQuote(null); setQuoteLoading(false); return }

    setQuoteLoading(true); setQuoteError(null); setQuote(null)
    setQuoteExpiresAt(null); setQuoteExpired(false)
    try {
      const q = await getWithdrawQuote({
        vaultChainId, destChainId,
        fromTokenAddress,
        toTokenAddress: destToken.address,
        userAddress: address,
        fromAmount: rawAmount,
        slippage: 0.005,
      })
      setQuote(q)
      // Start 90-second expiry clock from when quote was received
      setQuoteExpiresAt(Date.now() + QUOTE_TTL * 1000)
      setQuoteExpired(false)
    } catch (err) {
      setQuoteError(err.message)
    } finally {
      setQuoteLoading(false)
    }
  }, [isValid, destToken, rawAmount, vaultChainId, destChainId, address]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(fetchQuote, 700)
    return () => clearTimeout(debounceRef.current)
  }, [fetchQuote])

  // Auto re-fetch after expiry
  useEffect(() => {
    if (!quoteExpired) return
    if (!isValid || !destToken) return
    const timer = setTimeout(() => {
      setQuoteExpired(false)
      fetchQuote()
    }, 300)
    return () => clearTimeout(timer)
  }, [quoteExpired]) // eslint-disable-line react-hooks/exhaustive-deps

  const minReceived = quote?.estimate?.toAmountMin
    ? (() => {
        try {
          const dec   = quote.action?.toToken?.decimals ?? 18
          const human = Number(BigInt(quote.estimate.toAmountMin)) / 10 ** dec
          return `${fmtBalance(human, quote.action?.toToken?.symbol)} ${quote.action?.toToken?.symbol ?? ''}`
        } catch { return null }
      })()
    : null

  const priceImpact = quote?.estimate
    ? (() => {
        try {
          const from = parseFloat(quote.estimate.fromAmountUSD ?? '0')
          const to   = parseFloat(quote.estimate.toAmountUSD   ?? '0')
          if (!from || !to) return null
          return ((from - to) / from) * 100
        } catch { return null }
      })()
    : null

  async function handleWithdraw() {
    if (!canWithdraw) return
    setError(null)
    let toastId = null
    try {
      if (needsSwitch) {
        setTxStep('switching')
        try { await switchChainAsync({ chainId: vaultChainId }) }
        catch (e) {
          setTxStep('idle')
          const rej = e?.message?.toLowerCase().includes('rejected')
          setError(rej ? 'Please approve the network switch.' : `Could not switch to ${getChainName(vaultChainId)}.`)
          toast.error('Switch Failed', rej ? 'You rejected the switch.' : 'Failed.')
          return
        }
      }
      setTxStep('approving')
      toastId = toast.loading('Preparing Withdrawal', 'Building Composer route...')

      const result = await executeWithdraw({
        vault, position,
        rawAmount,
        withdrawAll: withdrawType === 'full',
        destTokenAddress: destToken.address,
        destChainId,
        userAddress: address,
        slippage: 0.005,
        onApprovalSent: () => {
          toast.update(toastId, { type: 'loading', title: 'Approve Vault Shares', message: `Approving ${lpSymbol}...` })
        },
        onApprovalDone: () => { setTxStep('withdrawing') },
        onTxSent: (hash) => {
          setTxHash(hash)
          if (toastId) { toast.dismiss(toastId); toastId = null }
          isCrossChain
            ? toast.tx('Cross-Chain Withdrawal Sent', hash, { title: 'Bridge In Progress' })
            : toast.tx('Withdrawal Submitted', hash, { title: 'Transaction Sent' })
        },
      })

      if (toastId) { toast.dismiss(toastId); toastId = null }

      if (!result.isCrossChain) {
        setTxStep('done')
        toast.success('Withdrawal Complete! 🎉', `Received ${destToken.symbol} on ${getChainName(destChainId)}`, { duration: 8000 })
        onSuccess?.({ vault, txHash: result.txHash })
        return
      }
      setTxStep('crosschain')
      pollStatus(result.txHash, vaultChainId, destChainId)
    } catch (e) {
      if (toastId) { toast.dismiss(toastId); toastId = null }
      const msg = e?.message ?? 'Unknown error'
      const rej = msg.toLowerCase().includes('user rejected') || msg.toLowerCase().includes('rejected')
      setTxStep('idle')
      setError(rej ? 'Transaction cancelled.' : msg.slice(0, 300))
      toast.error(rej ? 'Cancelled' : 'Withdrawal Failed', rej ? 'You rejected the transaction.' : msg.slice(0, 120))
    }
  }

  function pollStatus(hash, fromChain, toChain, maxAttempts = 72) {
    let attempt = 0
    const poll = async () => {
      if (attempt++ >= maxAttempts) return
      await new Promise(r => setTimeout(r, 5000))
      try {
        const apiKey = import.meta.env.VITE_LIFI_API_KEY
        const headers = apiKey ? { 'x-lifi-api-key': apiKey } : {}
        const p   = new URLSearchParams({ txHash: hash, fromChain: String(fromChain), toChain: String(toChain) })
        const res = await fetch(`${getLifiBase()}/v1/status?${p}`, { headers })
        if (!res.ok) { poll(); return }
        const data = await res.json()
        setCrossStatus(data)
        const { status, substatus } = data
        if (status === 'DONE' && substatus === 'COMPLETED') {
          setTxStep('done')
          toast.success('Withdrawal Complete! 🎉', `Received ${destToken?.symbol} on ${getChainName(toChain)}`, { duration: 8000 })
          onSuccess?.({ vault, txHash: hash })
        } else if (status === 'DONE' && substatus === 'PARTIAL')  { setTxStep('partial') }
        else if (status === 'DONE' && substatus === 'REFUNDED')   { setTxStep('refunded') }
        else if (status === 'FAILED') {
          setTxStep('failed')
          setError(`Bridge failed: ${(substatus ?? 'UNKNOWN').toLowerCase().replace(/_/g, ' ')}`)
          toast.error('Bridge Failed', substatus ?? 'Unknown')
        } else { poll() }
      } catch { poll() }
    }
    poll()
  }

  if (!withdrawEnabled) {
    return (
      <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
        <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl p-8 text-center space-y-5">
          <div className="w-16 h-16 bg-error/10 rounded-full flex items-center justify-center mx-auto">
            <span className="material-symbols-outlined text-error text-3xl">block</span>
          </div>
          <h2 className="font-headline font-extrabold text-xl text-on-surface">Withdrawal Not Available</h2>
          <p className="text-sm text-on-surface-variant leading-relaxed">
            <span className="font-bold text-on-surface">{vaultName}</span> does not support withdrawals via Composer.
            Please use the <span className="font-bold">{protocolName}</span> interface directly.
          </p>
          {vault?.protocol?.url && (
            <a href={vault.protocol.url} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 bg-primary-container text-white rounded-xl font-bold text-sm hover:opacity-90">
              <span className="material-symbols-outlined text-[16px]">open_in_new</span>Go to {protocolName}
            </a>
          )}
          <button onClick={onClose} className="w-full py-3 rounded-xl text-sm font-bold text-on-surface-variant border border-surface-container-high hover:bg-surface-container transition-all">Close</button>
        </div>
      </div>
    )
  }

  const substatusLabel = crossStatus?.substatus ? crossStatus.substatus.toLowerCase().replace(/_/g, ' ') : 'waiting for bridge...'

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={!isBusy && txStep === 'idle' ? onClose : undefined} />
      <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl flex flex-col" style={{ maxHeight: '92vh' }}>

        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-surface-container shrink-0">
          <div className="flex items-center justify-between">
            <div className="min-w-0 pr-3">
              <h2 className="font-headline font-extrabold text-xl text-on-surface">Withdraw</h2>
              <p className="text-xs text-on-surface-variant mt-0.5 truncate font-medium">
                {lpSymbol} · {getChainName(vaultChainId)} · {apyDisplay} APY
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest bg-on-tertiary-container/10 text-on-tertiary-container px-2 py-1 rounded-full">
                <span className="material-symbols-outlined text-[10px]">bolt</span>Composer
              </span>
              <button onClick={onClose} disabled={isBusy}
                className="w-8 h-8 rounded-full bg-surface-container hover:bg-surface-container-high flex items-center justify-center transition-colors disabled:opacity-40">
                <span className="material-symbols-outlined text-[16px] text-on-surface-variant">close</span>
              </button>
            </div>
          </div>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-5">

          {/* Position card */}
          <div className="bg-surface-container rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="min-w-0 pr-3">
                <p className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant">Your Position</p>
                {fetchingBal ? (
                  <div className="h-8 w-40 bg-surface-container-high rounded-lg animate-pulse mt-1" />
                ) : hasBalance ? (
                  <p className="font-headline font-black text-2xl text-on-surface mt-0.5">
                    {fmtBalance(bestBalanceHuman, lpSymbol)} <span className="text-base font-bold text-on-surface-variant">{lpSymbol}</span>
                  </p>
                ) : (
                  <p className="font-headline font-black text-2xl text-on-surface-variant/50 mt-0.5">
                    0.00 <span className="text-base font-bold">{lpSymbol}</span>
                  </p>
                )}
                {balanceUsd > 0 && <p className="text-xs text-on-surface-variant mt-0.5">≈ ${balanceUsd.toLocaleString()} USD</p>}
              </div>
              <div className="text-right shrink-0">
                <p className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant">APY</p>
                <p className="font-headline font-black text-2xl text-on-tertiary-container">{apyDisplay}</p>
              </div>
            </div>
            {underlyingTokens.length > 0 && (
              <div className="flex items-center gap-2 pt-2 border-t border-surface-container-high flex-wrap">
                <p className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant shrink-0">Holds</p>
                {underlyingTokens.map((t, i) => (
                  <span key={i} className="flex items-center gap-1.5 px-2.5 py-1 bg-surface-container-high rounded-full text-xs font-bold text-on-surface">
                    {t.logoURI && <img src={t.logoURI} alt={t.symbol} className="w-4 h-4 rounded-full" onError={e => { e.target.style.display='none' }} />}
                    {t.symbol}
                  </span>
                ))}
                <span className="ml-auto text-[10px] font-medium text-on-surface-variant">{protocolName}</span>
              </div>
            )}
            {!fetchingBal && !hasBalance && (
              <div className="flex items-start gap-2 pt-2 border-t border-surface-container-high">
                <span className="material-symbols-outlined text-amber-500 text-[14px] mt-0.5">warning</span>
                <p className="text-[11px] text-amber-700 font-medium">No balance detected. Make sure your wallet is on {getChainName(vaultChainId)}.</p>
              </div>
            )}
          </div>

          {/* Form */}
          {!['crosschain','done','partial','refunded','failed'].includes(txStep) && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" disabled={isBusy} onClick={() => { setWithdrawType('partial'); setError(null) }}
                  className={`py-2.5 rounded-xl text-xs font-black uppercase tracking-widest border-2 transition-all disabled:opacity-40 ${withdrawType === 'partial' ? 'bg-primary-container text-white border-primary-container' : 'border-surface-container-high text-on-surface-variant hover:border-primary-container'}`}>
                  Partial
                </button>
                <button type="button" disabled={isBusy} onClick={() => { setWithdrawType('full'); setAmount(''); setError(null) }}
                  className={`py-2.5 rounded-xl text-xs font-black uppercase tracking-widest border-2 transition-all disabled:opacity-40 ${withdrawType === 'full' ? 'bg-error text-white border-error' : 'border-surface-container-high text-on-surface-variant hover:border-error'}`}>
                  Withdraw All
                </button>
              </div>

              {withdrawType === 'partial' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">Amount ({lpSymbol})</label>
                    {hasBalance && (
                      <span className="text-xs text-on-surface-variant font-medium">
                        Max: <span className="text-on-tertiary-container font-bold">{fmtBalance(bestBalanceHuman, lpSymbol)}</span>
                      </span>
                    )}
                  </div>
                  <div className={`relative flex items-center border-2 rounded-xl transition-all ${amountNum > 0 ? 'border-on-tertiary-container/50 bg-surface-container-low' : 'border-surface-container-high bg-surface-container-low hover:border-primary-container/40'}`}>
                    <input ref={inputRef} type="number" min="0" step="any" value={amount}
                      onChange={e => { setAmount(e.target.value); setError(null); setQuote(null); setQuoteExpiresAt(null); setQuoteExpired(false) }}
                      placeholder="0.00" disabled={isBusy}
                      className="flex-1 px-4 py-3.5 bg-transparent text-xl font-headline font-black text-on-surface outline-none placeholder:text-on-surface-variant/40 disabled:opacity-50" />
                    {hasBalance && (
                      <div className="flex gap-1 pr-3">
                        <button onClick={() => { setAmount((bestBalanceHuman / 2).toFixed(6)); setQuote(null); setQuoteExpiresAt(null); setQuoteExpired(false) }} disabled={isBusy}
                          className="px-2 py-1 text-[10px] font-black uppercase text-on-surface-variant bg-surface-container rounded-lg hover:bg-surface-container-high disabled:opacity-40">50%</button>
                        <button onClick={() => { setAmount(bestBalanceHuman.toFixed(Math.min(lpDecimals, 8))); setQuote(null); setQuoteExpiresAt(null); setQuoteExpired(false) }} disabled={isBusy}
                          className="px-2 py-1 text-[10px] font-black uppercase text-error bg-error/10 rounded-lg hover:bg-error/20 disabled:opacity-40">MAX</button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {withdrawType === 'full' && (
                <div className="p-4 bg-error/5 border border-error/20 rounded-xl space-y-1">
                  <p className="font-bold text-sm text-on-surface">Withdraw entire position</p>
                  {hasBalance
                    ? <p className="text-xs text-on-surface-variant">{fmtBalance(bestBalanceHuman, lpSymbol)} {lpSymbol}{balanceUsd > 0 ? ` ≈ $${balanceUsd.toLocaleString()}` : ''}</p>
                    : <p className="text-[11px] text-amber-600 font-medium">⚠ Exact balance will be read on-chain at execution time.</p>}
                </div>
              )}

              <div className="space-y-3">
                <p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">Receive on</p>
                <ChainPicker value={destChainId} onChange={(id) => { setDestChainId(id); setDestToken(null); setQuote(null); setQuoteExpiresAt(null); setQuoteExpired(false); setError(null) }} label="Destination chain" />
                {isCrossChain && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-on-tertiary-container/10 rounded-lg">
                    <span className="material-symbols-outlined text-on-tertiary-container text-[14px]">bolt</span>
                    <p className="text-[11px] font-bold text-on-tertiary-container">Composer bridges {getChainName(vaultChainId)} → {getChainName(destChainId)} automatically</p>
                  </div>
                )}
                <DestTokenPicker chainId={destChainId} walletAddress={address} value={destToken} onChange={(t) => { setDestToken(t); setQuote(null); setQuoteExpiresAt(null); setQuoteExpired(false); setError(null) }} />
              </div>

              {(isValid && destToken) && (
                <div className="p-3.5 bg-surface-container rounded-xl border border-surface-container-high space-y-2">
                  {quoteLoading && (
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[14px] text-on-surface-variant animate-spin">progress_activity</span>
                      <p className="text-xs text-on-surface-variant">Checking withdrawal route...</p>
                    </div>
                  )}
                  {quoteExpired && !quoteLoading && (
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-amber-500 text-[14px] animate-spin">progress_activity</span>
                      <p className="text-xs text-amber-700 font-medium">Quote expired — fetching fresh quote...</p>
                    </div>
                  )}
                  {quoteError && !quoteLoading && !quoteExpired && (
                    <div className="flex items-start gap-2">
                      <span className="material-symbols-outlined text-error text-[15px] shrink-0 mt-0.5">error</span>
                      <p className="text-xs font-medium text-error">{quoteError}</p>
                    </div>
                  )}
                  {quote && !quoteLoading && !quoteError && !quoteExpired && (
                    <>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-on-surface-variant font-medium">Min. received</span>
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
                        <span className="font-black text-on-surface">0.5%</span>
                      </div>
                      <div className="flex items-center gap-1.5 pt-0.5">
                        <span className="material-symbols-outlined text-on-tertiary-container text-[12px]">check_circle</span>
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

              {priceImpact !== null && priceImpact > 2 && !quoteExpired && (
                <div className="flex items-center gap-2 p-3 bg-error/5 border border-error/20 rounded-xl">
                  <span className="material-symbols-outlined text-error text-[16px] shrink-0">warning</span>
                  <p className="text-xs font-medium text-on-error-container">High price impact ({priceImpact.toFixed(2)}%). You may receive significantly less than expected.</p>
                </div>
              )}

              {needsSwitch && isValid && (
                <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                  <span className="material-symbols-outlined text-amber-500 text-[16px]">swap_horiz</span>
                  <p className="text-xs font-medium text-amber-800">Your wallet is on {getChainName(walletChainId)}. We'll switch to {getChainName(vaultChainId)} before withdrawing.</p>
                </div>
              )}

              {error && txStep === 'idle' && (
                <div className="flex items-start gap-2 p-3 bg-error-container/20 border border-error-container rounded-xl">
                  <span className="material-symbols-outlined text-error text-[16px] shrink-0 mt-0.5">error</span>
                  <p className="text-xs font-medium text-on-error-container">{error}</p>
                </div>
              )}

              {isBusy && (
                <div className="space-y-1.5">
                  {needsSwitch && <StepRow label={`Switch to ${getChainName(vaultChainId)}`} status={txStep === 'switching' ? 'active' : 'done'} />}
                  <StepRow label={`Approve ${lpSymbol}`} status={txStep === 'approving' ? 'active' : txStep === 'withdrawing' ? 'done' : 'pending'} />
                  <StepRow label="Submit Withdrawal" status={txStep === 'withdrawing' ? 'active' : 'pending'} />
                </div>
              )}
            </>
          )}

          {txStep === 'crosschain' && (
            <div className="text-center space-y-4 py-4">
              <div className="w-16 h-16 bg-on-tertiary-container/10 rounded-full flex items-center justify-center mx-auto">
                <span className="material-symbols-outlined text-on-tertiary-container text-3xl animate-spin">autorenew</span>
              </div>
              <h3 className="font-headline font-extrabold text-xl text-on-surface">Bridge In Progress</h3>
              <p className="text-sm text-on-surface-variant">{getChainName(vaultChainId)} → {getChainName(destChainId)} · Usually 1–5 minutes.</p>
              <div className="p-3 bg-surface-container rounded-xl text-left">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[14px] text-on-surface-variant animate-pulse">pending</span>
                  <p className="text-xs font-bold text-on-surface capitalize">{substatusLabel}</p>
                </div>
              </div>
              {txHash && (
                <a href={`https://explorer.li.fi/?txHash=${txHash}`} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-on-tertiary-container font-bold hover:underline">
                  <span className="material-symbols-outlined text-[14px]">open_in_new</span>Track on LI.FI Explorer
                </a>
              )}
            </div>
          )}

          {txStep === 'done' && (
            <div className="text-center space-y-3 py-4">
              <div className="w-16 h-16 bg-on-tertiary-container/10 rounded-full flex items-center justify-center mx-auto">
                <span className="material-symbols-outlined text-on-tertiary-container text-3xl">check_circle</span>
              </div>
              <h3 className="font-headline font-extrabold text-xl text-on-surface">Withdrawal Complete!</h3>
              <p className="text-sm text-on-surface-variant">Received <span className="font-bold">{destToken?.symbol}</span> on {getChainName(destChainId)}.</p>
              {txHash && (
                <a href={`https://explorer.li.fi/?txHash=${txHash}`} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-on-tertiary-container font-bold hover:underline">
                  <span className="material-symbols-outlined text-[14px]">open_in_new</span>View on LI.FI Explorer
                </a>
              )}
            </div>
          )}

          {txStep === 'partial' && (
            <div className="text-center space-y-4 py-4">
              <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto">
                <span className="material-symbols-outlined text-amber-600 text-3xl">warning</span>
              </div>
              <h3 className="font-headline font-extrabold text-xl text-on-surface">Partial Transfer</h3>
              <p className="text-sm text-on-surface-variant leading-relaxed">Vault shares were redeemed but the bridge step didn't complete. Check your wallet on {getChainName(destChainId)}.</p>
              {txHash && <a href={`https://explorer.li.fi/?txHash=${txHash}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs text-amber-700 font-bold hover:underline"><span className="material-symbols-outlined text-[14px]">open_in_new</span>Check on LI.FI Explorer</a>}
            </div>
          )}

          {txStep === 'refunded' && (
            <div className="text-center space-y-3 py-4">
              <div className="w-16 h-16 bg-surface-container rounded-full flex items-center justify-center mx-auto">
                <span className="material-symbols-outlined text-on-surface-variant text-3xl">undo</span>
              </div>
              <h3 className="font-headline font-extrabold text-xl text-on-surface">Refunded</h3>
              <p className="text-sm text-on-surface-variant">Vault shares returned to your wallet on {getChainName(vaultChainId)}.</p>
            </div>
          )}

          {txStep === 'failed' && (
            <div className="text-center space-y-3 py-4">
              <div className="w-16 h-16 bg-error/10 rounded-full flex items-center justify-center mx-auto">
                <span className="material-symbols-outlined text-error text-3xl">error</span>
              </div>
              <h3 className="font-headline font-extrabold text-xl text-on-surface">Bridge Failed</h3>
              <p className="text-sm text-on-surface-variant">Transfer failed. Funds should be automatically refunded.</p>
              {error && <p className="text-xs text-error font-medium">{error}</p>}
              {txHash && <a href={`https://explorer.li.fi/?txHash=${txHash}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs text-error font-bold hover:underline"><span className="material-symbols-outlined text-[14px]">open_in_new</span>Check on LI.FI Explorer</a>}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 shrink-0">
          {txStep === 'idle' && (
            <button onClick={handleWithdraw} disabled={!canWithdraw}
              className={`w-full py-4 rounded-2xl font-headline font-black text-base transition-all flex items-center justify-center gap-2
                ${canWithdraw ? (withdrawType === 'full' ? 'bg-error text-white hover:opacity-90 shadow-md' : 'bg-primary-container text-white hover:opacity-90 shadow-md') : 'bg-surface-container text-on-surface-variant cursor-not-allowed'}`}>
              {quoteLoading && isValid && destToken ? <><span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>Getting route...</>
                : quoteExpired && isValid && destToken ? <><span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>Refreshing quote...</>
                : quoteError && isValid && destToken ? <><span className="material-symbols-outlined text-[18px]">block</span>No route available</>
                : !destToken ? <><span className="material-symbols-outlined text-[18px]">token</span>Select a destination token</>
                : needsSwitch && canWithdraw ? <><span className="material-symbols-outlined text-[18px]">swap_horiz</span>Switch & Withdraw</>
                : withdrawType === 'full' ? <><span className="material-symbols-outlined text-[18px]">logout</span>Withdraw All → {destToken?.symbol}</>
                : amountNum > 0 ? <><span className="material-symbols-outlined text-[18px]">remove_circle</span>Withdraw {amount} {lpSymbol} → {destToken?.symbol}</>
                : <><span className="material-symbols-outlined text-[18px]">remove_circle</span>Enter an amount</>}
            </button>
          )}
          {isBusy && (
            <button disabled className="w-full py-4 rounded-2xl font-headline font-black text-base bg-surface-container text-on-surface-variant flex items-center justify-center gap-2 cursor-not-allowed">
              <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
              {txStep === 'switching' && `Switching to ${getChainName(vaultChainId)}...`}
              {txStep === 'approving' && `Approving ${lpSymbol}...`}
              {txStep === 'withdrawing' && 'Sending withdrawal...'}
            </button>
          )}
          {txStep === 'crosschain' && (
            <button onClick={() => { onSuccess?.({ vault }); onClose() }} className="w-full py-4 rounded-2xl font-headline font-black text-base bg-surface-container text-on-surface-variant hover:bg-surface-container-high transition-all">
              Close (bridge continues in background)
            </button>
          )}
          {txStep === 'done' && (
            <button onClick={onClose} className="w-full py-4 rounded-2xl font-headline font-black text-base bg-on-tertiary-container text-white hover:opacity-90 transition-all">Done</button>
          )}
          {(txStep === 'partial' || txStep === 'refunded') && (
            <button onClick={onClose} className="w-full py-4 rounded-2xl font-headline font-black text-base bg-surface-container text-on-surface-variant hover:bg-surface-container-high transition-all">Close</button>
          )}
          {txStep === 'failed' && (
            <div className="flex gap-2">
              <button onClick={() => { setTxStep('idle'); setError(null); setTxHash(null); setCrossStatus(null) }}
                className="flex-1 py-4 rounded-2xl font-headline font-black text-base bg-surface-container text-on-surface-variant hover:bg-surface-container-high transition-all">Try Again</button>
              <button onClick={onClose}
                className="flex-1 py-4 rounded-2xl font-headline font-black text-base border-2 border-surface-container-high text-on-surface-variant hover:border-primary-container/40 transition-all">Close</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}