// src/pages/CompareApyPage.jsx
// APY from API is already a percentage (e.g. 3.8 = 3.8%) — NO * 100 anywhere
import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import AppShell from '../components/AppShell'
import DepositModal from '../components/DepositModal'
import {
  getSupportedChains,
  getVaultsForChain,
  getVaultByAddress,
  computeVaultRankScore,
} from '../services/earnApi'
import {
  fetchDefiLlamaPools,
  matchVaultToPool,
  computeRiskScore,
  GRADE_CONFIG,
} from '../services/defiLlama'
import { SUPPORTED_CHAINS } from '../services/tokenBalances'

const CHAIN_NAMES_MAP = Object.fromEntries(SUPPORTED_CHAINS.map(c => [c.id, c.name]))
function resolveChainName(chainId) {
  if (!chainId) return 'Unknown'
  return CHAIN_NAMES_MAP[chainId] ?? `Chain ${chainId}`
}

function fmt(val) {
  if (val == null) return 'N/A'
  return `${val.toFixed(2)}%`
}

function fmtTvl(usd) {
  const n = Number(usd ?? 0)
  if (n >= 1_000_000_000) return `$${(n / 1e9).toFixed(1)}B`
  if (n >= 1_000_000)     return `$${(n / 1e6).toFixed(1)}M`
  if (n >= 1_000)         return `$${(n / 1e3).toFixed(0)}K`
  return n > 0 ? `$${n.toFixed(0)}` : '—'
}

async function ensureFullVaultData(vault) {
  if (vault.analytics?.apy30d != null) return vault
  if (vault.chainId && vault.address) {
    try {
      const full = await getVaultByAddress(vault.chainId, vault.address)
      if (full) {
        return {
          ...full,
          network: full.network ?? vault.network ?? resolveChainName(full.chainId),
          _chainName: vault._chainName,
        }
      }
    } catch { /* use what we have */ }
  }
  return vault
}

