// src/pages/VaultPage.jsx
// APY from API is already a percentage (e.g. 3.8 = 3.8%) — NO * 100 anywhere
import { useState, useEffect, useCallback } from 'react'
import AppShell from '../components/AppShell'
import DepositModal from '../components/DepositModal'
import { getVaultsForChain, getSupportedChains } from '../services/earnApi'
import {
  fetchDefiLlamaPools,
  matchVaultToPool,
  computeRiskScore,
  GRADE_CONFIG,
  pickDoctorsChoice,
} from '../services/defiLlama'
import { getCacheExpiresIn, CACHE_KEYS } from '../services/vaultCache'

const PAGE_SIZE = 20

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtApy(val) {
  if (val == null) return 'N/A'
  return `${val.toFixed(2)}%`
}

function fmtTvl(usd) {
  const n = Number(usd ?? 0)
  if (n >= 1_000_000_000) return `$${(n / 1e9).toFixed(1)}B`
  if (n >= 1_000_000)     return `$${(n / 1e6).toFixed(1)}M`
  if (n >= 1_000)         return `$${(n / 1e3).toFixed(0)}K`
  return `$${n.toFixed(0)}`
}

function formatTimeRemaining(ms) {
  if (!ms || ms <= 0) return null
  const mins = Math.floor(ms / 60000)
  const secs = Math.floor((ms % 60000) / 1000)
  if (mins > 0) return `${mins}m`
  return `${secs}s`
}

// ─── Risk Badge ───────────────────────────────────────────────────────────────
function RiskBadge({ riskData, size = 'sm' }) {
  if (!riskData) {
    return (
      <span className={`inline-flex items-center justify-center font-black rounded-lg border
        ${size === 'lg' ? 'w-10 h-10 text-base' : 'w-7 h-7 text-xs'}
        bg-surface-container border-surface-container-high text-on-surface-variant`}
        title="No DeFiLlama match found for this vault"
      >
        —
      </span>
    )
  }
  const { grade, score, breakdown, sigma, mu, isOutlier, ilRisk } = riskData
  const cfg = GRADE_CONFIG[grade]

  const tip = [
    `Risk Grade ${grade} · ${score}/100`,
    `Volatility (σ): ${breakdown.sigmaScore}/40${sigma !== null ? ` (σ=${sigma.toFixed(3)})` : ''}`,
    `APY vs history (μ): ${breakdown.muScore}/20${mu !== null ? ` (μ=${mu.toFixed(1)}%)` : ''}`,
    `Protocol trust: ${breakdown.protocolScore}/20`,
    `TVL depth: ${breakdown.tvlScore}/15`,
    `Flags: ${breakdown.flagScore}/5${isOutlier ? ' ⚠ outlier' : ''}${ilRisk === 'yes' ? ' ⚠ IL risk' : ''}`,
  ].join('\n')

  return (
    <span
      className={`inline-flex items-center justify-center font-black rounded-lg border cursor-default
        ${size === 'lg' ? 'w-10 h-10 text-base' : 'w-7 h-7 text-xs'}`}
      style={{ color: cfg.color, background: cfg.bg, borderColor: cfg.border }}
      title={tip}
    >
      {grade}
    </span>
  )
}

