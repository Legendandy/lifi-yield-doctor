// src/pages/DashboardPage.jsx
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAccount } from 'wagmi'
import AppShell from '../components/AppShell'
import DepositModal from '../components/DepositModal'
import WithdrawModal from '../components/WithdrawModal'
import { getPortfolioPositions, getVaultsForChain, getSupportedChains } from '../services/earnApi'
import {
  fetchDefiLlamaPools,
  matchVaultToPool,
  computeRiskScore,
  GRADE_CONFIG,
} from '../services/defiLlama'
import { SUPPORTED_CHAINS } from '../services/tokenBalances'

const CHAIN_NAMES = Object.fromEntries(SUPPORTED_CHAINS.map(c => [c.id, c.name]))
function getChainName(chainId) {
  if (!chainId) return 'Unknown'
  return CHAIN_NAMES[chainId] ?? `Chain ${chainId}`
}

function fmtApy(val) {
  if (val == null) return 'N/A'
  return `${val.toFixed(2)}%`
}

function fmtTvl(usd) {
  const n = Number(usd ?? 0)
  if (n >= 1_000_000_000) return `$${(n / 1e9).toFixed(1)}B`
  if (n >= 1_000_000) return `$${(n / 1e6).toFixed(1)}M`
  if (n >= 1_000) return `$${(n / 1e3).toFixed(0)}K`
  return `$${n.toFixed(0)}`
}

