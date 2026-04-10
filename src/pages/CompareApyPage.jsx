// src/pages/ComparePage.jsx
import { useState, useEffect, useCallback } from 'react'
import { useAccount } from 'wagmi'
import AppShell from '../components/AppShell'
import {
  getPortfolioPositions,
  getVaults,
  getSupportedChains,
  computeVaultRankScore,
} from '../services/earnApi'

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(val, decimals = 2) {
  if (val == null) return 'N/A'
  return `${(val * 100).toFixed(decimals)}%`
}

function fmtTvl(usd) {
  const n = Number(usd ?? 0)
  if (n >= 1_000_000_000) return `$${(n / 1e9).toFixed(1)}B`
  if (n >= 1_000_000) return `$${(n / 1e6).toFixed(1)}M`
  if (n >= 1_000) return `$${(n / 1e3).toFixed(0)}K`
  return `$${n.toFixed(0)}`
}

// ─── Vault Selector Step ──────────────────────────────────────────────────────
function VaultSelector({ label, address, onSelect }) {
  const [positions, setPositions] = useState([])
  const [chains, setChains] = useState([])
  const [selectedChain, setSelectedChain] = useState(null)
  const [vaults, setVaults] = useState([])
  const [step, setStep] = useState('loading') // loading | pick-position | pick-chain | pick-vault | done
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')

  // Boot: check positions
  useEffect(() => {
    if (!address) { setStep('pick-chain'); loadChains(); return }
    setStep('loading')
    getPortfolioPositions(address)
      .then((pos) => {
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
    } catch (e) {
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
      const data = await getVaults({ chainId: chain.chainId, limit: 100, minTvlUsd: 10_000 })
      setVaults(data)
      setStep('pick-vault')
    } catch (e) {
      setError('Failed to load vaults: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  function handlePositionSelect(pos) {
    // Position object may not have full vault data — we synthesize a minimal vault
    const synth = {
      name: `${pos.asset?.symbol ?? 'Unknown'} Vault`,
      protocol: { name: pos.protocolName ?? 'Unknown' },
      network: `Chain ${pos.chainId}`,
      chainId: pos.chainId,
      address: pos.address ?? pos.vaultAddress ?? pos.protocolName,
      analytics: {
        apy: { total: pos.apy ?? null },
        apy1d: null,
        apy7d: null,
        apy30d: pos.apy30d ?? null,
        tvl: { usd: pos.tvlUsd ?? pos.balanceUsd ?? 0 },
      },
      underlyingTokens: pos.asset ? [{ symbol: pos.asset.symbol }] : [],
      _isPosition: true,
    }
    onSelect(synth)
    setStep('done')
  }

  function handleVaultSelect(vault) {
    onSelect(vault)
    setStep('done')
  }

  function handleSkipToChain() {
    setStep('pick-chain')
    loadChains()
  }

  const filteredVaults = vaults.filter(
    (v) =>
      v.name.toLowerCase().includes(search.toLowerCase()) ||
      v.protocol.name.toLowerCase().includes(search.toLowerCase()) ||
      v.underlyingTokens?.some((t) => t.symbol.toLowerCase().includes(search.toLowerCase()))
  )

  // ── Render ─────────────────────────────────────────────────────────────────
  const cardBase =
    'bg-surface-container-lowest rounded-2xl clinical-shadow border border-surface-container p-6 space-y-4'

  if (step === 'loading') {
    return (
      <div className={cardBase}>
        <SelectorHeader label={label} />
        <div className="animate-pulse space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-surface-container rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  if (step === 'done') {
    // should not render — parent hides this when vault is selected
    return null
  }

  return (
    <div className={cardBase}>
      <SelectorHeader label={label} />

      {error && (
        <p className="text-xs text-on-error-container bg-error-container/20 px-3 py-2 rounded-lg">
          {error}
        </p>
      )}

      {/* STEP: pick from active positions */}
      {step === 'pick-position' && (
        <div className="space-y-3">
          <p className="text-xs font-bold text-on-surface-variant uppercase tracking-widest">
            Your Active Vaults
          </p>
          <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
            {positions.map((pos, i) => (
              <button
                key={i}
                onClick={() => handlePositionSelect(pos)}
                className="w-full flex items-center justify-between p-3 rounded-xl bg-surface-container hover:bg-secondary-container/40 transition-all text-left group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-primary-container/10 flex items-center justify-center">
                    <span className="material-symbols-outlined text-primary-container text-[16px]">
                      account_balance
                    </span>
                  </div>
                  <div>
                    <p className="font-bold text-sm text-on-surface">
                      {pos.asset?.symbol ?? 'Unknown'} Vault
                    </p>
                    <p className="text-[10px] text-on-surface-variant">
                      {pos.protocolName} · Chain {pos.chainId}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-black text-sm text-on-tertiary-container">
                    ${Number(pos.balanceUsd ?? 0).toLocaleString()}
                  </p>
                  <p className="text-[10px] text-on-surface-variant">balance</p>
                </div>
              </button>
            ))}
          </div>
          <button
            onClick={handleSkipToChain}
            className="w-full py-2.5 rounded-xl border-2 border-dashed border-surface-container-high text-xs font-bold text-on-surface-variant hover:border-primary-container hover:text-on-surface transition-all"
          >
            Or pick from all chains →
          </button>
        </div>
      )}

      {/* STEP: pick chain */}
      {step === 'pick-chain' && (
        <div className="space-y-3">
          <p className="text-xs font-bold text-on-surface-variant uppercase tracking-widest">
            Choose a Chain
          </p>
          {chains.length === 0 ? (
            <div className="animate-pulse space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-10 bg-surface-container rounded-xl" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1">
              {chains.map((chain) => (
                <button
                  key={chain.chainId}
                  onClick={() => handleChainSelect(chain)}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-surface-container hover:bg-primary-container hover:text-white transition-all text-left group"
                >
                  <span className="material-symbols-outlined text-[16px] text-on-surface-variant group-hover:text-white">
                    hub
                  </span>
                  <span className="font-bold text-sm text-on-surface group-hover:text-white capitalize">
                    {chain.name}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* STEP: pick vault */}
      {step === 'pick-vault' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-on-surface-variant uppercase tracking-widest">
              {selectedChain?.name} Vaults
            </p>
            <button
              onClick={() => { setStep('pick-chain'); setVaults([]) }}
              className="text-[10px] text-on-surface-variant hover:text-on-surface flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-[12px]">arrow_back</span>
              Change chain
            </button>
          </div>

          {loading ? (
            <div className="animate-pulse space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-14 bg-surface-container rounded-xl" />
              ))}
            </div>
          ) : (
            <>
              {/* Search */}
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-[16px] text-on-surface-variant">
                  search
                </span>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search vault or protocol..."
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-surface-container-high bg-surface-container-low text-sm focus:outline-none focus:ring-2 focus:ring-primary-container/30 font-medium"
                />
              </div>

              <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                {filteredVaults.length === 0 ? (
                  <p className="text-center text-sm text-on-surface-variant py-6">
                    No vaults found
                  </p>
                ) : (
                  filteredVaults.map((vault, i) => {
                    const apy = vault.analytics?.apy?.total
                    const score = computeVaultRankScore(vault)
                    return (
                      <button
                        key={vault.address + i}
                        onClick={() => handleVaultSelect(vault)}
                        className="w-full flex items-center justify-between p-3 rounded-xl bg-surface-container hover:bg-secondary-container/40 transition-all text-left group"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-lg bg-surface-container-high flex items-center justify-center shrink-0">
                            <span className="material-symbols-outlined text-on-surface-variant text-[14px]">
                              account_balance
                            </span>
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-sm text-on-surface truncate">
                              {vault.name}
                            </p>
                            <p className="text-[10px] text-on-surface-variant">
                              {vault.protocol.name} · {vault.underlyingTokens?.map((t) => t.symbol).join(', ')}
                            </p>
                          </div>
                        </div>
                        <div className="text-right shrink-0 ml-2">
                          <p className="font-black text-sm text-on-tertiary-container">
                            {fmt(apy)}
                          </p>
                          <p className="text-[9px] text-on-surface-variant">
                            {Math.round(score * 100)}/100
                          </p>
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
        <p className="text-[10px] text-on-surface-variant uppercase tracking-widest">
          Select vault to compare
        </p>
      </div>
    </div>
  )
}

// ─── Selected Vault Mini-Card ─────────────────────────────────────────────────
function SelectedVaultChip({ vault, label, onClear }) {
  const apy = vault?.analytics?.apy?.total
  return (
    <div className="bg-surface-container-lowest rounded-2xl clinical-shadow border border-surface-container p-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary-container/10 flex items-center justify-center">
          <span className="material-symbols-outlined text-primary-container text-[18px]">
            {label === 'Vault A' ? 'looks_one' : 'looks_two'}
          </span>
        </div>
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
            {label}
          </p>
          <p className="font-bold text-sm text-on-surface">{vault.name}</p>
          <p className="text-[10px] text-on-surface-variant">
            {vault.protocol.name} · {vault.network}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="text-right">
          <p className="font-black text-lg text-on-tertiary-container">{fmt(apy)}</p>
          <p className="text-[9px] text-on-surface-variant uppercase tracking-wider">APY</p>
        </div>
        <button
          onClick={onClear}
          className="w-7 h-7 rounded-full bg-surface-container hover:bg-error-container/30 flex items-center justify-center transition-colors"
        >
          <span className="material-symbols-outlined text-[14px] text-on-surface-variant hover:text-on-error-container">
            close
          </span>
        </button>
      </div>
    </div>
  )
}

// ─── Comparison Panel ─────────────────────────────────────────────────────────
function WinBadge({ wins }) {
  if (!wins) return null
  return (
    <div className="flex flex-col items-center justify-center py-2">
      <div className="px-2.5 py-1 bg-on-tertiary-container/10 rounded-full">
        <span className="text-[10px] font-black text-on-tertiary-container uppercase tracking-widest">
          ▲ BETTER
        </span>
      </div>
    </div>
  )
}

function ComparisonRow({ metricLabel, valA, valB, winA, winB, icon }) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 py-3 border-b border-surface-container last:border-0">
      {/* Vault A value */}
      <div className="text-right space-y-0.5">
        <p className={`font-headline font-black text-lg leading-none ${winA ? 'text-on-tertiary-container' : 'text-on-surface'}`}>
          {valA}
        </p>
        {winA && <WinBadge wins />}
      </div>

      {/* Center label */}
      <div className="flex flex-col items-center gap-1 px-4">
        {icon && (
          <span className="material-symbols-outlined text-[16px] text-on-surface-variant">{icon}</span>
        )}
        <p className="text-[9px] font-black uppercase tracking-widest text-on-surface-variant text-center whitespace-nowrap">
          {metricLabel}
        </p>
      </div>

      {/* Vault B value */}
      <div className="text-left space-y-0.5">
        <p className={`font-headline font-black text-lg leading-none ${winB ? 'text-on-tertiary-container' : 'text-on-surface'}`}>
          {valB}
        </p>
        {winB && <WinBadge wins />}
      </div>
    </div>
  )
}

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

  // Win conditions
  const apyWinA = apyA != null && apyB != null && apyA > apyB
  const apyWinB = apyA != null && apyB != null && apyB > apyA
  const apy30WinA = apy30A != null && apy30B != null && apy30A > apy30B
  const apy30WinB = apy30A != null && apy30B != null && apy30B > apy30A
  const tvlWinA = tvlA > tvlB
  const tvlWinB = tvlB > tvlA
  const scoreWinA = scoreA > scoreB
  const scoreWinB = scoreB > scoreA

  // Count wins
  const winsA = [apyWinA, apy30WinA, tvlWinA, scoreWinA].filter(Boolean).length
  const winsB = [apyWinB, apy30WinB, tvlWinB, scoreWinB].filter(Boolean).length

  // Annual gain on $10k deposit
  const annualGain =
    apyA != null && apyB != null
      ? Math.abs((apyA - apyB) * 10_000)
      : null
  const betterVault = apyA != null && apyB != null && apyA > apyB ? 'Vault A' : 'Vault B'
  const apyDiff =
    apyA != null && apyB != null
      ? Math.abs((apyA - apyB) * 100).toFixed(2)
      : null

  const tokenA = vaultA.underlyingTokens?.map((t) => t.symbol).join(', ') || '—'
  const tokenB = vaultB.underlyingTokens?.map((t) => t.symbol).join(', ') || '—'

  return (
    <div className="bg-surface-container-lowest rounded-2xl clinical-shadow border border-surface-container overflow-hidden animate-in">
      {/* Header */}
      <div className="px-6 py-4 border-b border-surface-container flex items-center justify-between bg-surface-container-low">
        <div>
          <h2 className="font-headline font-extrabold text-xl text-on-surface tracking-tight">
            Head-to-Head Comparison
          </h2>
          <p className="text-xs text-on-surface-variant mt-0.5">Based on current live data</p>
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center hover:bg-error-container/30 transition-colors"
        >
          <span className="material-symbols-outlined text-[16px] text-on-surface-variant">close</span>
        </button>
      </div>

      {/* Vault headers */}
      <div className="grid grid-cols-[1fr_auto_1fr] gap-0">
        {/* Vault A header */}
        <div className="p-6 border-r border-surface-container space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary-container/10 flex items-center justify-center">
              <span className="material-symbols-outlined text-primary-container text-[16px]">looks_one</span>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Vault A · {vaultA.network}</p>
            </div>
          </div>
          <h3 className="font-headline font-bold text-base text-on-surface leading-snug">{vaultA.name}</h3>
          <div className="flex flex-wrap gap-1">
            <span className="px-2 py-0.5 bg-surface-container text-on-surface-variant rounded-full text-[10px] font-bold">{tokenA}</span>
            <span className="px-2 py-0.5 bg-surface-container text-on-surface-variant rounded-full text-[10px] font-bold">{vaultA.protocol.name}</span>
          </div>
        </div>

        {/* Wins badge center */}
        <div className="flex flex-col items-center justify-center px-4 border-r border-surface-container">
          <div className="text-center space-y-1">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-lg ${winsA > winsB ? 'bg-on-tertiary-container text-white' : 'bg-surface-container text-on-surface-variant'}`}>
              {winsA}
            </div>
            <p className="text-[8px] font-black uppercase tracking-widest text-on-surface-variant">Wins</p>
          </div>
        </div>

        {/* Vault B header */}
        <div className="p-6 space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-on-tertiary-container/10 flex items-center justify-center">
              <span className="material-symbols-outlined text-on-tertiary-container text-[16px]">looks_two</span>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Vault B · {vaultB.network}</p>
            </div>
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
        <ComparisonRow
          metricLabel="Current APY"
          valA={fmt(apyA)}
          valB={fmt(apyB)}
          winA={apyWinA}
          winB={apyWinB}
          icon="trending_up"
        />
        <ComparisonRow
          metricLabel="30-Day Avg APY"
          valA={fmt(apy30A)}
          valB={fmt(apy30B)}
          winA={apy30WinA}
          winB={apy30WinB}
          icon="history"
        />
        <ComparisonRow
          metricLabel="Total TVL"
          valA={fmtTvl(vaultA.analytics?.tvl?.usd)}
          valB={fmtTvl(vaultB.analytics?.tvl?.usd)}
          winA={tvlWinA}
          winB={tvlWinB}
          icon="savings"
        />
        <ComparisonRow
          metricLabel="Quality Score"
          valA={`${Math.round(scoreA * 100)}/100`}
          valB={`${Math.round(scoreB * 100)}/100`}
          winA={scoreWinA}
          winB={scoreWinB}
          icon="verified"
        />
        <ComparisonRow
          metricLabel="Protocol"
          valA={vaultA.protocol.name}
          valB={vaultB.protocol.name}
          winA={false}
          winB={false}
          icon="hub"
        />
        <ComparisonRow
          metricLabel="Chain"
          valA={vaultA.network ?? `Chain ${vaultA.chainId}`}
          valB={vaultB.network ?? `Chain ${vaultB.chainId}`}
          winA={false}
          winB={false}
          icon="link"
        />
      </div>

      {/* Bottom: Annual gain callout */}
      {annualGain != null && apyDiff != null && (
        <div className="mx-6 mb-6 p-4 bg-primary-container rounded-xl flex items-start gap-3">
          <span className="material-symbols-outlined text-on-tertiary-container text-[20px] mt-0.5 shrink-0">
            trending_up
          </span>
          <div>
            <p className="font-bold text-sm text-white leading-snug">
              {betterVault} earns{' '}
              <span className="text-tertiary-fixed font-black">
                +${annualGain.toLocaleString(undefined, { maximumFractionDigits: 0 })}/yr more
              </span>{' '}
              on a $10,000 deposit
            </p>
            <p className="text-xs text-on-primary-container mt-0.5">
              APY difference: {apyDiff}%
            </p>
          </div>
        </div>
      )}

      {/* Winner banner */}
      <div className={`mx-6 mb-6 p-4 rounded-xl flex items-center justify-between ${winsA > winsB ? 'bg-on-tertiary-container/10 border border-on-tertiary-container/20' : winsB > winsA ? 'bg-secondary-container border border-secondary-container' : 'bg-surface-container'}`}>
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-on-tertiary-container text-[22px]">
            {winsA === winsB ? 'balance' : 'emoji_events'}
          </span>
          <div>
            <p className="font-headline font-bold text-sm text-on-surface">
              {winsA === winsB
                ? "It's a tie — both vaults are competitive"
                : `${winsA > winsB ? 'Vault A' : 'Vault B'} wins overall with ${Math.max(winsA, winsB)} of 4 metrics`}
            </p>
            <p className="text-[10px] text-on-surface-variant">
              Doctor's recommendation based on APY, TVL, and stability
            </p>
          </div>
        </div>
        <div className={`px-3 py-1.5 rounded-full font-black text-xs ${winsA > winsB ? 'bg-on-tertiary-container text-white' : winsB > winsA ? 'bg-primary-container text-white' : 'bg-surface-container-high text-on-surface-variant'}`}>
          {winsA === winsB ? 'Tie' : winsA > winsB ? 'A Wins' : 'B Wins'}
        </div>
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

  // Auto-trigger comparison when both are selected
  useEffect(() => {
    if (vaultA && vaultB) {
      // Slight delay for polish
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

  // Progress indicator
  const progress = (vaultA ? 1 : 0) + (vaultB ? 1 : 0)

  return (
    <AppShell>
      {/* Header */}
      <header className="mb-8 flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-headline font-extrabold tracking-tight text-on-surface">
            Compare Vaults
          </h1>
          <p className="text-on-surface-variant font-medium mt-1">
            Clinical side-by-side analysis of any two DeFi yield vaults.
          </p>
        </div>

        {/* Progress pills */}
        <div className="hidden sm:flex items-center gap-2">
          {['Pick Vault A', 'Pick Vault B', 'View Results'].map((step, i) => (
            <div key={step} className="flex items-center gap-2">
              <div
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${
                  i < progress
                    ? 'bg-on-tertiary-container text-white'
                    : i === progress
                    ? 'bg-primary-container/10 text-primary-container border border-primary-container/30'
                    : 'bg-surface-container text-on-surface-variant'
                }`}
              >
                {i < progress && (
                  <span className="material-symbols-outlined text-[12px]">check</span>
                )}
                {step}
              </div>
              {i < 2 && (
                <span className="material-symbols-outlined text-[14px] text-on-surface-variant">
                  chevron_right
                </span>
              )}
            </div>
          ))}
        </div>
      </header>

      {/* Comparison result (shown when both selected) */}
      {showComparison && vaultA && vaultB && (
        <div className="mb-8">
          <ComparisonPanel
            vaultA={vaultA}
            vaultB={vaultB}
            onClose={resetComparison}
          />
        </div>
      )}

      {/* Selectors — hide when showing comparison, show reset option instead */}
      {!showComparison ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Vault A */}
          {!vaultA ? (
            <VaultSelector label="Vault A" address={address} onSelect={setVaultA} />
          ) : (
            <SelectedVaultChip vault={vaultA} label="Vault A" onClear={() => setVaultA(null)} />
          )}

          {/* Vault B — only show after A is selected */}
          {!vaultA ? (
            <div className="bg-surface-container-lowest rounded-2xl border-2 border-dashed border-surface-container p-8 flex flex-col items-center justify-center text-center gap-3 opacity-40">
              <span className="material-symbols-outlined text-4xl text-on-surface-variant">looks_two</span>
              <p className="font-bold text-sm text-on-surface-variant">Select Vault A first</p>
              <p className="text-xs text-on-surface-variant">Then choose Vault B to compare</p>
            </div>
          ) : !vaultB ? (
            <VaultSelector label="Vault B" address={address} onSelect={setVaultB} />
          ) : (
            <SelectedVaultChip vault={vaultB} label="Vault B" onClear={() => setVaultB(null)} />
          )}
        </div>
      ) : (
        /* After comparison, show mini chips + reset */
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <SelectedVaultChip vault={vaultA} label="Vault A" onClear={() => { setVaultA(null); setShowComparison(false) }} />
            <SelectedVaultChip vault={vaultB} label="Vault B" onClear={() => { setVaultB(null); setShowComparison(false) }} />
          </div>
          <div className="flex justify-center">
            <button
              onClick={resetComparison}
              className="flex items-center gap-2 px-6 py-2.5 rounded-full border-2 border-surface-container-high text-sm font-bold text-on-surface-variant hover:border-primary-container hover:text-on-surface transition-all"
            >
              <span className="material-symbols-outlined text-[16px]">refresh</span>
              Start New Comparison
            </button>
          </div>
        </div>
      )}

      {/* Help text */}
      {!vaultA && !showComparison && (
        <div className="mt-8 p-6 bg-surface-container rounded-xl flex items-start gap-4">
          <span className="material-symbols-outlined text-on-tertiary-container text-2xl shrink-0">
            lightbulb
          </span>
          <div>
            <p className="font-bold text-sm text-on-surface">How comparison works</p>
            <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">
              Pick two vaults — from your active positions or any chain — and we'll instantly compare
              them across APY, 30-day average, TVL depth, and our composite quality score. You'll
              also see the projected annual gain difference on a $10,000 deposit.
            </p>
          </div>
        </div>
      )}
    </AppShell>
  )
}