// src/components/WithdrawModal.jsx
// Changes:
// - isRedeemable=false disables withdrawals entirely
// - isRedeemable=false shows a clear "withdrawal not supported" message

import { useState, useEffect, useRef } from 'react'
import { useAccount, useSwitchChain } from 'wagmi'
import { useToast } from './ToastNotifications'
import { SUPPORTED_CHAINS, getTokenBalancesOnChain } from '../services/tokenBalances'
import { ethers } from 'ethers'
import { formatUnits } from 'viem'

const CHAIN_NAMES = Object.fromEntries(SUPPORTED_CHAINS.map(c => [c.id, c.name]))

function getChainName(chainId) {
  if (!chainId) return 'Unknown'
  return CHAIN_NAMES[chainId] ?? `Chain ${chainId}`
}

const ERC20_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
]

function getLifiBase() {
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    return '/lifi-api'
  }
  return 'https://li.quest'
}

function toRawAmountStr(humanAmount, decimals) {
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

async function executeWithdrawViaComposer({
  vault,
  userAddress,
  withdrawAmountRaw,
  destChainId,
  destToken,
  onTxSent,
}) {
  if (!window.ethereum) throw new Error('No wallet detected.')

  let rawAmount
  try {
    rawAmount = BigInt(withdrawAmountRaw).toString()
    if (rawAmount === '0' || rawAmount === '') throw new Error('zero')
  } catch {
    throw new Error(`Invalid withdrawal amount: "${withdrawAmountRaw}"`)
  }

  const provider = new ethers.BrowserProvider(window.ethereum)
  const signer = await provider.getSigner()

  const network = await provider.getNetwork()
  const walletChainId = Number(network.chainId)
  if (walletChainId !== vault.chainId) {
    throw new Error(`Please switch your wallet to ${getChainName(vault.chainId)} first.`)
  }

  const apiKey = import.meta.env.VITE_LIFI_API_KEY
  const reqHeaders = { 'Content-Type': 'application/json' }
  if (apiKey) reqHeaders['x-lifi-api-key'] = apiKey

  const base = getLifiBase()

  const params = new URLSearchParams({
    fromChain: String(vault.chainId),
    toChain: String(destChainId),
    fromToken: vault.address,
    toToken: destToken.address,
    fromAddress: userAddress,
    toAddress: userAddress,
    fromAmount: rawAmount,
    slippage: '0.005',
    integrator: 'yield-doctor',
  })

  const quoteRes = await fetch(`${base}/v1/quote?${params}`, { headers: reqHeaders })

  if (!quoteRes.ok) {
    const errText = await quoteRes.text().catch(() => quoteRes.statusText)
    if (quoteRes.status === 404 || errText.toLowerCase().includes('no routes')) {
      throw new Error(
        'No withdrawal route found. Try withdrawing to the underlying token on the same chain first.'
      )
    }
    throw new Error(`Withdrawal quote failed (${quoteRes.status}): ${errText.slice(0, 200)}`)
  }

  const quote = await quoteRes.json()
  if (!quote.transactionRequest) {
    throw new Error('No transaction data returned for withdrawal. Please try again.')
  }

  if (quote.estimate?.approvalAddress) {
    const erc20 = new ethers.Contract(vault.address, ERC20_ABI, signer)
    const owner = await signer.getAddress()
    const spender = quote.estimate.approvalAddress
    let currentAllowance = 0n
    try { currentAllowance = await erc20.allowance(owner, spender) } catch { /* assume 0 */ }
    if (currentAllowance < BigInt(rawAmount)) {
      const approveTx = await erc20.approve(spender, rawAmount)
      await approveTx.wait()
    }
  }

  const tx = await signer.sendTransaction(quote.transactionRequest)
  onTxSent?.(tx.hash)
  const receipt = await tx.wait()
  return { txHash: tx.hash, receipt }
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

function DestTokenPicker({ destChainId, selectedToken, onTokenSelect, walletAddress }) {
  const [tokens, setTokens] = useState([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!destChainId || !walletAddress) return
    setLoading(true)
    setTokens([])
    getTokenBalancesOnChain(walletAddress, destChainId)
      .then(list => setTokens(list))
      .catch(() => setTokens([]))
      .finally(() => setLoading(false))
  }, [destChainId, walletAddress])

  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filtered = tokens.filter(t =>
    !search ||
    t.symbol?.toLowerCase().includes(search.toLowerCase()) ||
    t.name?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        disabled={loading}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl border-2 border-surface-container-high bg-surface-container-low hover:border-on-tertiary-container/40 transition-all text-left disabled:opacity-60"
      >
        <div className="flex items-center gap-2 min-w-0">
          {selectedToken ? (
            <>
              {selectedToken.logoURI && (
                <img src={selectedToken.logoURI} alt={selectedToken.symbol}
                  className="w-6 h-6 rounded-full shrink-0"
                  onError={e => { e.target.style.display = 'none' }} />
              )}
              <div>
                <p className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant">Receive as</p>
                <p className="font-bold text-sm text-on-surface">{selectedToken.symbol}</p>
              </div>
            </>
          ) : (
            <div>
              <p className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant">Receive as</p>
              <p className="font-bold text-sm text-on-surface-variant">{loading ? 'Loading tokens...' : 'Select token'}</p>
            </div>
          )}
        </div>
        {loading
          ? <span className="material-symbols-outlined text-[16px] text-on-surface-variant animate-spin shrink-0">progress_activity</span>
          : <span className="material-symbols-outlined text-[16px] text-on-surface-variant shrink-0">expand_more</span>
        }
      </button>

      {open && !loading && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-2xl shadow-2xl border border-surface-container z-[200] overflow-hidden">
          <div className="p-2 border-b border-surface-container">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-[14px] text-on-surface-variant">search</span>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search token…"
                className="w-full pl-8 pr-3 py-2 text-sm rounded-xl border border-surface-container-high bg-surface-container-low focus:outline-none font-medium"
                autoFocus
              />
            </div>
          </div>
          <div className="py-1 max-h-52 overflow-y-auto">
            {filtered.length === 0 && (
              <p className="text-center text-sm text-on-surface-variant py-4">No tokens found</p>
            )}
            {filtered.map((token, i) => {
              const isSelected = selectedToken?.address?.toLowerCase() === token.address?.toLowerCase()
              return (
                <button
                  key={token.address + i}
                  type="button"
                  onClick={() => { onTokenSelect(token); setOpen(false); setSearch('') }}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface-container-low ${isSelected ? 'bg-surface-container' : ''}`}
                >
                  {token.logoURI ? (
                    <img src={token.logoURI} alt={token.symbol}
                      className="w-7 h-7 rounded-full shrink-0"
                      onError={e => { e.target.style.display = 'none' }} />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-surface-container flex items-center justify-center text-xs font-black text-on-surface-variant shrink-0">
                      {token.symbol?.[0] ?? '?'}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className={`font-bold text-sm ${isSelected ? 'text-on-tertiary-container' : 'text-on-surface'}`}>{token.symbol}</p>
                    <p className="text-[10px] text-on-surface-variant truncate">{token.name}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-medium text-on-surface-variant">{token.formattedBalance}</p>
                  </div>
                  {isSelected && (
                    <span className="material-symbols-outlined text-on-tertiary-container text-[14px] shrink-0">check_circle</span>
                  )}
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
                className={`w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-surface-container-low transition-colors ${chain.id === value ? 'bg-surface-container' : ''}`}
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

export default function WithdrawModal({ vault, position, onClose, onSuccess }) {
  const { address, chainId: walletChainId } = useAccount()
  const { switchChainAsync } = useSwitchChain()
  const toast = useToast()

  // isRedeemable controls whether withdrawals via Composer are supported
  // If field is missing/undefined, default to true (backwards compat)
  const withdrawalEnabled = vault?.isRedeemable !== false

  const vaultChainId = vault?.chainId ?? position?.chainId
  const underlyingTokens = vault?.underlyingTokens ?? position?.underlyingTokens ?? []
  const underlyingToken = underlyingTokens[0] ?? null
  const underlyingSymbol = underlyingToken?.symbol ?? position?.asset?.symbol ?? 'tokens'
  const underlyingDecimals = underlyingToken?.decimals ?? 18

  const apy = vault?.analytics?.apy?.total ?? position?.apy
  const apy30d = vault?.analytics?.apy30d ?? position?.apy30d
  const apyDisplay = apy != null ? `${(apy * 100).toFixed(2)}%` : 'N/A'
  const apy30dDisplay = apy30d != null ? `${(apy30d * 100).toFixed(2)}%` : 'N/A'

  const lpDecimals = vault?.lpTokens?.[0]?.decimals ?? underlyingDecimals ?? 18
  const balanceNativeRaw = position?.balanceNative ?? null
  const balanceUsd = Number(position?.balanceUsd ?? vault?._positionBalanceUsd ?? 0)

  let lpBalanceHuman = 0
  if (balanceNativeRaw) {
    try {
      lpBalanceHuman = parseFloat(formatUnits(BigInt(balanceNativeRaw), lpDecimals))
    } catch { lpBalanceHuman = 0 }
  }

  const hasBalance = balanceNativeRaw != null && balanceNativeRaw !== '0'

  const [destMode, setDestMode] = useState('same')
  const [destChainId, setDestChainId] = useState(vaultChainId)
  const [destToken, setDestToken] = useState(underlyingToken)

  const [amount, setAmount] = useState('')
  const [withdrawType, setWithdrawType] = useState('partial')
  const [txStep, setTxStep] = useState('idle')
  const [error, setError] = useState(null)
  const inputRef = useRef(null)

  useEffect(() => {
    setDestChainId(vaultChainId)
    setDestToken(underlyingToken)
  }, [vault])

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100)
  }, [])

  const amountNum = parseFloat(amount) || 0
  const isBusy = ['switching', 'withdrawing'].includes(txStep)
  const needsChainSwitch = walletChainId !== vaultChainId
  const isCrossChainWithdraw = destChainId !== vaultChainId

  const isValidPartial = withdrawType === 'partial' && amountNum > 0 && amount.trim() !== ''
  const isValidFull = withdrawType === 'full' && hasBalance
  const isValid = isValidPartial || isValidFull

  function handleDestModeChange(mode) {
    setDestMode(mode)
    if (mode === 'same') {
      setDestChainId(vaultChainId)
      setDestToken(underlyingToken)
    } else {
      setDestChainId(vaultChainId)
      setDestToken(underlyingToken)
    }
  }

  function handleDestChainChange(newChainId) {
    setDestChainId(newChainId)
    setDestToken(null)
  }

  function setMax() {
    if (lpBalanceHuman > 0) {
      setAmount(lpBalanceHuman.toFixed(6))
    }
  }

  function setHalf() {
    if (lpBalanceHuman > 0) {
      setAmount((lpBalanceHuman / 2).toFixed(6))
    }
  }

  async function handleWithdraw() {
    if (!isValid || !destToken) return
    setError(null)

    try {
      if (needsChainSwitch) {
        setTxStep('switching')
        try {
          await switchChainAsync({ chainId: vaultChainId })
        } catch (switchErr) {
          setTxStep('idle')
          const rejected = switchErr?.message?.toLowerCase().includes('rejected')
          setError(rejected ? 'Please approve the network switch.' : `Could not switch to ${getChainName(vaultChainId)}.`)
          toast.error('Network Switch Failed', rejected ? 'You rejected the switch.' : 'Failed to switch network.')
          return
        }
      }

      setTxStep('withdrawing')

      let withdrawAmountRaw
      if (withdrawType === 'full') {
        if (!balanceNativeRaw || balanceNativeRaw === '0') {
          try {
            const provider = new ethers.BrowserProvider(window.ethereum)
            const contract = new ethers.Contract(vault.address, ERC20_ABI, provider)
            const onChainBal = await contract.balanceOf(address)
            withdrawAmountRaw = onChainBal.toString()
            if (withdrawAmountRaw === '0') {
              throw new Error('No vault shares found. Your position may already be withdrawn.')
            }
          } catch (err) {
            if (err.message.includes('No vault shares')) throw err
            throw new Error('Could not determine your vault balance. Please try a partial withdrawal with a specific amount.')
          }
        } else {
          withdrawAmountRaw = balanceNativeRaw
        }
      } else {
        withdrawAmountRaw = toRawAmountStr(amount, lpDecimals)
        if (withdrawAmountRaw === '0') {
          throw new Error('Invalid amount entered.')
        }
      }

      try {
        const check = BigInt(withdrawAmountRaw)
        if (check === 0n) throw new Error('Amount is zero')
      } catch {
        throw new Error(`Invalid withdrawal amount: ${withdrawAmountRaw}`)
      }

      const toastId = toast.loading(
        'Processing Withdrawal',
        withdrawType === 'full' ? 'Withdrawing all funds...' : `Withdrawing ${amount} ${underlyingSymbol}...`
      )

      let result
      try {
        result = await executeWithdrawViaComposer({
          vault,
          userAddress: address,
          withdrawAmountRaw,
          destChainId,
          destToken,
          onTxSent: (txHash) => {
            toast.dismiss(toastId)
            isCrossChainWithdraw
              ? toast.tx('Cross-Chain Withdrawal Sent', txHash, { title: 'Bridge In Progress' })
              : toast.tx('Withdrawal Submitted', txHash, { title: 'Transaction Sent' })
          },
        })
      } catch (withdrawErr) {
        toast.dismiss(toastId)
        const msg = withdrawErr?.message ?? ''
        const isRejected = msg.toLowerCase().includes('user rejected') || msg.toLowerCase().includes('rejected')
        toast.error(
          isRejected ? 'Transaction Rejected' : 'Withdrawal Failed',
          isRejected ? 'You cancelled the withdrawal.' : msg.slice(0, 120)
        )
        setTxStep('idle')
        setError(isRejected ? 'Transaction was rejected.' : msg.slice(0, 150))
        return
      }

      setTxStep('done')
      toast.success('Withdrawal Successful! 🎉', `Funds sent to ${getChainName(destChainId)} as ${destToken?.symbol}`, { duration: 8000 })
      onSuccess?.({ vault, amount, txHash: result?.txHash })
    } catch (err) {
      setTxStep('idle')
      const msg = err?.message ?? 'Unknown error'
      setError(msg)
      toast.error('Error', msg.slice(0, 120))
    }
  }

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={!isBusy ? onClose : undefined} />

      <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-surface-container shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-headline font-extrabold text-xl text-on-surface">Withdraw</h2>
              <p className="text-xs text-on-surface-variant mt-0.5 font-medium truncate max-w-[220px]">{vault?.name}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {/* Redeemable badge */}
              {withdrawalEnabled ? (
                <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest bg-on-tertiary-container/10 text-on-tertiary-container px-2 py-1 rounded-full">
                  <span className="material-symbols-outlined text-[10px]">check_circle</span>
                  Redeemable
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest bg-error/10 text-error px-2 py-1 rounded-full">
                  <span className="material-symbols-outlined text-[10px]">block</span>
                  Not redeemable
                </span>
              )}
              <button onClick={onClose} disabled={isBusy}
                className="w-8 h-8 rounded-full bg-surface-container hover:bg-surface-container-high flex items-center justify-center transition-colors disabled:opacity-40">
                <span className="material-symbols-outlined text-[16px] text-on-surface-variant">close</span>
              </button>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto flex-1">

          {/* Not redeemable — full block */}
          {!withdrawalEnabled && (
            <div className="text-center space-y-4 py-6">
              <div className="w-16 h-16 bg-error/10 rounded-full flex items-center justify-center mx-auto">
                <span className="material-symbols-outlined text-error text-3xl">block</span>
              </div>
              <h3 className="font-headline font-extrabold text-xl text-on-surface">Withdrawal Not Supported</h3>
              <p className="text-sm text-on-surface-variant leading-relaxed">
                This vault does not support withdrawals via Composer. You'll need to withdraw directly through the{' '}
                <span className="font-bold text-on-surface">{vault?.protocol?.name ?? 'protocol'}</span> interface.
              </p>
              {vault?.protocol?.url && (
                <a
                  href={vault.protocol.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-primary-container text-white rounded-xl font-bold text-sm hover:opacity-90 transition-all"
                >
                  <span className="material-symbols-outlined text-[16px]">open_in_new</span>
                  Go to {vault?.protocol?.name ?? 'Protocol'}
                </a>
              )}
              <button onClick={onClose}
                className="block w-full py-3 rounded-xl text-sm font-bold text-on-surface-variant border border-surface-container-high hover:bg-surface-container transition-all">
                Close
              </button>
            </div>
          )}

          {withdrawalEnabled && (
            <>
              {/* Vault summary */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-surface-container rounded-xl p-3 text-center">
                  <p className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant mb-1">APY</p>
                  <p className="font-headline font-black text-base text-on-tertiary-container">{apyDisplay}</p>
                </div>
                <div className="bg-surface-container rounded-xl p-3 text-center">
                  <p className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant mb-1">30D APY</p>
                  <p className="font-headline font-black text-base text-on-surface">{apy30dDisplay}</p>
                </div>
                <div className="bg-surface-container rounded-xl p-3 text-center">
                  <p className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant mb-1">Network</p>
                  <p className="font-bold text-sm text-on-surface truncate">{getChainName(vaultChainId)}</p>
                </div>
              </div>

              {/* Position balance */}
              <div className="flex items-center justify-between p-3 bg-surface-container rounded-xl">
                <div>
                  <p className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant">Your Position</p>
                  <p className="font-bold text-sm text-on-surface mt-0.5">
                    {hasBalance
                      ? `${lpBalanceHuman.toFixed(4)} ${underlyingSymbol}`
                      : `$${balanceUsd.toLocaleString()}`
                    }
                  </p>
                </div>
                {balanceUsd > 0 && (
                  <p className="text-sm text-on-surface-variant font-medium">${balanceUsd.toLocaleString()}</p>
                )}
              </div>

              {/* Destination mode */}
              {txStep === 'idle' && (
                <div className="space-y-3">
                  <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant block">
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

                  {destMode === 'custom' && (
                    <div className="space-y-2 p-3 bg-on-tertiary-container/5 border border-on-tertiary-container/20 rounded-xl">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="material-symbols-outlined text-on-tertiary-container text-[14px]">bolt</span>
                        <p className="text-[10px] font-black uppercase tracking-widest text-on-tertiary-container">
                          Composer — withdraw to any chain
                        </p>
                      </div>
                      <ChainPicker value={destChainId} onChange={handleDestChainChange} label="Receive on chain" />
                      <DestTokenPicker
                        destChainId={destChainId}
                        selectedToken={destToken}
                        onTokenSelect={setDestToken}
                        walletAddress={address}
                      />
                      {isCrossChainWithdraw && (
                        <p className="text-[10px] text-on-tertiary-container font-medium mt-1">
                          ⚡ Composer bridges {getChainName(vaultChainId)} → {getChainName(destChainId)} automatically.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Withdraw type */}
              {txStep === 'idle' && (
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

              {/* Partial amount */}
              {txStep === 'idle' && withdrawType === 'partial' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">
                      Amount ({underlyingSymbol})
                    </label>
                    {hasBalance && (
                      <span className="text-xs font-medium text-on-surface-variant">
                        Balance: <span className="text-on-tertiary-container font-bold">{lpBalanceHuman.toFixed(4)}</span> {underlyingSymbol}
                      </span>
                    )}
                  </div>

                  <div className={`relative flex items-center border-2 rounded-xl transition-all ${
                    amount && !isBusy
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
                    {hasBalance && (
                      <div className="flex items-center gap-1 pr-3">
                        <button onClick={setHalf} disabled={isBusy}
                          className="px-2 py-1 text-[10px] font-black uppercase text-on-surface-variant bg-surface-container rounded-lg hover:bg-surface-container-high transition-colors disabled:opacity-40">
                          50%
                        </button>
                        <button onClick={setMax} disabled={isBusy}
                          className="px-2 py-1 text-[10px] font-black uppercase tracking-wider text-error bg-error/10 rounded-lg hover:bg-error/20 transition-colors disabled:opacity-40">
                          MAX
                        </button>
                      </div>
                    )}
                  </div>

                  {!hasBalance && (
                    <p className="text-[11px] text-on-surface-variant font-medium px-1">
                      Enter the amount of {underlyingSymbol} you'd like to withdraw.
                    </p>
                  )}
                </div>
              )}

              {/* Full withdraw summary */}
              {txStep === 'idle' && withdrawType === 'full' && (
                <div className="p-4 bg-error/5 border border-error/20 rounded-xl">
                  <p className="font-bold text-sm text-on-surface">Withdraw everything</p>
                  <p className="text-xs text-on-surface-variant mt-1">
                    {hasBalance
                      ? `${lpBalanceHuman.toFixed(4)} ${underlyingSymbol} ($${balanceUsd.toLocaleString()})`
                      : `$${balanceUsd.toLocaleString()}`
                    }
                    {destMode === 'custom' && destToken
                      ? ` → ${destToken.symbol} on ${getChainName(destChainId)}`
                      : ` → ${underlyingSymbol} on ${getChainName(vaultChainId)}`
                    }
                  </p>
                  {!hasBalance && (
                    <p className="text-[11px] text-amber-600 font-medium mt-2">
                      ⚠ Balance data may be unavailable. The withdrawal will attempt to use your on-chain balance.
                    </p>
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
                      Withdraw All{destMode === 'custom' && destToken ? ` → ${destToken.symbol} on ${getChainName(destChainId)}` : ''}
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-[18px]">remove_circle</span>
                      {amount ? `Withdraw ${amount} ${underlyingSymbol}` : 'Enter an amount'}
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
            </>
          )}
        </div>
      </div>
    </div>
  )
}