function RiskBadge({ riskData, size = 'sm' }) {
  if (!riskData) {
    return (
      <span className={`inline-flex items-center justify-center font-black rounded-lg border
        ${size === 'lg' ? 'w-10 h-10 text-base' : 'w-8 h-8 text-sm'}
        bg-surface-container border-surface-container-high text-on-surface-variant`}>
        —
      </span>
    )
  }
  const { grade, score } = riskData
  const cfg = GRADE_CONFIG[grade]
  return (
    <span
      className={`inline-flex items-center justify-center font-black rounded-lg border cursor-default
        ${size === 'lg' ? 'w-10 h-10 text-base' : 'w-8 h-8 text-sm'}`}
      style={{ color: cfg.color, background: cfg.bg, borderColor: cfg.border }}
      title={`Risk Grade ${grade} · Score ${score}/100`}
    >
      {grade}
    </span>
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

function VaultSelector({ label, onSelect, preSelectedVault }) {
  const [chains, setChains]               = useState([])
  const [selectedChain, setSelectedChain] = useState(null)
  const [vaults, setVaults]               = useState([])
  const [step, setStep]                   = useState('loading-chains')
  const [loading, setLoading]             = useState(false)
  const [enriching, setEnriching]         = useState(false)
  const [error, setError]                 = useState(null)
  const [search, setSearch]               = useState('')

  useEffect(() => {
    loadChains()
  }, [])

  // If a pre-selected vault is passed (from navigation state), auto-select it
  useEffect(() => {
    if (preSelectedVault && step !== 'loading-chains') {
      handlePreSelect(preSelectedVault)
    }
  }, [preSelectedVault, step])

  async function handlePreSelect(vault) {
    setEnriching(true)
    try {
      const full = await ensureFullVaultData({
        ...vault,
        network: vault.network ?? resolveChainName(vault.chainId),
      })
      onSelect(full)
      setStep('done')
    } finally {
      setEnriching(false)
    }
  }

  async function loadChains() {
    setStep('loading-chains')
    try {
      const data = await getSupportedChains()
      setChains(data)
      setStep('pick-chain')
    } catch {
      setError('Failed to load chains')
      setStep('pick-chain')
    }
  }

  async function handleChainSelect(chain) {
    setSelectedChain(chain)
    setLoading(true)
    setError(null)
    setVaults([])
    setSearch('')
    try {
      setVaults(await getVaultsForChain({ chainId: chain.chainId, maxPages: 5 }))
      setStep('pick-vault')
    } catch (e) {
      setError('Failed to load vaults: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleVaultSelect(vault) {
    setEnriching(true)
    try {
      const full = await ensureFullVaultData({
        ...vault,
        network: vault.network ?? resolveChainName(vault.chainId),
      })
      onSelect(full)
      setStep('done')
    } finally {
      setEnriching(false)
    }
  }

  const filteredVaults = vaults.filter(v =>
    v.name.toLowerCase().includes(search.toLowerCase()) ||
    v.protocol.name.toLowerCase().includes(search.toLowerCase()) ||
    v.underlyingTokens?.some(t => t.symbol.toLowerCase().includes(search.toLowerCase()))
  )

  const cardBase = 'bg-surface-container-lowest rounded-2xl clinical-shadow border border-surface-container p-6 space-y-4'

  if (step === 'loading-chains' || enriching) return (
    <div className={cardBase}>
      <SelectorHeader label={label} />
      <div className="flex flex-col items-center gap-3 py-6">
        <span className="material-symbols-outlined text-on-surface-variant text-3xl animate-spin">progress_activity</span>
        <p className="text-xs text-on-surface-variant">{enriching ? 'Loading vault data...' : 'Loading chains...'}</p>
      </div>
    </div>
  )

  if (step === 'done') return null

  return (
    <div className={cardBase}>
      <SelectorHeader label={label} />
      {error && <p className="text-xs text-on-error-container bg-error-container/20 px-3 py-2 rounded-lg">{error}</p>}

      {step === 'pick-chain' && (
        <div className="space-y-3">
          <p className="text-xs font-bold text-on-surface-variant uppercase tracking-widest">Choose a Chain</p>
          {chains.length === 0
            ? <div className="animate-pulse space-y-2">{[1,2,3].map(i => <div key={i} className="h-10 bg-surface-container rounded-xl" />)}</div>
            : (
              <div className="grid grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1">
                {chains.map(chain => (
                  <button key={chain.chainId} onClick={() => handleChainSelect(chain)}
                    className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-surface-container hover:bg-primary-container hover:text-white transition-all text-left group">
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
            <p className="text-xs font-bold text-on-surface-variant uppercase tracking-widest">{selectedChain?.name} Vaults</p>
            <button onClick={() => { setStep('pick-chain'); setVaults([]) }}
              className="text-[10px] text-on-surface-variant hover:text-on-surface flex items-center gap-1">
              <span className="material-symbols-outlined text-[12px]">arrow_back</span>Change chain
            </button>
          </div>
          {loading
            ? <div className="animate-pulse space-y-2">{[1,2,3,4].map(i => <div key={i} className="h-14 bg-surface-container rounded-xl" />)}</div>
            : (
              <>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-[16px] text-on-surface-variant">search</span>
                  <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search vault or protocol..."
                    className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-surface-container-high bg-surface-container-low text-sm focus:outline-none focus:ring-2 focus:ring-primary-container/30 font-medium" />
                </div>
                <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                  {filteredVaults.length === 0
                    ? <p className="text-center text-sm text-on-surface-variant py-6">No vaults found</p>
                    : filteredVaults.map((vault, i) => (
                      <button key={vault.address + i} onClick={() => handleVaultSelect(vault)}
                        className="w-full flex items-center justify-between p-3 rounded-xl bg-surface-container hover:bg-secondary-container/40 transition-all text-left">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-lg bg-surface-container-high flex items-center justify-center shrink-0">
                            <span className="material-symbols-outlined text-on-surface-variant text-[14px]">account_balance</span>
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-sm text-on-surface truncate">{vault.name}</p>
                            <p className="text-[10px] text-on-surface-variant">{vault.protocol.name} · {vault.underlyingTokens?.map(t => t.symbol).join(', ')}</p>
                          </div>
                        </div>
                        <div className="text-right shrink-0 ml-2">
                          <p className="font-black text-sm text-on-tertiary-container">{fmt(vault.analytics?.apy?.total)}</p>
                          <p className="text-[9px] text-on-surface-variant">{Math.round(computeVaultRankScore(vault) * 100)}/100</p>
                        </div>
                      </button>
                    ))}
                </div>
              </>
            )}
        </div>
      )}
    </div>
  )
}

function SelectedVaultChip({ vault, label, onClear }) {
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
          <p className="font-black text-lg text-on-tertiary-container">{fmt(vault.analytics?.apy?.total)}</p>
          <p className="text-[9px] text-on-surface-variant uppercase tracking-wider">APY</p>
        </div>
        <button onClick={onClear} className="w-7 h-7 rounded-full bg-surface-container hover:bg-error-container/30 flex items-center justify-center transition-colors">
          <span className="material-symbols-outlined text-[14px] text-on-surface-variant">close</span>
        </button>
      </div>
    </div>
  )
}

function ComparisonRow({ metricLabel, valA, valB, winA, winB, icon, nodeA, nodeB }) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 py-3 border-b border-surface-container last:border-0">
      <div className="text-right">
        {nodeA ?? (
          <>
            <p className={`font-headline font-black text-lg leading-none ${winA ? 'text-on-tertiary-container' : 'text-on-surface'}`}>{valA}</p>
            {winA && <span className="text-[9px] font-black text-on-tertiary-container uppercase tracking-widest">▲ Better</span>}
          </>
        )}
      </div>
      <div className="flex flex-col items-center gap-1 px-4">
        {icon && <span className="material-symbols-outlined text-[16px] text-on-surface-variant">{icon}</span>}
        <p className="text-[9px] font-black uppercase tracking-widest text-on-surface-variant text-center whitespace-nowrap">{metricLabel}</p>
      </div>
      <div className="text-left">
        {nodeB ?? (
          <>
            <p className={`font-headline font-black text-lg leading-none ${winB ? 'text-on-tertiary-container' : 'text-on-surface'}`}>{valB}</p>
            {winB && <span className="text-[9px] font-black text-on-tertiary-container uppercase tracking-widest">▲ Better</span>}
          </>
        )}
      </div>
    </div>
  )
}

function ComparisonPanel({ vaultA, vaultB, riskDataA, riskDataB, onClose, onDepositA, onDepositB }) {
  if (!vaultA || !vaultB) return null

  const apyA   = vaultA.analytics?.apy?.total
  const apyB   = vaultB.analytics?.apy?.total
  const apy30A = vaultA.analytics?.apy30d
  const apy30B = vaultB.analytics?.apy30d
  const tvlA   = Number(vaultA.analytics?.tvl?.usd ?? 0)
  const tvlB   = Number(vaultB.analytics?.tvl?.usd ?? 0)
  const scoreA = riskDataA?.score ?? Math.round(computeVaultRankScore(vaultA) * 100)
  const scoreB = riskDataB?.score ?? Math.round(computeVaultRankScore(vaultB) * 100)

  const apyWinA   = apyA != null && apyB != null && apyA > apyB
  const apyWinB   = apyA != null && apyB != null && apyB > apyA
  const apy30WinA = apy30A != null && apy30B != null && apy30A > apy30B
  const apy30WinB = apy30A != null && apy30B != null && apy30B > apy30A
  const tvlWinA   = tvlA > tvlB
  const tvlWinB   = tvlB > tvlA
  const scoreWinA = scoreA > scoreB
  const scoreWinB = scoreB > scoreA

  const winsA = [apyWinA, apy30WinA, tvlWinA, scoreWinA].filter(Boolean).length
  const winsB = [apyWinB, apy30WinB, tvlWinB, scoreWinB].filter(Boolean).length

  const annualGain = apyA != null && apyB != null ? Math.abs((apyA - apyB) / 100 * 10_000) : null
  const apyDiff    = apyA != null && apyB != null ? Math.abs(apyA - apyB).toFixed(2) : null

  const winnerVault = winsA > winsB ? vaultA : winsB > winsA ? vaultB : apyWinA ? vaultA : vaultB
  const winnerLabel = winnerVault === vaultA ? 'Vault A' : 'Vault B'
  const isTie       = winsA === winsB && apyA === apyB

  const tokenA     = vaultA.underlyingTokens?.map(t => t.symbol).join(', ') || '—'
  const tokenB     = vaultB.underlyingTokens?.map(t => t.symbol).join(', ') || '—'
  const chainNameA = vaultA.network ?? resolveChainName(vaultA.chainId)
  const chainNameB = vaultB.network ?? resolveChainName(vaultB.chainId)

  function riskNode(riskData, score, win) {
    if (!riskData) {
      return (
        <div>
          <p className={`font-black text-lg ${win ? 'text-on-tertiary-container' : 'text-on-surface'}`}>{score}/100</p>
          {win && <span className="text-[9px] font-black text-on-tertiary-container uppercase tracking-widest">▲ Better</span>}
        </div>
      )
    }
    const cfg = GRADE_CONFIG[riskData.grade]
    return (
      <div className="flex items-center gap-2">
        <span
          className="inline-flex items-center justify-center w-8 h-8 text-sm font-black rounded-lg border"
          style={{ color: cfg.color, background: cfg.bg, borderColor: cfg.border }}
        >{riskData.grade}</span>
        <div>
          <p className={`font-black text-sm ${win ? 'text-on-tertiary-container' : 'text-on-surface'}`}>{riskData.score}/100</p>
          {win && <span className="text-[9px] font-black text-on-tertiary-container uppercase tracking-widest">▲ Better</span>}
        </div>
      </div>
    )
  }

  const winnerOnDeposit = winnerVault === vaultA ? onDepositA : onDepositB

  return (
    <div className="bg-surface-container-lowest rounded-2xl clinical-shadow border border-surface-container overflow-hidden">
      <div className="px-6 py-4 border-b border-surface-container flex items-center justify-between bg-surface-container-low">
        <div>
          <h2 className="font-headline font-extrabold text-xl text-on-surface tracking-tight">Head-to-Head Comparison</h2>
          <p className="text-xs text-on-surface-variant mt-0.5">Based on current live data · Risk grades from DeFiLlama</p>
        </div>
        <button onClick={onClose} className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center hover:bg-error-container/30 transition-colors">
          <span className="material-symbols-outlined text-[16px] text-on-surface-variant">close</span>
        </button>
      </div>

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

      <div className="px-6 pb-2 pt-2 border-t border-surface-container">
        <ComparisonRow metricLabel="Current APY"   valA={fmt(apyA)}    valB={fmt(apyB)}    winA={apyWinA}   winB={apyWinB}   icon="trending_up" />
        <ComparisonRow metricLabel="30-Day Avg APY" valA={fmt(apy30A)}  valB={fmt(apy30B)}  winA={apy30WinA} winB={apy30WinB} icon="history" />
        <ComparisonRow metricLabel="Total TVL"      valA={fmtTvl(tvlA)} valB={fmtTvl(tvlB)} winA={tvlWinA}   winB={tvlWinB}   icon="savings" />
        <ComparisonRow metricLabel="Risk Score" icon="verified"
          nodeA={<div className="flex justify-end">{riskNode(riskDataA, scoreA, scoreWinA)}</div>}
          nodeB={<div className="flex justify-start">{riskNode(riskDataB, scoreB, scoreWinB)}</div>}
        />
        <ComparisonRow metricLabel="Protocol" valA={vaultA.protocol.name} valB={vaultB.protocol.name} winA={false} winB={false} icon="hub" />
        <ComparisonRow metricLabel="Chain"    valA={chainNameA}           valB={chainNameB}           winA={false} winB={false} icon="link" />
      </div>

      {/* Winner + Deposit CTA */}
      <div className="mx-6 mb-6 rounded-2xl overflow-hidden border border-surface-container">
        <div className={`p-5 flex items-center justify-between gap-4 ${isTie ? 'bg-surface-container' : winnerVault === vaultA ? 'bg-primary-container' : 'bg-on-tertiary-container/90'}`}>
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
          <div className={`shrink-0 px-3 py-1.5 rounded-full font-black text-xs border ${isTie ? 'border-surface-container-high text-on-surface-variant bg-surface-container-low' : 'border-white/30 text-white bg-white/10'}`}>
            {isTie ? 'Tie' : winnerLabel}
          </div>
        </div>

        {!isTie && (
          <div className="p-4 bg-surface-container-low flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-on-surface-variant">Doctor's Recommendation</p>
              <p className="text-sm font-bold text-on-surface mt-0.5">
                Deposit into <span className="text-on-tertiary-container">{winnerVault.name}</span> on {winnerVault.network ?? resolveChainName(winnerVault.chainId)}
              </p>
              <p className="text-[10px] text-on-surface-variant mt-0.5">
                {fmt(winnerLabel === 'Vault A' ? apyA : apyB)} APY · {winnerVault.protocol.name}
              </p>
            </div>
            <button
              onClick={() => winnerOnDeposit(winnerVault)}
              className="shrink-0 flex items-center gap-2 px-5 py-2.5 bg-primary-container text-white rounded-xl font-black text-sm hover:opacity-90 transition-all shadow-md"
            >
              <span className="material-symbols-outlined text-[16px]">add_circle</span>
              Deposit
            </button>
          </div>
        )}

        {isTie && (
          <div className="p-4 bg-surface-container-low flex items-center justify-between gap-4">
            <p className="text-sm font-bold text-on-surface">Both vaults are strong — deposit into either</p>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => onDepositA(vaultA)}
                className="flex items-center gap-1.5 px-4 py-2 border-2 border-primary-container text-primary-container rounded-xl font-black text-xs hover:bg-primary-container hover:text-white transition-all"
              >
                <span className="material-symbols-outlined text-[14px]">looks_one</span>
                Vault A
              </button>
              <button
                onClick={() => onDepositB(vaultB)}
                className="flex items-center gap-1.5 px-4 py-2 bg-primary-container text-white rounded-xl font-black text-xs hover:opacity-90 transition-all"
              >
                <span className="material-symbols-outlined text-[14px]">looks_two</span>
                Vault B
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function ComparePage() {
  const location = useLocation()
  const [vaultA, setVaultA]                 = useState(null)
  const [vaultB, setVaultB]                 = useState(null)
  const [showComparison, setShowComparison] = useState(false)
  const [llamaPools, setLlamaPools]         = useState([])
  const [riskDataA, setRiskDataA]           = useState(null)
  const [riskDataB, setRiskDataB]           = useState(null)
  const [depositModal, setDepositModal]     = useState(null)

  // Pre-selected vault from navigation state (e.g. from Dashboard)
  const preSelectedVaultA = location.state?.vaultA ?? null

  useEffect(() => {
    fetchDefiLlamaPools().then(pools => setLlamaPools(pools)).catch(() => {})
  }, [])

  useEffect(() => {
    if (!vaultA || !llamaPools.length) { setRiskDataA(null); return }
    const pool = matchVaultToPool(vaultA, llamaPools)
    setRiskDataA(pool ? computeRiskScore(vaultA, pool) : null)
  }, [vaultA, llamaPools])

  useEffect(() => {
    if (!vaultB || !llamaPools.length) { setRiskDataB(null); return }
    const pool = matchVaultToPool(vaultB, llamaPools)
    setRiskDataB(pool ? computeRiskScore(vaultB, pool) : null)
  }, [vaultB, llamaPools])

  useEffect(() => {
    if (vaultA && vaultB) { const t = setTimeout(() => setShowComparison(true), 200); return () => clearTimeout(t) }
    else setShowComparison(false)
  }, [vaultA, vaultB])

  function resetComparison() {
    setVaultA(null); setVaultB(null)
    setShowComparison(false)
    setRiskDataA(null); setRiskDataB(null)
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
                'bg-surface-container text-on-surface-variant'}`}>
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
          {!vaultA
            ? <VaultSelector label="Vault A" onSelect={setVaultA} preSelectedVault={preSelectedVaultA} />
            : <SelectedVaultChip vault={vaultA} label="Vault A" onClear={() => { setVaultA(null); setRiskDataA(null) }} />}

          {!vaultA
            ? (
              <div className="bg-surface-container-lowest rounded-2xl border-2 border-dashed border-surface-container p-8 flex flex-col items-center justify-center text-center gap-3 opacity-40">
                <span className="material-symbols-outlined text-4xl text-on-surface-variant">looks_two</span>
                <p className="font-bold text-sm text-on-surface-variant">Select Vault A first</p>
              </div>
            )
            : !vaultB
              ? <VaultSelector label="Vault B" onSelect={setVaultB} preSelectedVault={null} />
              : <SelectedVaultChip vault={vaultB} label="Vault B" onClear={() => { setVaultB(null); setRiskDataB(null) }} />}
        </div>
      ) : (
        <div className="space-y-4 mb-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <SelectedVaultChip vault={vaultA} label="Vault A" onClear={() => { setVaultA(null); setShowComparison(false); setRiskDataA(null) }} />
            <SelectedVaultChip vault={vaultB} label="Vault B" onClear={() => { setVaultB(null); setShowComparison(false); setRiskDataB(null) }} />
          </div>
        </div>
      )}

      {showComparison && vaultA && vaultB && (
        <div className="mb-6">
          <ComparisonPanel
            vaultA={vaultA}
            vaultB={vaultB}
            riskDataA={riskDataA}
            riskDataB={riskDataB}
            onClose={resetComparison}
            onDepositA={(v) => setDepositModal(v)}
            onDepositB={(v) => setDepositModal(v)}
          />
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

      {depositModal && (
        <DepositModal
          vault={depositModal}
          onClose={() => setDepositModal(null)}
          onSuccess={() => setDepositModal(null)}
        />
      )}
    </AppShell>
  )
}