// ─── Prediction Cell ──────────────────────────────────────────────────────────
function PredictionCell({ predictions }) {
  if (!predictions || predictions.predictedClass === null || predictions.predictedClass === undefined) {
    return <span className="text-on-surface-variant text-xs">—</span>
  }

  const { predictedClass, predictedProbability, binnedConfidence } = predictions
  const cls = (predictedClass ?? '').toLowerCase()

  let arrow, color, bg, dirLabel
  if (cls.includes('up')) {
    arrow = '↑'; color = '#009844'; bg = 'rgba(0,152,68,0.10)'; dirLabel = 'Up'
  } else if (cls.includes('down')) {
    arrow = '↓'; color = '#ba1a1a'; bg = 'rgba(186,26,26,0.10)'; dirLabel = 'Down'
  } else {
    arrow = '→'; color = '#76777d'; bg = 'rgba(118,119,125,0.10)'; dirLabel = 'Stable'
  }

  const confLabel = { 1: 'Low conf.', 2: 'Med conf.', 3: 'High conf.' }[binnedConfidence] ?? ''
  const confColor = { 1: '#ea580c', 2: '#d97706', 3: '#009844' }[binnedConfidence] ?? '#76777d'

  const tip = `APY Prediction: ${predictedClass} (${predictedProbability}% probability)\nConfidence: ${({ 1: 'Low', 2: 'Medium', 3: 'High' }[binnedConfidence] ?? 'Unknown')}`

  return (
    <span className="inline-flex flex-col gap-0.5" title={tip}>
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-black w-fit"
        style={{ color, background: bg }}
      >
        {arrow} {predictedProbability}%
        <span className="font-medium opacity-80">{dirLabel}</span>
      </span>
      {binnedConfidence && (
        <span className="text-[10px] font-bold" style={{ color: confColor }}>{confLabel}</span>
      )}
    </span>
  )
}

