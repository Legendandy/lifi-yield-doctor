// src/pages/CompareApyPage.jsx
import { useState, useEffect } from 'react'
import { useAccount } from 'wagmi'
import AppShell from '../components/AppShell'
import {
  getPortfolioPositions,
  getVaults,
  getSupportedChains,
  getVaultsForChain,
  computeVaultRankScore,
} from '../services/earnApi'
import { SUPPORTED_CHAINS } from '../services/tokenBalances'

const CHAIN_NAMES_MAP = Object.fromEntries(SUPPORTED_CHAINS.map(c => [c.id, c.name]))
function resolveChainName(chainId) {
  if (!chainId) return 'Unknown'
  return CHAIN_NAMES_MAP[chainId] ?? `Chain ${chainId}`
}

function fmt(val) {
  if (val == null) return 'N/A'
  return `${(val * 100).toFixed(2)}%`
}

function fmtTvl(usd) {
  const n = Number(usd ?? 0)
  if (n >= 1_000_000_000) return `$${(n / 1e9).toFixed(1)}B`
  if (n >= 1_000_000) return `$${(n / 1e6).toFixed(1)}M`
  if (n >= 1_000) return `$${(n / 1e3).toFixed(0)}K`
  return `$${n.toFixed(0)}`
}

// ─── Convert enriched position to vault-shaped object ─────────────────────────
// After getPortfolioPositions() enrichment, positions have:
// - pos.apy, pos.apy30d (from vault analytics)
// - pos.vaultName, pos.protocolName
// - pos.vaultAddress (= vault LP token address)
// - pos._vaultData (full vault object)
function positionToVault(pos) {
  // Use _vaultData if available (most accurate)
  if (pos._vaultData) {
    return {
      ...pos._vaultData,
      network: resolveChainName(pos._vaultData.chainId),
      _isPosition: true,
      _positionBalanceUsd: Number(pos.balanceUsd ?? 0),
    }
  }

  // Fallback: synthesize from position fields
  return {
    name: pos.vaultName ?? `${pos.asset?.symbol ?? 'Unknown'} Vault`,
    protocol: { name: pos.protocolName ?? 'Unknown' },
    network: resolveChainName(pos.chainId),
    chainId: pos.chainId,
    address: pos.vaultAddress ?? pos.asset?.address ?? '',
    analytics: {
      apy: { total: pos.apy ?? null },
      apy30d: pos.apy30d ?? null,
      apy7d: pos.apy7d ?? null,
      tvl: { usd: pos.tvlUsd ?? 0 },
    },
    underlyingTokens: pos.underlyingTokens ?? (pos.asset ? [pos.asset] : []),
    _isPosition: true,
    _positionBalanceUsd: Number(pos.balanceUsd ?? 0),
  }
}