// ─── Vault Detail Modal ───────────────────────────────────────────────────────
function VaultDetailModal({ vault, riskData, llamaPool, onClose, onDeposit, onCompare }) {
  if (!vault) return null

  const apy = vault.analytics?.apy?.total
  const apy30d = vault.analytics?.apy30d
  const tvl = Number(vault.analytics?.tvl?.usd ?? 0)
  const chainName = vault._chainName ?? getChainName(vault.chainId)
  const predictions = llamaPool?.predictions ?? null
  const isComposable = vault.isTransactional !== false
  const isRedeemable = vault.isRedeemable !== false

  const cfg = riskData ? GRADE_CONFIG[riskData.grade] : null

  let predArrow = null,
    predColor = null,
    predBg = null,
    predPct = null,
    predLabel = null,
    predDirection = null,
    predConfText = null

  if (predictions?.predictedClass != null) {
    const cls = (predictions.predictedClass ?? '').toLowerCase()
    predPct = Math.round(Number(predictions.predictedProbability))
    const conf = predictions.binnedConfidence
    predLabel = { 1: 'Low conf.', 2: 'Med conf.', 3: 'High conf.' }[conf] ?? ''
    predConfText = { 1: 'low confidence', 2: 'medium confidence', 3: 'high confidence' }[conf] ?? ''

    if (cls.includes('up')) {
      predArrow = '↑'; predColor = '#009844'; predBg = 'rgba(0,152,68,0.10)'; predDirection = 'increasing'
    } else if (cls.includes('down')) {
      predArrow = '↓'; predColor = '#ba1a1a'; predBg = 'rgba(186,26,26,0.10)'; predDirection = 'decreasing'
    } else {
      predArrow = '→'; predColor = '#76777d'; predBg = 'rgba(118,119,125,0.10)'; predDirection = 'remaining stable'
    }
  }

  const confColor = {
    1: '#ea580c', 2: '#d97706', 3: '#009844',
  }[predictions?.binnedConfidence] ?? '#76777d'

  const appTooltip = predPct != null && predDirection != null && predConfText != null
    ? `Model predicts a ${predPct}% chance of APY ${predDirection} with ${predConfText}`
    : null

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl flex flex-col" style={{ maxHeight: '90vh' }}>
        <div className="px-6 pt-6 pb-4 border-b border-surface-container shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                {isComposable && (
                  <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest bg-on-tertiary-container/10 text-on-tertiary-container px-2 py-1 rounded-full">
                    <span className="material-symbols-outlined text-[10px]">bolt</span>Cross-chain
                  </span>
                )}
                {isRedeemable && (
                  <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full">
                    ✓ Redeemable
                  </span>
                )}
              </div>
              <h2 className="font-headline font-extrabold text-xl text-on-surface leading-tight">{vault.name}</h2>
              <p className="text-xs text-on-surface-variant mt-0.5 font-medium">{vault.protocol?.name} · {chainName}</p>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-surface-container hover:bg-surface-container-high flex items-center justify-center transition-colors shrink-0">
              <span className="material-symbols-outlined text-[16px] text-on-surface-variant">close</span>
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-surface-container rounded-2xl p-4">
              <p className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant mb-1">Current APY</p>
              <p className="font-headline font-black text-3xl text-on-tertiary-container">{fmtApy(apy)}</p>
            </div>
            <div className="bg-surface-container rounded-2xl p-4">
              <p className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant mb-1">30-Day Avg APY</p>
              <p className="font-headline font-black text-3xl text-on-surface">{apy30d != null ? fmtApy(apy30d) : '—'}</p>
            </div>
            <div className="bg-surface-container rounded-2xl p-4">
              <p className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant mb-1">Total TVL</p>
              <p className="font-headline font-black text-2xl text-on-surface">{fmtTvl(tvl)}</p>
            </div>
            <div className="bg-surface-container rounded-2xl p-4">
              <p className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant mb-1">Risk Grade</p>
              {riskData ? (
                <div className="flex items-center gap-2 mt-1">
                  <span className="inline-flex items-center justify-center w-10 h-10 text-base font-black rounded-xl border"
                    style={{ color: cfg.color, background: cfg.bg, borderColor: cfg.border }}>
                    {riskData.grade}
                  </span>
                  <div>
                    <p className="font-black text-sm text-on-surface">{riskData.score}/100</p>
                    <p className="text-[10px] text-on-surface-variant">{cfg.desc}</p>
                  </div>
                </div>
              ) : (
                <p className="font-headline font-black text-2xl text-on-surface-variant">—</p>
              )}
            </div>
          </div>

          <div className="bg-surface-container rounded-2xl divide-y divide-surface-container-high">
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-xs font-bold text-on-surface-variant uppercase tracking-widest">Protocol</span>
              <span className="text-sm font-black text-on-surface">{vault.protocol?.name ?? '—'}</span>
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-xs font-bold text-on-surface-variant uppercase tracking-widest">Chain</span>
              <span className="text-sm font-black text-on-surface">{chainName}</span>
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <span className="relative group/applabel text-xs font-bold text-on-surface-variant uppercase tracking-widest cursor-default">
                APP
                <span className="pointer-events-none absolute bottom-full left-0 mb-1.5 z-50 opacity-0 group-hover/applabel:opacity-100 transition-opacity duration-150">
                  <span className="block bg-[#131b2e] text-white text-[10px] font-semibold px-2.5 py-1.5 rounded-lg shadow-xl leading-snug whitespace-nowrap">
                    APY Prediction Probability
                  </span>
                </span>
              </span>
              {predArrow ? (
                <div className="flex flex-col items-end gap-0.5">
                  <span className="relative group/apppct inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-sm font-black cursor-default"
                    style={{ color: predColor, background: predBg }}>
                    {predArrow} {predPct}%
                    {appTooltip && (
                      <span className="pointer-events-none absolute bottom-full right-0 mb-1.5 z-50 opacity-0 group-hover/apppct:opacity-100 transition-opacity duration-150 w-max max-w-[220px]">
                        <span className="block bg-[#131b2e] text-white text-[10px] font-semibold px-2.5 py-1.5 rounded-lg shadow-xl leading-snug text-right">
                          {appTooltip}
                        </span>
                      </span>
                    )}
                  </span>
                  {predLabel && <span className="text-[10px] font-bold" style={{ color: confColor }}>{predLabel}</span>}
                </div>
              ) : (
                <span className="text-sm text-on-surface-variant">—</span>
              )}
            </div>
            {vault.underlyingTokens?.length > 0 && (
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-xs font-bold text-on-surface-variant uppercase tracking-widest">Assets</span>
                <div className="flex gap-1.5 flex-wrap justify-end">
                  {vault.underlyingTokens.map((t, i) => (
                    <span key={i} className="flex items-center gap-1 px-2 py-0.5 bg-secondary-container text-on-secondary-container rounded-full text-xs font-bold">
                      {t.logoURI && <img src={t.logoURI} alt={t.symbol} className="w-3.5 h-3.5 rounded-full" onError={e => { e.target.style.display = 'none' }} />}
                      {t.symbol}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="px-6 pb-6 pt-2 shrink-0 flex gap-3">
          <button onClick={() => { onCompare(vault); onClose() }}
            className="flex-1 py-3.5 rounded-2xl font-headline font-black text-sm border-2 border-primary-container text-primary-container hover:bg-primary-container hover:text-white transition-all flex items-center justify-center gap-2">
            <span className="material-symbols-outlined text-[16px]">compare_arrows</span>
            Compare Vault
          </button>
          <button onClick={() => { onDeposit(vault); onClose() }}
            className="flex-1 py-3.5 rounded-2xl font-headline font-black text-sm bg-primary-container text-white hover:opacity-90 transition-all flex items-center justify-center gap-2 shadow-md">
            <span className="material-symbols-outlined text-[16px]">add_circle</span>
            Deposit
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Recommended Vaults ───────────────────────────────────────────────────────
function RecommendedVaults({ onDeposit, onVaultClick }) {
  const [vaults, setVaults] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const chains = await getSupportedChains()
        const results = await Promise.allSettled(
          chains.slice(0, 8).map(chain =>
            getVaultsForChain({ chainId: chain.chainId, maxPages: 3 })
              .then(vs => vs.map(v => ({ ...v, _chainName: chain.name })))
          )
        )
        if (cancelled) return
        const all = results
          .filter(r => r.status === 'fulfilled')
          .flatMap(r => r.value)
          .filter(v => Number(v.analytics?.tvl?.usd ?? 0) >= 10_000_000)
          .sort((a, b) => (b.analytics?.apy?.total ?? 0) - (a.analytics?.apy?.total ?? 0))
          .slice(0, 10)
        setVaults(all)
      } catch { /* silent */ } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  if (loading) {
    return (
      <div className="bg-surface-container-lowest rounded-xl clinical-shadow">
        <div className="p-4 border-b border-surface-container">
          <h3 className="font-headline font-bold text-on-surface">Recommended Vaults</h3>
          <p className="text-xs text-on-surface-variant">Highest APY across all chains · TVL &gt; $10M</p>
        </div>
        <div className="divide-y divide-surface-container animate-pulse">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="p-4 flex justify-between items-center">
              <div className="space-y-1.5">
                <div className="h-3.5 w-40 bg-surface-container rounded" />
                <div className="h-2.5 w-28 bg-surface-container rounded" />
              </div>
              <div className="h-6 w-16 bg-surface-container rounded" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-surface-container-lowest rounded-xl clinical-shadow">
      <div className="p-4 border-b border-surface-container">
        <h3 className="font-headline font-bold text-on-surface">Recommended Vaults</h3>
        <p className="text-xs text-on-surface-variant">Highest APY across all chains · TVL &gt; $10M</p>
      </div>
      <div className="divide-y divide-surface-container">
        {vaults.map((vault, i) => {
          const apy = vault.analytics?.apy?.total
          const tvl = Number(vault.analytics?.tvl?.usd ?? 0)
          const chainName = vault._chainName ?? getChainName(vault.chainId)
          return (
            <button key={vault.address + i} onClick={() => onVaultClick(vault)}
              className="w-full p-4 flex justify-between items-center hover:bg-surface-container-low transition-colors text-left group">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-surface-container flex items-center justify-center shrink-0 text-xs font-black text-on-surface-variant">
                  {i + 1}
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-sm text-on-surface truncate group-hover:text-on-tertiary-container transition-colors">{vault.name}</p>
                  <p className="text-xs text-on-surface-variant">
                    {vault.protocol?.name} · <span className="font-semibold">{chainName}</span> · TVL {fmtTvl(tvl)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-2">
                <span className="font-black text-base text-on-tertiary-container">{fmtApy(apy)}</span>
                <button
                  onClick={e => { e.stopPropagation(); onDeposit(vault) }}
                  className="px-3 py-1 rounded-full text-[10px] font-black bg-primary-container/10 text-primary-container hover:bg-primary-container hover:text-white transition-all border border-primary-container/20">
                  Deposit
                </button>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Dashboard Filter Bar ─────────────────────────────────────────────────────
function DashboardFilterBar({ positions, filters, onFiltersChange }) {
  const chains = [...new Set(positions.map(p => p.chainId).filter(Boolean))]
  const protocols = [...new Set(positions.map(p => p.protocolName ?? p._vaultData?.protocol?.name).filter(Boolean))].sort()
  const assets = [...new Set(
    positions.flatMap(p => (p.underlyingTokens ?? []).map(t => t.symbol)).filter(Boolean)
  )].sort()

  const hasActiveFilters = filters.chain || filters.protocol || filters.asset

  return (
    <div className="flex flex-wrap items-center gap-3 p-4 bg-surface-container-lowest rounded-xl border border-surface-container clinical-shadow mb-4">
      {chains.length > 1 && (
        <div className="flex items-center gap-2">
          <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant shrink-0">Chain</label>
          <select value={filters.chain} onChange={e => onFiltersChange({ ...filters, chain: e.target.value })}
            className="px-3 py-1.5 rounded-xl border border-surface-container-high bg-surface-container-low text-xs font-bold text-on-surface focus:outline-none focus:ring-2 focus:ring-primary-container/30 min-w-[120px]">
            <option value="">All Chains</option>
            {chains.map(id => <option key={id} value={id}>{getChainName(id)}</option>)}
          </select>
        </div>
      )}

      {protocols.length > 1 && (
        <div className="flex items-center gap-2">
          <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant shrink-0">Protocol</label>
          <select value={filters.protocol} onChange={e => onFiltersChange({ ...filters, protocol: e.target.value })}
            className="px-3 py-1.5 rounded-xl border border-surface-container-high bg-surface-container-low text-xs font-bold text-on-surface focus:outline-none focus:ring-2 focus:ring-primary-container/30 min-w-[130px]">
            <option value="">All Protocols</option>
            {protocols.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      )}

      {assets.length > 1 && (
        <div className="flex items-center gap-2">
          <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant shrink-0">Asset</label>
          <select value={filters.asset} onChange={e => onFiltersChange({ ...filters, asset: e.target.value })}
            className="px-3 py-1.5 rounded-xl border border-surface-container-high bg-surface-container-low text-xs font-bold text-on-surface focus:outline-none focus:ring-2 focus:ring-primary-container/30 min-w-[110px]">
            <option value="">All Assets</option>
            {assets.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      )}

      {hasActiveFilters && (
        <button onClick={() => onFiltersChange({ chain: '', protocol: '', asset: '' })}
          className="ml-auto flex items-center gap-1 text-xs text-on-surface-variant hover:text-on-surface transition-colors font-bold">
          <span className="material-symbols-outlined text-[14px]">close</span>
          Clear filters
        </button>
      )}

      {!hasActiveFilters && chains.length <= 1 && protocols.length <= 1 && assets.length <= 1 && (
        <p className="text-xs text-on-surface-variant">Filters appear when you have positions across multiple chains, protocols, or assets.</p>
      )}
    </div>
  )
}

export default function DashboardPage() {
  const { address } = useAccount()
  const navigate = useNavigate()
  const [positions, setPositions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [hasPositions, setHasPositions] = useState(false)
  const [depositModal, setDepositModal] = useState(null)
  const [withdrawModal, setWithdrawModal] = useState(null)
  const [filters, setFilters] = useState({ chain: '', protocol: '', asset: '' })
  const [detailVault, setDetailVault] = useState(null)
  const [detailRiskData, setDetailRiskData] = useState(null)
  const [detailLlamaPool, setDetailLlamaPool] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)

  useEffect(() => {
    if (!address) return
    loadData()
  }, [address])

  async function loadData() {
    setLoading(true)
    setError(null)
    try {
      const userPositions = await getPortfolioPositions(address)
      const hasAny = userPositions && userPositions.length > 0
      setHasPositions(hasAny)
      setPositions(userPositions || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleVaultClick(vault) {
    setDetailVault(vault)
    setDetailRiskData(null)
    setDetailLlamaPool(null)
    setDetailLoading(true)
    try {
      const pools = await fetchDefiLlamaPools()
      const pool = matchVaultToPool(vault, pools)
      setDetailLlamaPool(pool)
      setDetailRiskData(pool ? computeRiskScore(vault, pool) : null)
    } catch { /* silent */ } finally {
      setDetailLoading(false)
    }
  }

  function handleCompare(vault) {
    navigate('/compare', { state: { vaultA: vault } })
  }

  const filteredPositions = positions.filter(pos => {
    if (filters.chain && String(pos.chainId) !== String(filters.chain)) return false
    const proto = pos.protocolName ?? pos._vaultData?.protocol?.name ?? ''
    if (filters.protocol && proto !== filters.protocol) return false
    if (filters.asset) {
      const tokens = pos.underlyingTokens ?? []
      if (!tokens.some(t => t.symbol === filters.asset)) return false
    }
    return true
  })

  return (
    <AppShell>
      <header className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-3xl font-headline font-extrabold tracking-tight text-on-surface">Your Positions</h1>
          <p className="text-on-surface-variant font-medium mt-1">Real-time monitoring of your active vaults.</p>
        </div>
        <div className="flex items-center gap-3">
          {!loading && !error && (
            <span className="px-3 py-1 bg-surface-container-high rounded-full text-[10px] font-bold uppercase tracking-wider text-on-secondary-container">
              {positions.length} Active Vault{positions.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </header>

      {error && (
        <div className="mb-6 p-4 bg-error-container/30 border border-error-container rounded-xl text-on-error-container text-sm font-medium">
          <strong>Error loading data:</strong> {error}
          <button onClick={loadData} className="ml-4 underline hover:no-underline">Retry</button>
        </div>
      )}

      {loading ? (
        <LoadingSkeleton />
      ) : (
        <div className="grid grid-cols-12 gap-8">
          <section className="col-span-12 lg:col-span-7 space-y-4">
            {!hasPositions ? (
              <NoPositionsState onGoToVaults={() => navigate('/vaults')} />
            ) : (
              <>
                <DashboardFilterBar positions={positions} filters={filters} onFiltersChange={setFilters} />

                {filteredPositions.length === 0 ? (
                  <div className="bg-surface-container-lowest rounded-xl clinical-shadow p-8 text-center space-y-3">
                    <span className="material-symbols-outlined text-3xl text-on-surface-variant">filter_list_off</span>
                    <p className="font-bold text-on-surface">No positions match your filters</p>
                    <button onClick={() => setFilters({ chain: '', protocol: '', asset: '' })}
                      className="text-xs text-on-tertiary-container font-bold underline">Clear filters</button>
                  </div>
                ) : (
                  filteredPositions.map((pos, i) => (
                    <PositionCard key={i} position={pos} />
                  ))
                )}
              </>
            )}
          </section>

          <section className="col-span-12 lg:col-span-5 space-y-6">
            <RecommendedVaults
              onDeposit={(vault) => setDepositModal(vault)}
              onVaultClick={handleVaultClick}
            />
          </section>
        </div>
      )}

      {depositModal && (
        <DepositModal
          vault={depositModal}
          onClose={() => setDepositModal(null)}
          onSuccess={() => { setDepositModal(null); setTimeout(() => loadData(), 2000) }}
        />
      )}

      {withdrawModal && (
        <WithdrawModal
          vault={withdrawModal.vault}
          position={withdrawModal.position}
          onClose={() => setWithdrawModal(null)}
          onSuccess={() => { setWithdrawModal(null); setTimeout(() => loadData(), 2000) }}
        />
      )}

      {detailVault && (
        <VaultDetailModal
          vault={detailVault}
          riskData={detailLoading ? null : detailRiskData}
          llamaPool={detailLoading ? null : detailLlamaPool}
          onClose={() => setDetailVault(null)}
          onDeposit={(vault) => setDepositModal(vault)}
          onCompare={handleCompare}
        />
      )}
    </AppShell>
  )
}

function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-12 gap-8 animate-pulse">
      <div className="col-span-7 space-y-4">
        {[1, 2, 3].map(i => <div key={i} className="h-40 bg-surface-container rounded-xl" />)}
      </div>
      <div className="col-span-5 space-y-4">
        <div className="h-96 bg-surface-container rounded-xl" />
      </div>
    </div>
  )
}

function NoPositionsState({ onGoToVaults }) {
  return (
    <div className="bg-surface-container-lowest p-8 rounded-xl clinical-shadow text-center space-y-4">
      <div className="w-16 h-16 bg-surface-container rounded-full flex items-center justify-center mx-auto">
        <span className="material-symbols-outlined text-3xl text-on-surface-variant">account_balance</span>
      </div>
      <h3 className="font-headline font-bold text-xl text-on-surface">No Active Vaults</h3>
      <p className="text-on-surface-variant text-sm">
        You don't have any positions yet. Browse the vault recommendations on the right to get started.
      </p>
      <button onClick={onGoToVaults}
        className="px-6 py-3 bg-primary-container text-white rounded-full font-bold text-sm hover:opacity-90 transition-all">
        Explore Vaults
      </button>
    </div>
  )
}

// ─── Position Card — no deposit button ───────────────────────────────────────
function PositionCard({ position }) {
  const chainName = getChainName(position.chainId)
  const protocolName = position.protocolName ?? 'Unknown'
  const vaultName = position.vaultName ?? `${position.asset?.symbol ?? 'Unknown'} Vault`
  const balanceUsd = Number(position.balanceUsd || 0)

  return (
    <div className="bg-surface-container-lowest p-6 rounded-xl clinical-shadow">
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center">
            <span className="material-symbols-outlined text-on-surface-variant">toll</span>
          </div>
          <div>
            <h3 className="font-headline font-bold text-lg text-on-surface">{vaultName}</h3>
            <p className="text-xs text-on-surface-variant font-medium">{protocolName} · {chainName}</p>
          </div>
        </div>
        <div className="text-right">
          <span className="block text-2xl font-headline font-black text-on-surface">
            ${balanceUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </span>
          <span className="text-[10px] uppercase tracking-tighter font-bold text-on-surface-variant">Balance (USD)</span>
        </div>
      </div>

      {position.underlyingTokens?.length > 0 && (
        <div className="flex items-center gap-2 mt-4 flex-wrap">
          {position.underlyingTokens.map((t, i) => (
            <span key={i} className="flex items-center gap-1 px-2.5 py-1 bg-surface-container rounded-full text-xs font-bold text-on-surface-variant">
              {t.logoURI && <img src={t.logoURI} alt={t.symbol} className="w-3.5 h-3.5 rounded-full" onError={e => { e.target.style.display = 'none' }} />}
              {t.symbol}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}