// ─── Doctor's Choice Card ─────────────────────────────────────────────────────
function DoctorsChoiceCard({ vault, riskData, chainName, onDeposit }) {
  const apy    = vault.analytics?.apy?.total
  const apy30d = vault.analytics?.apy30d
  const tvlRaw = Number(vault.analytics?.tvl?.usd ?? 0)

  const isComposable = vault.isTransactional !== false
  const isRedeemable = vault.isRedeemable !== false

  return (
    <div className="bg-surface-container-lowest rounded-2xl clinical-shadow overflow-hidden border border-surface-container mb-8">
      <div className="p-8 space-y-5">
        {/* Header row */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="material-symbols-outlined text-on-tertiary-container text-lg">verified</span>
          <span className="text-xs font-black uppercase tracking-widest text-on-tertiary-container">
            Doctor's Choice — {chainName}
          </span>
          {riskData && (
            <span
              className="flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full"
              style={{ color: GRADE_CONFIG[riskData.grade].color, background: GRADE_CONFIG[riskData.grade].bg, border: `1px solid ${GRADE_CONFIG[riskData.grade].border}` }}
            >
              Grade {riskData.grade} · {riskData.score}/100
            </span>
          )}
          {isComposable && (
            <span className="flex items-center gap-1 text-[10px] font-black bg-on-tertiary-container/10 text-on-tertiary-container px-2 py-0.5 rounded-full">
              <span className="material-symbols-outlined text-[11px]">bolt</span>Cross-chain deposit
            </span>
          )}
          {!isComposable && (
            <span className="flex items-center gap-1 text-[10px] font-black bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
              🔒 Same-chain only
            </span>
          )}
          {!isRedeemable && (
            <span
              className="flex items-center gap-1 text-[10px] font-black bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full"
              title="Withdrawal not supported via LiFi Composer. Use protocol UI."
            >
              ⚠ Not via Composer
            </span>
          )}
        </div>

        <div>
          <h2 className="text-3xl font-headline font-extrabold text-on-surface tracking-tight">{vault.name}</h2>
          <p className="text-on-surface-variant text-sm mt-1 font-medium">
            {vault.protocol?.name} · {vault.network ?? `Chain ${vault.chainId}`}
          </p>
        </div>

        <div className="grid grid-cols-4 gap-6">
          <div>
            <p className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant mb-1">Current APY</p>
            <p className="text-4xl font-headline font-black text-on-surface">{fmtApy(apy)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant mb-1">30-Day Avg</p>
            <p className="text-4xl font-headline font-black text-on-surface-variant">
              {apy30d != null ? fmtApy(apy30d) : 'N/A'}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant mb-1">Total TVL</p>
            <p className="text-4xl font-headline font-black text-on-surface">{fmtTvl(tvlRaw)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant mb-1">Risk Grade</p>
            {riskData
              ? <RiskBadge riskData={riskData} size="lg" />
              : <span className="text-2xl font-headline font-black text-on-surface-variant">—</span>}
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {vault.underlyingTokens?.length > 0 && vault.underlyingTokens.map((t, i) => (
            <span key={i} className="px-3 py-1 bg-secondary-container text-on-secondary-container rounded-full text-xs font-bold">{t.symbol}</span>
          ))}
          {vault.tags?.includes('stablecoin') && (
            <span className="px-2 py-0.5 bg-surface-container text-on-surface-variant rounded-full text-[10px] font-bold">Stablecoin</span>
          )}
        </div>

        <button
          onClick={() => onDeposit(vault)}
          className="px-6 py-3 bg-primary-container text-white rounded-xl font-black text-sm hover:opacity-90 transition-colors"
        >
          Deposit Now
        </button>
      </div>
    </div>
  )
}

// ─── Filter Bar ───────────────────────────────────────────────────────────────
function FilterBar({ vaults, filters, onFiltersChange }) {
  const protocols = [...new Set(vaults.map(v => v.protocol?.name).filter(Boolean))].sort()

  return (
    <div className="flex flex-wrap items-center gap-3 mb-6 p-4 bg-surface-container-lowest rounded-2xl border border-surface-container clinical-shadow">

      {/* Protocol */}
      <div className="flex items-center gap-2">
        <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant shrink-0">Protocol</label>
        <select
          value={filters.protocol}
          onChange={e => onFiltersChange({ ...filters, protocol: e.target.value })}
          className="px-3 py-1.5 rounded-xl border border-surface-container-high bg-surface-container-low text-xs font-bold text-on-surface focus:outline-none focus:ring-2 focus:ring-primary-container/30 min-w-[130px]"
        >
          <option value="">All Protocols</option>
          {protocols.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      {/* APY — user-typed min/max */}
      <div className="flex items-center gap-2">
        <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant shrink-0">APY</label>
        <div className="flex items-center gap-1">
          <input
            type="number"
            min="0"
            placeholder="Min %"
            value={filters.apyMin}
            onChange={e => onFiltersChange({ ...filters, apyMin: e.target.value })}
            className="w-20 px-2 py-1.5 rounded-xl border border-surface-container-high bg-surface-container-low text-xs font-bold text-on-surface focus:outline-none focus:ring-2 focus:ring-primary-container/30"
          />
          <span className="text-on-surface-variant text-xs font-bold">–</span>
          <input
            type="number"
            min="0"
            placeholder="Max %"
            value={filters.apyMax}
            onChange={e => onFiltersChange({ ...filters, apyMax: e.target.value })}
            className="w-20 px-2 py-1.5 rounded-xl border border-surface-container-high bg-surface-container-low text-xs font-bold text-on-surface focus:outline-none focus:ring-2 focus:ring-primary-container/30"
          />
        </div>
      </div>

      {/* APY sort */}
      <div className="flex items-center gap-2">
        <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant shrink-0">Sort</label>
        <div className="flex rounded-xl overflow-hidden border border-surface-container-high">
          {[
            { value: 'desc', label: '↓ APY' },
            { value: 'asc',  label: '↑ APY' },
          ].map(opt => (
            <button
              key={opt.value}
              onClick={() => onFiltersChange({ ...filters, apySort: opt.value })}
              className={`px-3 py-1.5 text-xs font-bold transition-colors ${
                filters.apySort === opt.value
                  ? 'bg-primary-container text-white'
                  : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Min TVL */}
      <div className="flex items-center gap-2">
        <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant shrink-0">Min TVL</label>
        <select
          value={filters.minTvl}
          onChange={e => onFiltersChange({ ...filters, minTvl: Number(e.target.value) })}
          className="px-3 py-1.5 rounded-xl border border-surface-container-high bg-surface-container-low text-xs font-bold text-on-surface focus:outline-none focus:ring-2 focus:ring-primary-container/30"
        >
          <option value={0}>Any TVL</option>
          <option value={100_000}>$100K+</option>
          <option value={1_000_000}>$1M+</option>
          <option value={10_000_000}>$10M+</option>
          <option value={50_000_000}>$50M+</option>
          <option value={100_000_000}>$100M+</option>
          <option value={300_000_000}>$300M+</option>
          <option value={500_000_000}>$500M+</option>
          <option value={700_000_000}>$700M+</option>
          <option value={900_000_000}>$900M+</option>
        </select>
      </div>

      {/* Risk grade */}
      <div className="flex items-center gap-2">
        <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant shrink-0">Risk</label>
        <div className="flex gap-1">
          {['', 'A', 'B', 'C', 'D'].map(g => (
            <button
              key={g}
              onClick={() => onFiltersChange({ ...filters, grade: g })}
              className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all border ${
                filters.grade === g && g === ''
                  ? 'bg-primary-container text-white border-primary-container'
                  : filters.grade === g
                    ? 'border-transparent'
                    : 'border-surface-container-high text-on-surface-variant hover:border-primary-container/40'
              }`}
              style={filters.grade === g && g !== '' ? {
                color: GRADE_CONFIG[g].color,
                background: GRADE_CONFIG[g].bg,
                borderColor: GRADE_CONFIG[g].border,
              } : {}}
            >
              {g || 'All'}
            </button>
          ))}
        </div>
      </div>

      {/* Clear */}
      {(filters.protocol || filters.minTvl > 0 || filters.grade || filters.apyMin || filters.apyMax) && (
        <button
          onClick={() => onFiltersChange({ protocol: '', apySort: 'desc', minTvl: 0, grade: '', apyMin: '', apyMax: '' })}
          className="ml-auto flex items-center gap-1 text-xs text-on-surface-variant hover:text-on-surface transition-colors font-bold"
        >
          <span className="material-symbols-outlined text-[14px]">close</span>
          Clear
        </button>
      )}
    </div>
  )
}

// ─── Risk Legend ──────────────────────────────────────────────────────────────
function RiskLegend() {
  const items = [
    ...Object.entries(GRADE_CONFIG).map(([g, cfg]) => ({ label: g, desc: cfg.desc, color: cfg.color, bg: cfg.bg, border: cfg.border })),
    { label: '—', desc: 'No match', color: '#76777d', bg: 'rgba(118,119,125,0.08)', border: 'rgba(118,119,125,0.25)' },
  ]
  return (
    <div className="flex flex-wrap gap-2 mb-5">
      {items.map(item => (
        <span
          key={item.label}
          className="flex items-center gap-1.5 px-3 py-1 rounded-xl border text-[11px] font-bold"
          style={{ color: item.color, background: item.bg, borderColor: item.border }}
        >
          <span className="font-black">{item.label}</span>
          <span className="text-on-surface-variant" style={{ color: 'inherit', opacity: 0.75 }}>{item.desc}</span>
        </span>
      ))}
    </div>
  )
}

// ─── Vault Table ──────────────────────────────────────────────────────────────
function VaultTable({ vaults, riskMap, llamaPoolMap, doctorsChoiceAddress, onDeposit, pageIndex, totalPages, totalVaults, onPageChange }) {

  return (
    <div className="bg-surface-container-lowest rounded-2xl clinical-shadow">
      {/* Header */}
      <div className="px-6 py-4 border-b border-surface-container flex justify-between items-center bg-surface-container-low rounded-t-2xl">
        <div>
          <h3 className="font-headline font-bold text-xl text-on-surface">All Vaults</h3>
          <p className="text-xs text-on-surface-variant mt-0.5">{totalVaults} vaults</p>
        </div>
        <span className="text-[10px] bg-surface-container px-3 py-1 rounded-full font-bold text-on-surface-variant uppercase tracking-wider">
          Page {pageIndex + 1} of {totalPages}
        </span>
      </div>

      {/* Column headers */}
      <div className="px-6 py-3 grid gap-3 border-b border-surface-container bg-surface-container-low/60 text-[10px] uppercase tracking-widest font-black text-on-surface-variant"
        style={{ gridTemplateColumns: '32px 1fr 90px 90px 100px 110px 80px 90px' }}>
        <div className="text-center">#</div>
        <div>Vault / Protocol</div>
        <div className="text-right">Current APY</div>
        <div className="text-right">30d Avg</div>
        <div className="text-right">TVL</div>
        <div className="text-center" title="APY Prediction Probability — model estimate of APY direction">APP (i)</div>
        <div className="text-center">Risk</div>
        <div className="text-right">Action</div>
      </div>

      {/* Rows */}
      <div className="divide-y divide-surface-container">
        {vaults.map((vault, i) => {
          const key = vault.slug ?? vault.address
          const riskData = riskMap?.get(key) ?? null
          const llamaPool = llamaPoolMap?.get(key) ?? null
          const predictions = llamaPool?.predictions ?? null
          const isBest = vault.address === doctorsChoiceAddress

          const apy    = vault.analytics?.apy?.total
          const apy30d = vault.analytics?.apy30d
          const tvlRaw = Number(vault.analytics?.tvl?.usd ?? 0)

          const isComposable = vault.isTransactional !== false
          const isRedeemable = vault.isRedeemable !== false
          const isStablecoin = vault.tags?.includes('stablecoin')
          const isHighLiq    = tvlRaw >= 50_000_000

          return (
            <div
              key={key + i}
              className={`px-6 py-4 grid gap-3 items-center hover:bg-surface-container-low transition-colors
                ${isBest ? 'bg-tertiary-container/5' : ''}`}
              style={{ gridTemplateColumns: '32px 1fr 90px 90px 100px 110px 80px 90px' }}
            >
              {/* Rank */}
              <div className="text-center">
                <span className="text-sm font-black text-on-surface-variant">{pageIndex * PAGE_SIZE + i + 1}</span>
              </div>

              {/* Vault name + badges */}
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-surface-container flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-on-surface-variant text-[16px]">account_balance</span>
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="font-bold text-sm text-on-surface truncate">{vault.name}</p>
                    {isBest && (
                      <span className="px-1.5 py-0.5 bg-on-tertiary-container text-white rounded text-[9px] font-black shrink-0">Doctor's Pick</span>
                    )}
                  </div>
                  <p className="text-xs text-on-surface-variant truncate">{vault.protocol?.name} · {vault.network ?? `Chain ${vault.chainId}`}</p>
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {vault.underlyingTokens?.slice(0, 2).map((t, ti) => (
                      <span key={ti} className="px-1.5 py-0.5 bg-surface-container text-on-surface-variant rounded text-[9px] font-bold">{t.symbol}</span>
                    ))}
                    {isStablecoin && (
                      <span className="px-1.5 py-0.5 bg-surface-container text-on-surface-variant rounded text-[9px] font-bold">Stablecoin</span>
                    )}
                    {isHighLiq && !isBest && (
                      <span className="px-1.5 py-0.5 bg-secondary-container text-on-secondary-container rounded text-[9px] font-bold">High Liquidity</span>
                    )}
                    {isComposable && !isBest && (
                      <span className="px-1.5 py-0.5 bg-on-tertiary-container/10 text-on-tertiary-container rounded text-[9px] font-black">⚡ Cross-chain</span>
                    )}
                    {!isComposable && (
                      <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[9px] font-black">🔒 Same-chain</span>
                    )}
                    {!isRedeemable && (
                      <span
                        className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[9px] font-black"
                        title="Withdrawal not supported via LiFi Composer. Use protocol UI."
                      >
                        ⚠ Not via Composer
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Current APY */}
              <div className="text-right">
                <p className={`font-headline font-black text-base ${isBest ? 'text-on-tertiary-container' : 'text-on-surface'}`}>
                  {fmtApy(apy)}
                </p>
              </div>

              {/* 30d avg */}
              <div className="text-right">
                <p className="text-sm font-medium text-on-surface-variant">{apy30d != null ? fmtApy(apy30d) : '—'}</p>
              </div>

              {/* TVL */}
              <div className="text-right">
                <p className="font-bold text-sm text-on-surface">{fmtTvl(tvlRaw)}</p>
              </div>

              {/* Prediction */}
              <div className="flex justify-center">
                <PredictionCell predictions={predictions} />
              </div>

              {/* Risk */}
              <div className="flex justify-center">
                <RiskBadge riskData={riskData} />
              </div>

              {/* Action */}
              <div className="flex justify-end">
                <button
                  onClick={() => onDeposit(vault)}
                  className={`px-4 py-2 rounded-full text-xs font-bold transition-all ${
                    isBest
                      ? 'bg-primary-container text-white hover:opacity-90'
                      : 'border-2 border-primary-container text-primary-container hover:bg-primary-container hover:text-white'
                  }`}
                >
                  Deposit
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="p-5 border-t border-surface-container flex items-center justify-between">
          <button
            onClick={() => onPageChange(Math.max(0, pageIndex - 1))}
            disabled={pageIndex === 0}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold border-2 border-surface-container text-on-surface-variant hover:border-primary-container hover:text-on-surface disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            <span className="material-symbols-outlined text-[18px]">chevron_left</span>Previous
          </button>
          <div className="flex items-center gap-1">
            {Array.from({ length: totalPages }, (_, i) => i).map(p => {
              const show = p === 0 || p === totalPages - 1 || Math.abs(p - pageIndex) <= 2
              const isEllipsis = !show && (p === 1 || p === totalPages - 2)
              if (!show && !isEllipsis) return null
              if (isEllipsis) return <span key={p} className="px-1 text-on-surface-variant text-sm">…</span>
              return (
                <button key={p} onClick={() => onPageChange(p)}
                  className={`w-9 h-9 rounded-full text-sm font-bold transition-all ${p === pageIndex ? 'bg-primary-container text-white' : 'text-on-surface-variant hover:bg-surface-container'}`}>
                  {p + 1}
                </button>
              )
            })}
          </div>
          <button
            onClick={() => onPageChange(Math.min(totalPages - 1, pageIndex + 1))}
            disabled={pageIndex >= totalPages - 1}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold border-2 border-surface-container text-on-surface-variant hover:border-primary-container hover:text-on-surface disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            Next<span className="material-symbols-outlined text-[18px]">chevron_right</span>
          </button>
        </div>
      )}

      <div className="px-6 py-3 border-t border-surface-container bg-surface-container-low rounded-b-2xl">
        <p className="text-[10px] text-on-surface-variant text-center">
          Showing {pageIndex * PAGE_SIZE + 1}–{Math.min((pageIndex + 1) * PAGE_SIZE, totalVaults)} of {totalVaults} vaults
          · Risk data powered by DeFiLlama · APP = APY Prediction Probability
        </p>
      </div>
    </div>
  )
}

// ─── Loading Skeleton ─────────────────────────────────────────────────────────
function LoadingSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-56 bg-surface-container rounded-2xl" />
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-16 bg-surface-container rounded-xl" />
        ))}
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function VaultPage() {
  const [chains, setChains]               = useState([])
  const [selectedChain, setSelectedChain] = useState(null)
  const [allVaults, setAllVaults]         = useState([])
  const [llamaPools, setLlamaPools]       = useState([])
  const [riskMap, setRiskMap]             = useState(new Map())
  const [llamaPoolMap, setLlamaPoolMap]   = useState(new Map())
  const [doctorsChoice, setDoctorsChoice] = useState(null)
  const [pageIndex, setPageIndex]         = useState(0)
  const [loading, setLoading]             = useState(false)
  const [llamaLoading, setLlamaLoading]   = useState(false)
  const [chainsLoading, setChainsLoading] = useState(true)
  const [error, setError]                 = useState(null)
  const [cacheExpiresIn, setCacheExpiresIn] = useState(null)
  const [depositModal, setDepositModal]   = useState(null)

  const [filters, setFilters] = useState({
    protocol: '',
    apySort:  'desc',
    minTvl:   0,
    grade:    '',
    apyMin:   '',
    apyMax:   '',
  })

  // Load chains
  useEffect(() => {
    setChainsLoading(true)
    getSupportedChains()
      .then(data => {
        setChains(data)
        if (data.length > 0) setSelectedChain(data[0])
      })
      .catch(err => setError('Failed to load chains: ' + err.message))
      .finally(() => setChainsLoading(false))
  }, [])

  // Load DeFiLlama pools once
  useEffect(() => {
    setLlamaLoading(true)
    fetchDefiLlamaPools()
      .then(pools => setLlamaPools(pools))
      .finally(() => setLlamaLoading(false))
  }, [])

  // Load vaults when chain changes
  const loadVaultsForChain = useCallback(async (chain) => {
    if (!chain) return
    setLoading(true)
    setError(null)
    setAllVaults([])
    setPageIndex(0)
    setRiskMap(new Map())
    setLlamaPoolMap(new Map())
    setDoctorsChoice(null)
    try {
      const vaults = await getVaultsForChain({ chainId: chain.chainId })
      setAllVaults(vaults)
      const remaining = getCacheExpiresIn(CACHE_KEYS.chainVaults(chain.chainId))
      setCacheExpiresIn(remaining)
    } catch (err) {
      setError('Failed to load vaults: ' + err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadVaultsForChain(selectedChain)
  }, [selectedChain, loadVaultsForChain])

  // Compute risk scores when both datasets are ready
  useEffect(() => {
    if (!allVaults.length || !llamaPools.length) return

    const newRiskMap = new Map()
    const newLlamaPoolMap = new Map()

    for (const vault of allVaults) {
      const key = vault.slug ?? vault.address
      const pool = matchVaultToPool(vault, llamaPools)
      if (pool) {
        newLlamaPoolMap.set(key, pool)
        newRiskMap.set(key, computeRiskScore(vault, pool))
      } else {
        newRiskMap.set(key, null)
      }
    }

    setRiskMap(newRiskMap)
    setLlamaPoolMap(newLlamaPoolMap)

    // Pick doctor's choice based on risk grades
    const dc = pickDoctorsChoice(allVaults, newRiskMap)
    setDoctorsChoice(dc)
  }, [allVaults, llamaPools])

  // Cache expiry ticker
  useEffect(() => {
    if (!selectedChain) return
    const interval = setInterval(() => {
      const remaining = getCacheExpiresIn(CACHE_KEYS.chainVaults(selectedChain.chainId))
      setCacheExpiresIn(remaining)
    }, 10000)
    return () => clearInterval(interval)
  }, [selectedChain])

  // Apply filters + sort
  const filteredVaults = allVaults.filter(vault => {
    if (filters.protocol && vault.protocol?.name !== filters.protocol) return false
    const tvl = Number(vault.analytics?.tvl?.usd ?? 0)
    if (tvl < filters.minTvl) return false
    const apy = vault.analytics?.apy?.total ?? 0
    if (filters.apyMin !== '' && apy < Number(filters.apyMin)) return false
    if (filters.apyMax !== '' && apy > Number(filters.apyMax)) return false
    if (filters.grade) {
      const key = vault.slug ?? vault.address
      const risk = riskMap.get(key)
      if (!risk || risk.grade !== filters.grade) return false
    }
    return true
  }).sort((a, b) => {
    const apyA = a.analytics?.apy?.total ?? 0
    const apyB = b.analytics?.apy?.total ?? 0
    return filters.apySort === 'asc' ? apyA - apyB : apyB - apyA
  })

  const totalPages  = Math.ceil(filteredVaults.length / PAGE_SIZE)
  const pagedVaults = filteredVaults.slice(pageIndex * PAGE_SIZE, (pageIndex + 1) * PAGE_SIZE)

  // Reset page on filter change
  useEffect(() => { setPageIndex(0) }, [filters])

  const dcKey = doctorsChoice ? (doctorsChoice.slug ?? doctorsChoice.address) : null
  const dcRiskData = dcKey ? (riskMap.get(dcKey) ?? null) : null

  return (
    <AppShell>
      <header className="mb-6 flex justify-between items-end flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-headline font-extrabold tracking-tight text-on-surface">Vault Explorer</h1>
          <p className="text-on-surface-variant font-medium mt-1">
            Select a chain to browse all vaults. Risk grades powered by DeFiLlama.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {llamaLoading && (
            <span className="flex items-center gap-1.5 text-[10px] text-on-surface-variant font-medium bg-surface-container px-3 py-1.5 rounded-full">
              <span className="material-symbols-outlined text-[12px] animate-spin">progress_activity</span>
              Loading risk data...
            </span>
          )}
          {cacheExpiresIn != null && (
            <span className="text-[10px] text-on-surface-variant font-medium bg-surface-container px-3 py-1.5 rounded-full">
              Refreshes in {formatTimeRemaining(cacheExpiresIn)}
            </span>
          )}
        </div>
      </header>

      {/* Chain tabs */}
      {chainsLoading ? (
        <div className="flex gap-2 mb-6 animate-pulse">
          {[1,2,3,4,5].map(i => <div key={i} className="h-8 w-24 bg-surface-container rounded-full" />)}
        </div>
      ) : (
        <div className="mb-6 flex gap-2 flex-wrap">
          {chains.map(chain => (
            <button
              key={chain.chainId}
              onClick={() => { if (chain.chainId !== selectedChain?.chainId) setSelectedChain(chain) }}
              className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all border capitalize ${
                selectedChain?.chainId === chain.chainId
                  ? 'bg-primary-container text-white border-primary-container shadow-md'
                  : 'border-surface-container-high text-on-surface-variant hover:border-primary-container hover:text-on-surface bg-surface-container-lowest'
              }`}
            >
              {chain.name}
            </button>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-6 p-4 bg-error-container/30 border border-error-container rounded-xl text-on-error-container text-sm font-medium">
          <strong>Error:</strong> {error}
          <button onClick={() => loadVaultsForChain(selectedChain)} className="ml-4 underline hover:no-underline">Retry</button>
        </div>
      )}

      {loading && <LoadingSkeleton />}

      {!loading && selectedChain && allVaults.length === 0 && !error && (
        <div className="p-12 text-center text-on-surface-variant">
          <span className="material-symbols-outlined text-4xl block mb-3">search_off</span>
          No vaults found on {selectedChain.name}.
        </div>
      )}

      {!loading && allVaults.length > 0 && (
        <>
          {/* Doctor's Choice */}
          {doctorsChoice && (
            <DoctorsChoiceCard
              vault={doctorsChoice}
              riskData={dcRiskData}
              chainName={selectedChain?.name}
              onDeposit={setDepositModal}
            />
          )}

          {/* Risk legend */}
          <RiskLegend />

          {/* Filters */}
          <FilterBar vaults={allVaults} filters={filters} onFiltersChange={f => { setFilters(f) }} />

          {/* Empty filter state */}
          {filteredVaults.length === 0 ? (
            <div className="p-12 text-center text-on-surface-variant">
              <span className="material-symbols-outlined text-4xl block mb-3">filter_list_off</span>
              No vaults match your filters.
              <button
                onClick={() => setFilters({ protocol: '', apySort: 'desc', minTvl: 0, grade: '', apyMin: '', apyMax: '' })}
                className="block mx-auto mt-3 text-sm font-bold text-primary-container hover:underline"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <VaultTable
              vaults={pagedVaults}
              riskMap={riskMap}
              llamaPoolMap={llamaPoolMap}
              doctorsChoiceAddress={doctorsChoice?.address}
              onDeposit={setDepositModal}
              pageIndex={pageIndex}
              totalPages={totalPages}
              totalVaults={filteredVaults.length}
              onPageChange={setPageIndex}
            />
          )}
        </>
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