// ─── Vault Selector ───────────────────────────────────────────────────────────
function VaultSelector({ label, address, onSelect }) {
  const [positions, setPositions] = useState([])
  const [chains, setChains] = useState([])
  const [selectedChain, setSelectedChain] = useState(null)
  const [vaults, setVaults] = useState([])
  const [step, setStep] = useState('loading')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!address) { setStep('pick-chain'); loadChains(); return }
    setStep('loading')
    // getPortfolioPositions now returns enriched positions with apy, apy30d
    getPortfolioPositions(address)
      .then(pos => {
        if (pos && pos.length > 0) {
          setPositions(pos)
          setStep('pick-position')
        } else {
          setStep('pick-chain')
          loadChains()
        }
      })
      .catch(() => { setStep('pick-chain'); loadChains() })
  }, [address])

  async function loadChains() {
    try {
      const data = await getSupportedChains()
      setChains(data)
    } catch {
      setError('Failed to load chains')
    }
  }

  async function handleChainSelect(chain) {
    setSelectedChain(chain)
    setLoading(true)
    setError(null)
    setVaults([])
    setSearch('')
    try {
      const data = await getVaultsForChain({ chainId: chain.chainId, maxPages: 5 })
      setVaults(data)
      setStep('pick-vault')
    } catch (e) {
      setError('Failed to load vaults: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  function handlePositionSelect(pos) {
    // Convert enriched position to vault shape
    const asVault = positionToVault(pos)
    onSelect(asVault)
    setStep('done')
  }

  function handleVaultSelect(vault) {
    const enriched = {
      ...vault,
      network: vault.network ?? resolveChainName(vault.chainId),
    }
    onSelect(enriched)
    setStep('done')
  }

  const filteredVaults = vaults.filter(v =>
    v.name.toLowerCase().includes(search.toLowerCase()) ||
    v.protocol.name.toLowerCase().includes(search.toLowerCase()) ||
    v.underlyingTokens?.some(t => t.symbol.toLowerCase().includes(search.toLowerCase()))
  )

  const cardBase = 'bg-surface-container-lowest rounded-2xl clinical-shadow border border-surface-container p-6 space-y-4'

  if (step === 'loading') {
    return (
      <div className={cardBase}>
        <SelectorHeader label={label} />
        <div className="animate-pulse space-y-2">
          {[1,2,3].map(i => <div key={i} className="h-12 bg-surface-container rounded-xl" />)}
        </div>
      </div>
    )
  }

  if (step === 'done') return null

  return (
    <div className={cardBase}>
      <SelectorHeader label={label} />

      {error && (
        <p className="text-xs text-on-error-container bg-error-container/20 px-3 py-2 rounded-lg">{error}</p>
      )}

      {step === 'pick-position' && (
        <div className="space-y-3">
          <p className="text-xs font-bold text-on-surface-variant uppercase tracking-widest">Your Active Vaults</p>
          <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
            {positions.map((pos, i) => {
              const chainName = resolveChainName(pos.chainId)
              const vaultName = pos.vaultName ?? `${pos.asset?.symbol ?? 'Unknown'} Vault`
              const apy = pos.apy
              const apy30d = pos.apy30d
              return (
                <button
                  key={i}
                  onClick={() => handlePositionSelect(pos)}
                  className="w-full flex items-center justify-between p-3 rounded-xl bg-surface-container hover:bg-secondary-container/40 transition-all text-left group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-primary-container/10 flex items-center justify-center">
                      <span className="material-symbols-outlined text-primary-container text-[16px]">account_balance</span>
                    </div>
                    <div>
                      <p className="font-bold text-sm text-on-surface">{vaultName}</p>
                      <p className="text-[10px] text-on-surface-variant">
                        {pos.protocolName ?? 'Unknown'} · {chainName}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-black text-sm text-on-tertiary-container">{fmt(apy)}</p>
                    {apy30d != null && (
                      <p className="text-[9px] text-on-surface-variant">30d: {fmt(apy30d)}</p>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
          <button
            onClick={() => { setStep('pick-chain'); loadChains() }}
            className="w-full py-2.5 rounded-xl border-2 border-dashed border-surface-container-high text-xs font-bold text-on-surface-variant hover:border-primary-container hover:text-on-surface transition-all"
          >
            Or pick from all chains →
          </button>
        </div>
      )}

      {step === 'pick-chain' && (
        <div className="space-y-3">
          <p className="text-xs font-bold text-on-surface-variant uppercase tracking-widest">Choose a Chain</p>
          {chains.length === 0 ? (
            <div className="animate-pulse space-y-2">
              {[1,2,3].map(i => <div key={i} className="h-10 bg-surface-container rounded-xl" />)}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1">
              {chains.map(chain => (
                <button
                  key={chain.chainId}
                  onClick={() => handleChainSelect(chain)}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-surface-container hover:bg-primary-container hover:text-white transition-all text-left group"
                >
                  <span className="material-symbols-outlined text-[16px] text-on-surface-variant group-hover:text-white">hub</span>
                  <span className="font-bold text-sm text-on-surface group-hover:text-white capitalize">{chain.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {step === 'pick-vault' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-on-surface-variant uppercase tracking-widest">
              {selectedChain?.name} Vaults
            </p>
            <button onClick={() => { setStep('pick-chain'); setVaults([]) }}
              className="text-[10px] text-on-surface-variant hover:text-on-surface flex items-center gap-1">
              <span className="material-symbols-outlined text-[12px]">arrow_back</span>
              Change chain
            </button>
          </div>

          {loading ? (
            <div className="animate-pulse space-y-2">
              {[1,2,3,4].map(i => <div key={i} className="h-14 bg-surface-container rounded-xl" />)}
            </div>
          ) : (
            <>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-[16px] text-on-surface-variant">search</span>
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search vault or protocol..."
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-surface-container-high bg-surface-container-low text-sm focus:outline-none focus:ring-2 focus:ring-primary-container/30 font-medium"
                />
              </div>

              <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                {filteredVaults.length === 0 ? (
                  <p className="text-center text-sm text-on-surface-variant py-6">No vaults found</p>
                ) : (
                  filteredVaults.map((vault, i) => {
                    const apy = vault.analytics?.apy?.total
                    const score = computeVaultRankScore(vault)
                    return (
                      <button
                        key={vault.address + i}
                        onClick={() => handleVaultSelect(vault)}
                        className="w-full flex items-center justify-between p-3 rounded-xl bg-surface-container hover:bg-secondary-container/40 transition-all text-left"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-lg bg-surface-container-high flex items-center justify-center shrink-0">
                            <span className="material-symbols-outlined text-on-surface-variant text-[14px]">account_balance</span>
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-sm text-on-surface truncate">{vault.name}</p>
                            <p className="text-[10px] text-on-surface-variant">
                              {vault.protocol.name} · {vault.underlyingTokens?.map(t => t.symbol).join(', ')}
                            </p>
                          </div>
                        </div>
                        <div className="text-right shrink-0 ml-2">
                          <p className="font-black text-sm text-on-tertiary-container">{fmt(apy)}</p>
                          <p className="text-[9px] text-on-surface-variant">{Math.round(score * 100)}/100</p>
                        </div>
                      </button>
                    )
                  })
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function SelectorHeader({ label }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-9 h-9 rounded-xl bg-primary-container/10 flex items-center justify-center">
        <span className="material-symbols-outlined text-primary-container text-[18px]">
          {label === 'Vault A' ? 'looks_one' : 'looks_two'}
        </span>
      </div>
      <div>
        <h3 className="font-headline font-bold text-base text-on-surface">{label}</h3>
        <p className="text-[10px] text-on-surface-variant uppercase tracking-widest">Select vault to compare</p>
      </div>
    </div>
  )
}

// ─── Selected Vault Chip ──────────────────────────────────────────────────────
function SelectedVaultChip({ vault, label, onClear }) {
  const apy = vault?.analytics?.apy?.total
  const chainName = vault?.network ?? resolveChainName(vault?.chainId)
  return (
    <div className="bg-surface-container-lowest rounded-2xl clinical-shadow border border-surface-container p-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary-container/10 flex items-center justify-center">
          <span className="material-symbols-outlined text-primary-container text-[18px]">
            {label === 'Vault A' ? 'looks_one' : 'looks_two'}
          </span>
        </div>
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">{label}</p>
          <p className="font-bold text-sm text-on-surface">{vault.name}</p>
          <p className="text-[10px] text-on-surface-variant">{vault.protocol.name} · {chainName}</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="text-right">
          <p className="font-black text-lg text-on-tertiary-container">{fmt(apy)}</p>
          <p className="text-[9px] text-on-surface-variant uppercase tracking-wider">APY</p>
        </div>
        <button onClick={onClear}
          className="w-7 h-7 rounded-full bg-surface-container hover:bg-error-container/30 flex items-center justify-center transition-colors">
          <span className="material-symbols-outlined text-[14px] text-on-surface-variant">close</span>
        </button>
      </div>
    </div>
  )
}

// ─── Comparison Row ───────────────────────────────────────────────────────────
function ComparisonRow({ metricLabel, valA, valB, winA, winB, icon }) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 py-3 border-b border-surface-container last:border-0">
      <div className="text-right">
        <p className={`font-headline font-black text-lg leading-none ${winA ? 'text-on-tertiary-container' : 'text-on-surface'}`}>
          {valA}
        </p>
        {winA && <span className="text-[9px] font-black text-on-tertiary-container uppercase tracking-widest">▲ Better</span>}
      </div>
      <div className="flex flex-col items-center gap-1 px-4">
        {icon && <span className="material-symbols-outlined text-[16px] text-on-surface-variant">{icon}</span>}
        <p className="text-[9px] font-black uppercase tracking-widest text-on-surface-variant text-center whitespace-nowrap">{metricLabel}</p>
      </div>
      <div className="text-left">
        <p className={`font-headline font-black text-lg leading-none ${winB ? 'text-on-tertiary-container' : 'text-on-surface'}`}>
          {valB}
        </p>
        {winB && <span className="text-[9px] font-black text-on-tertiary-container uppercase tracking-widest">▲ Better</span>}
      </div>
    </div>
  )
}

// ─── Comparison Panel ─────────────────────────────────────────────────────────
function ComparisonPanel({ vaultA, vaultB, onClose }) {
  if (!vaultA || !vaultB) return null

  const apyA = vaultA.analytics?.apy?.total
  const apyB = vaultB.analytics?.apy?.total
  const apy30A = vaultA.analytics?.apy30d
  const apy30B = vaultB.analytics?.apy30d
  const tvlA = Number(vaultA.analytics?.tvl?.usd ?? 0)
  const tvlB = Number(vaultB.analytics?.tvl?.usd ?? 0)
  const scoreA = computeVaultRankScore(vaultA)
  const scoreB = computeVaultRankScore(vaultB)

  const apyWinA = apyA != null && apyB != null && apyA > apyB
  const apyWinB = apyA != null && apyB != null && apyB > apyA
  const apy30WinA = apy30A != null && apy30B != null && apy30A > apy30B
  const apy30WinB = apy30A != null && apy30B != null && apy30B > apy30A
  const tvlWinA = tvlA > tvlB
  const tvlWinB = tvlB > tvlA
  const scoreWinA = scoreA > scoreB
  const scoreWinB = scoreB > scoreA

  const winsA = [apyWinA, apy30WinA, tvlWinA, scoreWinA].filter(Boolean).length
  const winsB = [apyWinB, apy30WinB, tvlWinB, scoreWinB].filter(Boolean).length

  const annualGain = apyA != null && apyB != null ? Math.abs((apyA - apyB) * 10_000) : null
  const apyDiff = apyA != null && apyB != null ? Math.abs((apyA - apyB) * 100).toFixed(2) : null

  const winnerVault = winsA > winsB ? vaultA : winsB > winsA ? vaultB : apyWinA ? vaultA : vaultB
  const winnerLabel = winnerVault === vaultA ? 'Vault A' : 'Vault B'
  const isTie = winsA === winsB && apyA === apyB

  const tokenA = vaultA.underlyingTokens?.map(t => t.symbol).join(', ') || '—'
  const tokenB = vaultB.underlyingTokens?.map(t => t.symbol).join(', ') || '—'
  const chainNameA = vaultA.network ?? resolveChainName(vaultA.chainId)
  const chainNameB = vaultB.network ?? resolveChainName(vaultB.chainId)

  return (
    <div className="bg-surface-container-lowest rounded-2xl clinical-shadow border border-surface-container overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-surface-container flex items-center justify-between bg-surface-container-low">
        <div>
          <h2 className="font-headline font-extrabold text-xl text-on-surface tracking-tight">Head-to-Head Comparison</h2>
          <p className="text-xs text-on-surface-variant mt-0.5">Based on current live data</p>
        </div>
        <button onClick={onClose}
          className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center hover:bg-error-container/30 transition-colors">
          <span className="material-symbols-outlined text-[16px] text-on-surface-variant">close</span>
        </button>
      </div>

      {/* Vault headers */}
      <div className="grid grid-cols-[1fr_auto_1fr] gap-0">
        <div className="p-6 border-r border-surface-container space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary-container/10 flex items-center justify-center">
              <span className="material-symbols-outlined text-primary-container text-[16px]">looks_one</span>
            </div>
            <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Vault A · {chainNameA}</p>
          </div>
          <h3 className="font-headline font-bold text-base text-on-surface leading-snug">{vaultA.name}</h3>
          <div className="flex flex-wrap gap-1">
            <span className="px-2 py-0.5 bg-surface-container text-on-surface-variant rounded-full text-[10px] font-bold">{tokenA}</span>
            <span className="px-2 py-0.5 bg-surface-container text-on-surface-variant rounded-full text-[10px] font-bold">{vaultA.protocol.name}</span>
          </div>
        </div>

        <div className="flex flex-col items-center justify-center px-5">
          <span className="text-xs font-black text-on-surface-variant uppercase tracking-widest">VS</span>
        </div>

        <div className="p-6 space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-on-tertiary-container/10 flex items-center justify-center">
              <span className="material-symbols-outlined text-on-tertiary-container text-[16px]">looks_two</span>
            </div>
            <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Vault B · {chainNameB}</p>
          </div>
          <h3 className="font-headline font-bold text-base text-on-surface leading-snug">{vaultB.name}</h3>
          <div className="flex flex-wrap gap-1">
            <span className="px-2 py-0.5 bg-surface-container text-on-surface-variant rounded-full text-[10px] font-bold">{tokenB}</span>
            <span className="px-2 py-0.5 bg-surface-container text-on-surface-variant rounded-full text-[10px] font-bold">{vaultB.protocol.name}</span>
          </div>
        </div>
      </div>

      {/* Metrics */}
      <div className="px-6 pb-2 pt-2 border-t border-surface-container">
        <ComparisonRow metricLabel="Current APY" valA={fmt(apyA)} valB={fmt(apyB)} winA={apyWinA} winB={apyWinB} icon="trending_up" />
        <ComparisonRow metricLabel="30-Day Avg APY" valA={fmt(apy30A)} valB={fmt(apy30B)} winA={apy30WinA} winB={apy30WinB} icon="history" />
        <ComparisonRow metricLabel="Total TVL" valA={fmtTvl(vaultA.analytics?.tvl?.usd)} valB={fmtTvl(vaultB.analytics?.tvl?.usd)} winA={tvlWinA} winB={tvlWinB} icon="savings" />
        <ComparisonRow metricLabel="Quality Score" valA={`${Math.round(scoreA * 100)}/100`} valB={`${Math.round(scoreB * 100)}/100`} winA={scoreWinA} winB={scoreWinB} icon="verified" />
        <ComparisonRow metricLabel="Protocol" valA={vaultA.protocol.name} valB={vaultB.protocol.name} winA={false} winB={false} icon="hub" />
        <ComparisonRow metricLabel="Chain" valA={chainNameA} valB={chainNameB} winA={false} winB={false} icon="link" />
      </div>

      {/* Verdict */}
      <div className="mx-6 mb-6 rounded-2xl overflow-hidden border border-surface-container">
        <div className={`p-5 flex items-center justify-between gap-4 ${
          isTie ? 'bg-surface-container' : winnerVault === vaultA ? 'bg-primary-container' : 'bg-on-tertiary-container/90'
        }`}>
          <div className="flex items-center gap-3">
            <span className={`material-symbols-outlined text-2xl ${isTie ? 'text-on-surface-variant' : 'text-white'}`}>
              {isTie ? 'balance' : 'emoji_events'}
            </span>
            <div>
              <p className={`font-headline font-bold text-base leading-snug ${isTie ? 'text-on-surface' : 'text-white'}`}>
                {isTie ? "It's a tie — both vaults are competitive" : `${winnerLabel} wins · ${Math.max(winsA, winsB)} of 4 metrics`}
              </p>
              {annualGain != null && apyDiff != null && !isTie && (
                <p className={`text-xs mt-0.5 ${winnerVault === vaultA ? 'text-on-primary-container' : 'text-white/70'}`}>
                  +${annualGain.toLocaleString(undefined, { maximumFractionDigits: 0 })}/yr more on $10,000 · APY gap: {apyDiff}%
                </p>
              )}
            </div>
          </div>
          <div className={`shrink-0 px-3 py-1.5 rounded-full font-black text-xs border ${
            isTie ? 'border-surface-container-high text-on-surface-variant bg-surface-container-low' : 'border-white/30 text-white bg-white/10'
          }`}>
            {isTie ? 'Tie' : winnerLabel}
          </div>
        </div>

        {!isTie && (
          <div className="p-4 bg-surface-container-low">
            <p className="text-xs font-black uppercase tracking-widest text-on-surface-variant">Doctor's Recommendation</p>
            <p className="text-sm font-bold text-on-surface mt-0.5">
              Deposit into <span className="text-on-tertiary-container">{winnerVault.name}</span> on {winnerVault.network ?? resolveChainName(winnerVault.chainId)}
            </p>
            <p className="text-[10px] text-on-surface-variant mt-0.5">
              {fmt(winnerLabel === 'Vault A' ? apyA : apyB)} APY · {winnerVault.protocol.name}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ComparePage() {
  const { address } = useAccount()
  const [vaultA, setVaultA] = useState(null)
  const [vaultB, setVaultB] = useState(null)
  const [showComparison, setShowComparison] = useState(false)

  useEffect(() => {
    if (vaultA && vaultB) {
      const t = setTimeout(() => setShowComparison(true), 200)
      return () => clearTimeout(t)
    } else {
      setShowComparison(false)
    }
  }, [vaultA, vaultB])

  function resetComparison() {
    setVaultA(null)
    setVaultB(null)
    setShowComparison(false)
  }

  const progress = (vaultA ? 1 : 0) + (vaultB ? 1 : 0)

  return (
    <AppShell>
      <header className="mb-8 flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-headline font-extrabold tracking-tight text-on-surface">Compare Vaults</h1>
          <p className="text-on-surface-variant font-medium mt-1">Clinical side-by-side analysis of any two DeFi yield vaults.</p>
        </div>
        <div className="hidden sm:flex items-center gap-2">
          {['Pick Vault A', 'Pick Vault B', 'View Results'].map((step, i) => (
            <div key={step} className="flex items-center gap-2">
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${
                i < progress ? 'bg-on-tertiary-container text-white' :
                i === progress ? 'bg-primary-container/10 text-primary-container border border-primary-container/30' :
                'bg-surface-container text-on-surface-variant'
              }`}>
                {i < progress && <span className="material-symbols-outlined text-[12px]">check</span>}
                {step}
              </div>
              {i < 2 && <span className="material-symbols-outlined text-[14px] text-on-surface-variant">chevron_right</span>}
            </div>
          ))}
        </div>
      </header>

      {!showComparison ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {!vaultA ? (
            <VaultSelector label="Vault A" address={address} onSelect={setVaultA} />
          ) : (
            <SelectedVaultChip vault={vaultA} label="Vault A" onClear={() => setVaultA(null)} />
          )}

          {!vaultA ? (
            <div className="bg-surface-container-lowest rounded-2xl border-2 border-dashed border-surface-container p-8 flex flex-col items-center justify-center text-center gap-3 opacity-40">
              <span className="material-symbols-outlined text-4xl text-on-surface-variant">looks_two</span>
              <p className="font-bold text-sm text-on-surface-variant">Select Vault A first</p>
            </div>
          ) : !vaultB ? (
            <VaultSelector label="Vault B" address={address} onSelect={setVaultB} />
          ) : (
            <SelectedVaultChip vault={vaultB} label="Vault B" onClear={() => setVaultB(null)} />
          )}
        </div>
      ) : (
        <div className="space-y-4 mb-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <SelectedVaultChip vault={vaultA} label="Vault A" onClear={() => { setVaultA(null); setShowComparison(false) }} />
            <SelectedVaultChip vault={vaultB} label="Vault B" onClear={() => { setVaultB(null); setShowComparison(false) }} />
          </div>
        </div>
      )}

      {showComparison && vaultA && vaultB && (
        <div className="mb-6">
          <ComparisonPanel vaultA={vaultA} vaultB={vaultB} onClose={resetComparison} />
        </div>
      )}

      {showComparison && (
        <div className="flex justify-center mt-2">
          <button onClick={resetComparison}
            className="flex items-center gap-2 px-6 py-2.5 rounded-full border-2 border-surface-container-high text-sm font-bold text-on-surface-variant hover:border-primary-container hover:text-on-surface transition-all">
            <span className="material-symbols-outlined text-[16px]">refresh</span>
            Start New Comparison
          </button>
        </div>
      )}
    </AppShell>
  )
}