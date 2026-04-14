// src/pages/VaultPage.jsx
// APY from API is already a percentage (e.g. 3.8 = 3.8%) — NO * 100 anywhere
import { useState, useEffect, useCallback } from 'react'
import AppShell from '../components/AppShell'
import DepositModal from '../components/DepositModal'
import WithdrawModal from '../components/WithdrawModal'
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
const MIN_TVL_DISPLAY = 1_000_000

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

function Tooltip({ text, children, position = 'top' }) {
  const posMap = {
    top:    'bottom-full left-1/2 -translate-x-1/2 mb-1.5',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-1.5',
    left:   'right-full top-1/2 -translate-y-1/2 mr-1.5',
    right:  'left-full top-1/2 -translate-y-1/2 ml-1.5',
  }
  return (
    <span className="relative inline-block group/tip">
      {children}
      <span className={`pointer-events-none absolute ${posMap[position]} z-[600] opacity-0 group-hover/tip:opacity-100 transition-opacity duration-150`}>
        <span className="block bg-[#131b2e] text-white text-[10px] font-semibold px-2.5 py-1.5 rounded-lg shadow-xl leading-snug max-w-[200px] whitespace-normal text-center">
          {text}
        </span>
      </span>
    </span>
  )
}

function Badge({ children, className = '' }) {
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold leading-tight ${className}`}>
      {children}
    </span>
  )
}

function AppInfoModal({ onClose }) {
  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-headline font-extrabold text-lg text-on-surface">APY Prediction Probability</h3>
          <button onClick={onClose} className="w-7 h-7 rounded-full bg-surface-container hover:bg-surface-container-high flex items-center justify-center transition-colors">
            <span className="material-symbols-outlined text-[14px] text-on-surface-variant">close</span>
          </button>
        </div>
        <div className="space-y-3 text-sm text-on-surface-variant leading-relaxed">
          <p><span className="font-bold text-on-surface">APP (APY Prediction Probability)</span> is a model estimate from DeFiLlama that predicts the likely direction of a vault's APY over the near term.</p>
          <div className="space-y-2">
            <div className="flex items-center gap-2 p-2 bg-surface-container rounded-lg">
              <span className="font-black text-base" style={{ color: '#009844' }}>↑</span>
              <span><span className="font-bold text-on-surface">Up</span> — Model predicts APY is likely to increase</span>
            </div>
            <div className="flex items-center gap-2 p-2 bg-surface-container rounded-lg">
              <span className="font-black text-base" style={{ color: '#ba1a1a' }}>↓</span>
              <span><span className="font-bold text-on-surface">Down</span> — Model predicts APY is likely to decrease</span>
            </div>
            <div className="flex items-center gap-2 p-2 bg-surface-container rounded-lg">
              <span className="font-black text-base" style={{ color: '#76777d' }}>→</span>
              <span><span className="font-bold text-on-surface">Stable</span> — Model predicts APY is likely to remain flat</span>
            </div>
          </div>
          <p>The percentage shown (e.g. <span className="font-bold text-on-surface">72%</span>) is the model's confidence in that direction.</p>
          <p className="text-[11px] text-outline bg-surface-container p-2 rounded-lg">This is a probabilistic model estimate, not a guarantee. Always do your own research.</p>
        </div>
      </div>
    </div>
  )
}

function RiskBadge({ riskData, size = 'sm' }) {
  if (!riskData) {
    return (
      <span className={`inline-flex items-center justify-center font-black rounded-lg border
        ${size === 'lg' ? 'w-10 h-10 text-base' : 'w-7 h-7 text-xs'}
        bg-surface-container border-surface-container-high text-on-surface-variant`}>
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
      title={tip}>
      {grade}
    </span>
  )
}

function PredictionCell({ predictions }) {
  if (!predictions || predictions.predictedClass === null || predictions.predictedClass === undefined) {
    return <span className="text-on-surface-variant text-xs">—</span>
  }
  const { predictedClass, predictedProbability, binnedConfidence } = predictions
  const cls = (predictedClass ?? '').toLowerCase()
  const pct = Math.round(Number(predictedProbability))

  let arrow, color, bg
  if (cls.includes('up'))        { arrow = '↑'; color = '#009844'; bg = 'rgba(0,152,68,0.10)' }
  else if (cls.includes('down')) { arrow = '↓'; color = '#ba1a1a'; bg = 'rgba(186,26,26,0.10)' }
  else                           { arrow = '→'; color = '#76777d'; bg = 'rgba(118,119,125,0.10)' }

  const confLabel = { 1: 'Low conf.', 2: 'Med conf.', 3: 'High conf.' }[binnedConfidence] ?? ''
  const confColor = { 1: '#ea580c', 2: '#d97706', 3: '#009844' }[binnedConfidence] ?? '#76777d'

  return (
    <span className="inline-flex flex-col gap-0.5">
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-black w-fit" style={{ color, background: bg }}>
        {arrow} {pct}%
      </span>
      {binnedConfidence && (
        <span className="text-[10px] font-bold" style={{ color: confColor }}>{confLabel}</span>
      )}
    </span>
  )
}

function DoctorsChoiceCard({ vault, riskData, chainName, onDeposit, onWithdraw }) {
  const apy          = vault.analytics?.apy?.total
  const apy30d       = vault.analytics?.apy30d
  const tvlRaw       = Number(vault.analytics?.tvl?.usd ?? 0)
  const isComposable = vault.isTransactional !== false
  const isRedeemable = vault.isRedeemable !== false

  return (
    <div className="bg-surface-container-lowest rounded-2xl clinical-shadow overflow-hidden border border-surface-container mb-8">
      <div className="p-8 space-y-5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="material-symbols-outlined text-on-tertiary-container text-lg">verified</span>
          <span className="text-xs font-black uppercase tracking-widest text-on-tertiary-container">Doctor's Choice — {chainName}</span>
          {isComposable ? (
            <Tooltip text="Deposits are supported via Composer" position="bottom">
              <Badge className="bg-on-tertiary-container/10 text-on-tertiary-container font-black cursor-default">⚡ Cross-chain deposit</Badge>
            </Tooltip>
          ) : (
            <Tooltip text="Only same-chain deposits are supported for this vault" position="bottom">
              <Badge className="bg-amber-100 text-amber-700 font-black cursor-default">🔒 Same-chain only</Badge>
            </Tooltip>
          )}
          {isRedeemable ? (
            <Tooltip text="Withdrawals are supported via Composer" position="bottom">
              <Badge className="bg-emerald-100 text-emerald-700 font-black cursor-default">✓ Redeemable</Badge>
            </Tooltip>
          ) : (
            <Tooltip text="Withdrawals are not supported via Composer" position="bottom">
              <Badge className="bg-amber-100 text-amber-700 font-black cursor-default">⚠ Not Redeemable</Badge>
            </Tooltip>
          )}
        </div>

        <div>
          <h2 className="text-3xl font-headline font-extrabold text-on-surface tracking-tight">{vault.name}</h2>
          <p className="text-on-surface-variant text-sm mt-1 font-medium">{vault.protocol?.name} · {vault.network ?? `Chain ${vault.chainId}`}</p>
        </div>

        <div className="grid grid-cols-4 gap-6">
          <div>
            <p className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant mb-1">Current APY</p>
            <p className="text-4xl font-headline font-black text-on-surface">{fmtApy(apy)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant mb-1">30-Day Avg</p>
            <p className="text-4xl font-headline font-black text-on-surface-variant">{apy30d != null ? fmtApy(apy30d) : 'N/A'}</p>
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

        <div className="flex gap-3">
          <button onClick={() => onDeposit(vault)}
            className="px-6 py-3 bg-primary-container text-white rounded-xl font-black text-sm hover:opacity-90 transition-colors">
            Deposit Now
          </button>
          {isRedeemable && (
            <button onClick={() => onWithdraw(vault)}
              className="px-6 py-3 border-2 border-surface-container-high text-on-surface-variant rounded-xl font-black text-sm hover:border-error hover:text-error transition-all">
              Withdraw
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function FilterBar({ vaults, filters, onFiltersChange }) {
  const protocols = [...new Set(vaults.map(v => v.protocol?.name).filter(Boolean))].sort()

  return (
    <div className="space-y-3 mb-6">
      <div className="flex items-center gap-3 p-4 bg-surface-container-lowest rounded-2xl border border-surface-container clinical-shadow">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-[18px] text-on-surface-variant">search</span>
          <input type="text" value={filters.search} onChange={e => onFiltersChange({ ...filters, search: e.target.value })}
            placeholder="Search vault name, protocol, or token…"
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-surface-container-high bg-surface-container-low text-sm font-medium text-on-surface focus:outline-none focus:ring-2 focus:ring-primary-container/30 placeholder:text-on-surface-variant/60" />
          {filters.search && (
            <button onClick={() => onFiltersChange({ ...filters, search: '' })}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-surface-container-high hover:bg-surface-container-highest flex items-center justify-center transition-colors">
              <span className="material-symbols-outlined text-[12px] text-on-surface-variant">close</span>
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 p-4 bg-surface-container-lowest rounded-2xl border border-surface-container clinical-shadow">
        <div className="flex items-center gap-2">
          <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant shrink-0">Protocol</label>
          <select value={filters.protocol} onChange={e => onFiltersChange({ ...filters, protocol: e.target.value })}
            className="px-3 py-1.5 rounded-xl border border-surface-container-high bg-surface-container-low text-xs font-bold text-on-surface focus:outline-none focus:ring-2 focus:ring-primary-container/30 min-w-[130px]">
            <option value="">All Protocols</option>
            {protocols.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant shrink-0">APY</label>
          <div className="flex items-center gap-1">
            <input type="number" min="0" placeholder="Min %" value={filters.apyMin}
              onChange={e => onFiltersChange({ ...filters, apyMin: e.target.value })}
              className="w-20 px-2 py-1.5 rounded-xl border border-surface-container-high bg-surface-container-low text-xs font-bold text-on-surface focus:outline-none focus:ring-2 focus:ring-primary-container/30" />
            <span className="text-on-surface-variant text-xs font-bold">–</span>
            <input type="number" min="0" placeholder="Max %" value={filters.apyMax}
              onChange={e => onFiltersChange({ ...filters, apyMax: e.target.value })}
              className="w-20 px-2 py-1.5 rounded-xl border border-surface-container-high bg-surface-container-low text-xs font-bold text-on-surface focus:outline-none focus:ring-2 focus:ring-primary-container/30" />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant shrink-0">Sort</label>
          <div className="flex rounded-xl overflow-hidden border border-surface-container-high">
            {[{ value: 'desc', label: '↓ APY' }, { value: 'asc', label: '↑ APY' }].map(opt => (
              <button key={opt.value} onClick={() => onFiltersChange({ ...filters, apySort: opt.value })}
                className={`px-3 py-1.5 text-xs font-bold transition-colors ${
                  filters.apySort === opt.value ? 'bg-primary-container text-white' : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'
                }`}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant shrink-0">Min TVL</label>
          <select value={filters.minTvl} onChange={e => onFiltersChange({ ...filters, minTvl: Number(e.target.value) })}
            className="px-3 py-1.5 rounded-xl border border-surface-container-high bg-surface-container-low text-xs font-bold text-on-surface focus:outline-none focus:ring-2 focus:ring-primary-container/30">
            <option value={0}>$1M+ (min)</option>
            <option value={5_000_000}>$5M+</option>
            <option value={10_000_000}>$10M+</option>
            <option value={50_000_000}>$50M+</option>
            <option value={100_000_000}>$100M+</option>
            <option value={300_000_000}>$300M+</option>
            <option value={500_000_000}>$500M+</option>
            <option value={700_000_000}>$700M+</option>
            <option value={900_000_000}>$900M+</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant shrink-0">Risk</label>
          <div className="flex gap-1">
            {['', 'A', 'B', 'C', 'D'].map(g => (
              <button key={g} onClick={() => onFiltersChange({ ...filters, grade: g })}
                className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all border ${
                  filters.grade === g && g === ''
                    ? 'bg-primary-container text-white border-primary-container'
                    : filters.grade === g
                      ? 'border-transparent'
                      : 'border-surface-container-high text-on-surface-variant hover:border-primary-container/40'
                }`}
                style={filters.grade === g && g !== '' ? {
                  color: GRADE_CONFIG[g].color, background: GRADE_CONFIG[g].bg, borderColor: GRADE_CONFIG[g].border,
                } : {}}>
                {g || 'All'}
              </button>
            ))}
          </div>
        </div>

        {(filters.protocol || filters.minTvl > 0 || filters.grade || filters.apyMin || filters.apyMax) && (
          <button onClick={() => onFiltersChange({ ...filters, protocol: '', apySort: 'desc', minTvl: 0, grade: '', apyMin: '', apyMax: '' })}
            className="ml-auto flex items-center gap-1 text-xs text-on-surface-variant hover:text-on-surface transition-colors font-bold">
            <span className="material-symbols-outlined text-[14px]">close</span>
            Clear filters
          </button>
        )}
      </div>
    </div>
  )
}

function VaultTable({ vaults, riskMap, llamaPoolMap, doctorsChoiceAddress, onDeposit, onWithdraw, pageIndex, totalPages, totalVaults, onPageChange }) {
  const [showAppInfo, setShowAppInfo] = useState(false)

  return (
    <div className="bg-surface-container-lowest rounded-2xl clinical-shadow">
      {showAppInfo && <AppInfoModal onClose={() => setShowAppInfo(false)} />}

      <div className="px-6 py-4 border-b border-surface-container flex justify-between items-center bg-surface-container-low rounded-t-2xl">
        <div>
          <h3 className="font-headline font-bold text-xl text-on-surface">All Vaults</h3>
          <p className="text-xs text-on-surface-variant mt-0.5">{totalVaults} vaults · All have TVL ≥ $1M</p>
        </div>
        <span className="text-[10px] bg-surface-container px-3 py-1 rounded-full font-bold text-on-surface-variant uppercase tracking-wider">
          Page {pageIndex + 1} of {totalPages}
        </span>
      </div>

      {/* Table header — widened action column to fit both buttons */}
      <div
        className="px-6 py-3 grid gap-3 border-b border-surface-container bg-surface-container-low/60 text-[10px] uppercase tracking-widest font-black text-on-surface-variant"
        style={{ gridTemplateColumns: '32px 1fr 90px 90px 100px 110px 100px 160px' }}
      >
        <div className="text-center">#</div>
        <div>Vault / Protocol</div>
        <div className="text-right">Current APY</div>
        <div className="text-right">30d Avg</div>
        <div className="text-right">TVL</div>
        <div className="flex items-center justify-center gap-1">
          <span>APP</span>
          <button onClick={() => setShowAppInfo(true)}
            className="w-4 h-4 rounded-full bg-surface-container-high border border-surface-container-highest text-on-surface-variant hover:bg-primary-container hover:text-white hover:border-primary-container transition-all flex items-center justify-center shrink-0">
            <span className="text-[9px] font-black leading-none">i</span>
          </button>
        </div>
        <div className="text-center">Risk Grade</div>
        <div className="text-center">Actions</div>
      </div>

      <div className="divide-y divide-surface-container">
        {vaults.map((vault, i) => {
          const key          = vault.slug ?? vault.address
          const riskData     = riskMap?.get(key) ?? null
          const llamaPool    = llamaPoolMap?.get(key) ?? null
          const predictions  = llamaPool?.predictions ?? null
          const isBest       = vault.address === doctorsChoiceAddress

          const apy          = vault.analytics?.apy?.total
          const apy30d       = vault.analytics?.apy30d
          const tvlRaw       = Number(vault.analytics?.tvl?.usd ?? 0)
          const isComposable = vault.isTransactional !== false
          const isRedeemable = vault.isRedeemable !== false
          const isStablecoin = vault.tags?.includes('stablecoin')
          const isHighLiq    = tvlRaw >= 50_000_000

          return (
            <div key={key + i}
              className={`px-6 py-4 grid gap-3 items-center hover:bg-surface-container-low transition-colors ${isBest ? 'bg-tertiary-container/5' : ''}`}
              style={{ gridTemplateColumns: '32px 1fr 90px 90px 100px 110px 100px 160px' }}>
              <div className="text-center">
                <span className="text-sm font-black text-on-surface-variant">{pageIndex * PAGE_SIZE + i + 1}</span>
              </div>

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
                  <div className="flex gap-1 mt-1 flex-wrap items-center">
                    {vault.underlyingTokens?.slice(0, 2).map((t, ti) => (
                      <Badge key={ti} className="bg-surface-container text-on-surface-variant">{t.symbol}</Badge>
                    ))}
                    {isStablecoin && (
                      <Tooltip text="This vault holds stablecoin assets (low price volatility)" position="top">
                        <Badge className="bg-surface-container text-on-surface-variant cursor-default">Stablecoin</Badge>
                      </Tooltip>
                    )}
                    {isHighLiq && !isBest && (
                      <Tooltip text="TVL exceeds $50M — high liquidity means easier entry and exit" position="top">
                        <Badge className="bg-secondary-container text-on-secondary-container cursor-default">High Liquidity</Badge>
                      </Tooltip>
                    )}
                    {isComposable && !isBest && (
                      <Tooltip text="Deposits are supported via Composer" position="top">
                        <Badge className="bg-on-tertiary-container/10 text-on-tertiary-container font-black cursor-default">⚡ Cross-chain</Badge>
                      </Tooltip>
                    )}
                    {!isComposable && (
                      <Tooltip text="Only same-chain deposits are supported for this vault" position="top">
                        <Badge className="bg-amber-100 text-amber-700 font-black cursor-default">🔒 Same-chain</Badge>
                      </Tooltip>
                    )}
                    {isRedeemable ? (
                      <Tooltip text="Withdrawals are supported via Composer" position="top">
                        <Badge className="bg-emerald-100 text-emerald-700 font-black cursor-default">✓ Redeemable</Badge>
                      </Tooltip>
                    ) : (
                      <Tooltip text="Withdrawals are not supported via Composer" position="top">
                        <Badge className="bg-amber-100 text-amber-700 font-black cursor-default">⚠ Not Redeemable</Badge>
                      </Tooltip>
                    )}
                  </div>
                </div>
              </div>

              <div className="text-right">
                <p className={`font-headline font-black text-base ${isBest ? 'text-on-tertiary-container' : 'text-on-surface'}`}>{fmtApy(apy)}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium text-on-surface-variant">{apy30d != null ? fmtApy(apy30d) : '—'}</p>
              </div>
              <div className="text-right">
                <p className="font-bold text-sm text-on-surface">{fmtTvl(tvlRaw)}</p>
              </div>
              <div className="flex justify-center">
                <PredictionCell predictions={predictions} />
              </div>
              <div className="flex justify-center">
                <RiskBadge riskData={riskData} />
              </div>

              {/* Actions column: Deposit + Withdraw */}
              <div className="flex items-center justify-center gap-1.5">
                <button onClick={() => onDeposit(vault)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                    isBest
                      ? 'bg-primary-container text-white hover:opacity-90'
                      : 'border-2 border-primary-container text-primary-container hover:bg-primary-container hover:text-white'
                  }`}>
                  Deposit
                </button>
                {isRedeemable && (
                  <button onClick={() => onWithdraw(vault)}
                    className="px-3 py-1.5 rounded-full text-xs font-bold border-2 border-surface-container-high text-on-surface-variant hover:border-error hover:text-error transition-all">
                    Withdraw
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {totalPages > 1 && (
        <div className="p-5 border-t border-surface-container flex items-center justify-between">
          <button onClick={() => onPageChange(Math.max(0, pageIndex - 1))} disabled={pageIndex === 0}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold border-2 border-surface-container text-on-surface-variant hover:border-primary-container hover:text-on-surface disabled:opacity-30 disabled:cursor-not-allowed transition-all">
            <span className="material-symbols-outlined text-[18px]">chevron_left</span>Previous
          </button>
          <div className="flex items-center gap-1">
            {Array.from({ length: totalPages }, (_, idx) => idx).map(p => {
              const show = p === 0 || p === totalPages - 1 || Math.abs(p - pageIndex) <= 2
              const isEllipsis = !show && (p === 1 || p === totalPages - 2)
              if (!show && !isEllipsis) return null
              if (isEllipsis) return <span key={p} className="px-1 text-on-surface-variant text-sm">…</span>
              return (
                <button key={p} onClick={() => onPageChange(p)}
                  className={`w-9 h-9 rounded-full text-sm font-bold transition-all ${
                    p === pageIndex ? 'bg-primary-container text-white' : 'text-on-surface-variant hover:bg-surface-container'
                  }`}>
                  {p + 1}
                </button>
              )
            })}
          </div>
          <button onClick={() => onPageChange(Math.min(totalPages - 1, pageIndex + 1))} disabled={pageIndex >= totalPages - 1}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold border-2 border-surface-container text-on-surface-variant hover:border-primary-container hover:text-on-surface disabled:opacity-30 disabled:cursor-not-allowed transition-all">
            Next<span className="material-symbols-outlined text-[18px]">chevron_right</span>
          </button>
        </div>
      )}

      <div className="px-6 py-3 border-t border-surface-container bg-surface-container-low rounded-b-2xl">
        <p className="text-[10px] text-on-surface-variant text-center">
          Showing {pageIndex * PAGE_SIZE + 1}–{Math.min((pageIndex + 1) * PAGE_SIZE, totalVaults)} of {totalVaults} vaults
          · All vaults have TVL ≥ $1M · Risk data powered by DeFiLlama · APP = APY Prediction Probability
        </p>
      </div>
    </div>
  )
}

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

function FilterEmptyState({ onClearFilters }) {
  return (
    <div className="p-12 text-center space-y-4">
      <div className="w-16 h-16 bg-surface-container rounded-full flex items-center justify-center mx-auto">
        <span className="material-symbols-outlined text-3xl text-on-surface-variant">filter_list_off</span>
      </div>
      <h3 className="font-headline font-bold text-lg text-on-surface">No vaults match your filters</h3>
      <p className="text-sm text-on-surface-variant max-w-sm mx-auto">
        Try adjusting the protocol, APY range, TVL, or risk grade filters to broaden your search.
      </p>
      <button onClick={onClearFilters}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold bg-primary-container text-white hover:opacity-90 transition-all">
        <span className="material-symbols-outlined text-[16px]">refresh</span>
        Clear all filters
      </button>
    </div>
  )
}

function ChainSafuEmptyState({ chainName }) {
  return (
    <div className="bg-surface-container-lowest rounded-2xl clinical-shadow border border-surface-container overflow-hidden">
      <div className="h-1.5 w-full bg-gradient-to-r from-on-tertiary-container via-primary-container to-on-tertiary-container opacity-60" />
      <div className="p-12 text-center space-y-5">
        <div className="relative w-20 h-20 mx-auto">
          <div className="w-20 h-20 bg-on-tertiary-container/10 rounded-full flex items-center justify-center">
            <span className="material-symbols-outlined text-on-tertiary-container text-4xl">health_and_safety</span>
          </div>
          <span className="absolute -top-1 -right-1 w-7 h-7 bg-amber-100 border-2 border-white rounded-full flex items-center justify-center">
            <span className="material-symbols-outlined text-amber-600 text-[14px]">warning</span>
          </span>
        </div>
        <div className="space-y-2">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-on-tertiary-container">Clinical Assessment · {chainName}</p>
          <h3 className="font-headline font-extrabold text-2xl text-on-surface leading-tight">
            No vaults on {chainName} meet<br />our safety specifications.
          </h3>
        </div>
        <div className="max-w-md mx-auto space-y-3">
          <p className="text-sm text-on-surface-variant leading-relaxed">
            The Doctor has reviewed every available vault on this chain against our minimum requirements —
            <span className="font-bold text-on-surface"> $1M TVL</span> and a <span className="font-bold text-on-surface">meaningful APY</span> — and none have passed the screening.
          </p>
          <div className="flex items-center justify-center gap-2 py-3 px-5 bg-on-tertiary-container/5 border border-on-tertiary-container/20 rounded-xl w-fit mx-auto">
            <span className="material-symbols-outlined text-on-tertiary-container text-[18px]">verified_user</span>
            <p className="text-sm font-black text-on-tertiary-container tracking-wide">STAY SAFU — your capital deserves better.</p>
          </div>
          <p className="text-xs text-on-surface-variant">
            Switch to a chain like <span className="font-bold text-on-surface">Ethereum, Base, or Arbitrum</span> to find vetted, high-liquidity vaults.
          </p>
        </div>
      </div>
    </div>
  )
}

export default function VaultPage() {
  const [chains, setChains]                 = useState([])
  const [selectedChain, setSelectedChain]   = useState(null)
  const [allVaults, setAllVaults]           = useState([])
  const [llamaPools, setLlamaPools]         = useState([])
  const [riskMap, setRiskMap]               = useState(new Map())
  const [llamaPoolMap, setLlamaPoolMap]     = useState(new Map())
  const [doctorsChoice, setDoctorsChoice]   = useState(null)
  const [pageIndex, setPageIndex]           = useState(0)
  const [loading, setLoading]               = useState(false)
  const [llamaLoading, setLlamaLoading]     = useState(false)
  const [chainsLoading, setChainsLoading]   = useState(true)
  const [error, setError]                   = useState(null)
  const [cacheExpiresIn, setCacheExpiresIn] = useState(null)
  const [depositModal, setDepositModal]     = useState(null)
  const [withdrawModal, setWithdrawModal]   = useState(null)

  const [filters, setFilters] = useState({
    search: '', protocol: '', apySort: 'desc', minTvl: 0, grade: '', apyMin: '', apyMax: '',
  })

  useEffect(() => {
    setChainsLoading(true)
    getSupportedChains()
      .then(data => { setChains(data); if (data.length > 0) setSelectedChain(data[0]) })
      .catch(err => setError('Failed to load chains: ' + err.message))
      .finally(() => setChainsLoading(false))
  }, [])

  useEffect(() => {
    setLlamaLoading(true)
    fetchDefiLlamaPools().then(pools => setLlamaPools(pools)).finally(() => setLlamaLoading(false))
  }, [])

  const loadVaultsForChain = useCallback(async (chain) => {
    if (!chain) return
    setLoading(true); setError(null); setAllVaults([]); setPageIndex(0)
    setRiskMap(new Map()); setLlamaPoolMap(new Map()); setDoctorsChoice(null)
    try {
      const vaults = await getVaultsForChain({ chainId: chain.chainId })
      setAllVaults(vaults)
      setCacheExpiresIn(getCacheExpiresIn(CACHE_KEYS.chainVaults(chain.chainId)))
    } catch (err) {
      setError('Failed to load vaults: ' + err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadVaultsForChain(selectedChain) }, [selectedChain, loadVaultsForChain])

  useEffect(() => {
    if (!allVaults.length || !llamaPools.length) return
    const newRiskMap = new Map()
    const newLlamaPoolMap = new Map()
    for (const vault of allVaults) {
      const key  = vault.slug ?? vault.address
      const pool = matchVaultToPool(vault, llamaPools)
      if (pool) { newLlamaPoolMap.set(key, pool); newRiskMap.set(key, computeRiskScore(vault, pool)) }
      else       { newRiskMap.set(key, null) }
    }
    setRiskMap(newRiskMap)
    setLlamaPoolMap(newLlamaPoolMap)
    setDoctorsChoice(pickDoctorsChoice(allVaults, newRiskMap))
  }, [allVaults, llamaPools])

  useEffect(() => {
    if (!selectedChain) return
    const interval = setInterval(() => {
      setCacheExpiresIn(getCacheExpiresIn(CACHE_KEYS.chainVaults(selectedChain.chainId)))
    }, 10000)
    return () => clearInterval(interval)
  }, [selectedChain])

  const hasUserFilters = !!(filters.search || filters.protocol || filters.minTvl > 0 || filters.grade || filters.apyMin !== '' || filters.apyMax !== '')

  const filteredVaults = allVaults.filter(vault => {
    const tvl = Number(vault.analytics?.tvl?.usd ?? 0)
    if (tvl < MIN_TVL_DISPLAY) return false
    if (filters.search) {
      const q = filters.search.toLowerCase()
      if (!vault.name.toLowerCase().includes(q) &&
          !vault.protocol?.name.toLowerCase().includes(q) &&
          !vault.underlyingTokens?.some(t => t.symbol.toLowerCase().includes(q))) return false
    }
    if (filters.protocol && vault.protocol?.name !== filters.protocol) return false
    const effectiveMinTvl = Math.max(filters.minTvl, MIN_TVL_DISPLAY)
    if (tvl < effectiveMinTvl) return false
    const apy = vault.analytics?.apy?.total ?? 0
    if (filters.apyMin !== '' && apy < Number(filters.apyMin)) return false
    if (filters.apyMax !== '' && apy > Number(filters.apyMax)) return false
    if (filters.grade) {
      const risk = riskMap.get(vault.slug ?? vault.address)
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
  useEffect(() => { setPageIndex(0) }, [filters])

  const dcKey      = doctorsChoice ? (doctorsChoice.slug ?? doctorsChoice.address) : null
  const dcRiskData = dcKey ? (riskMap.get(dcKey) ?? null) : null

  const clearFilters = () => setFilters({ search: '', protocol: '', apySort: 'desc', minTvl: 0, grade: '', apyMin: '', apyMax: '' })

  return (
    <AppShell>
      <header className="mb-6 flex justify-between items-end flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-headline font-extrabold tracking-tight text-on-surface">Vault Explorer</h1>
          <p className="text-on-surface-variant font-medium mt-1">Select a chain to browse vaults. All listings meet a minimum $1M TVL threshold.</p>
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

      {chainsLoading ? (
        <div className="flex gap-2 mb-6 animate-pulse">
          {[1,2,3,4,5].map(i => <div key={i} className="h-8 w-24 bg-surface-container rounded-full" />)}
        </div>
      ) : (
        <div className="mb-6 flex gap-2 flex-wrap">
          {chains.map(chain => (
            <button key={chain.chainId}
              onClick={() => { if (chain.chainId !== selectedChain?.chainId) setSelectedChain(chain) }}
              className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all border capitalize ${
                selectedChain?.chainId === chain.chainId
                  ? 'bg-primary-container text-white border-primary-container shadow-md'
                  : 'border-surface-container-high text-on-surface-variant hover:border-primary-container hover:text-on-surface bg-surface-container-lowest'
              }`}>
              {chain.name}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="mb-6 p-4 bg-error-container/30 border border-error-container rounded-xl text-on-error-container text-sm font-medium">
          <strong>Error:</strong> {error}
          <button onClick={() => loadVaultsForChain(selectedChain)} className="ml-4 underline hover:no-underline">Retry</button>
        </div>
      )}

      {loading && <LoadingSkeleton />}

      {!loading && selectedChain && allVaults.length === 0 && !error && (
        <ChainSafuEmptyState chainName={selectedChain.name} />
      )}

      {!loading && allVaults.length > 0 && (
        <>
          {doctorsChoice && (
            <DoctorsChoiceCard
              vault={doctorsChoice}
              riskData={dcRiskData}
              chainName={selectedChain?.name}
              onDeposit={setDepositModal}
              onWithdraw={(vault) => setWithdrawModal({ vault, position: null })}
            />
          )}

          <FilterBar vaults={allVaults} filters={filters} onFiltersChange={f => setFilters(f)} />

          {filteredVaults.length === 0 ? (
            hasUserFilters
              ? <FilterEmptyState onClearFilters={clearFilters} />
              : <ChainSafuEmptyState chainName={selectedChain?.name} />
          ) : (
            <VaultTable
              vaults={pagedVaults}
              riskMap={riskMap}
              llamaPoolMap={llamaPoolMap}
              doctorsChoiceAddress={doctorsChoice?.address}
              onDeposit={setDepositModal}
              onWithdraw={(vault) => setWithdrawModal({ vault, position: null })}
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

      {withdrawModal && (
        <WithdrawModal
          vault={withdrawModal.vault}
          position={withdrawModal.position}
          onClose={() => setWithdrawModal(null)}
          onSuccess={() => setWithdrawModal(null)}
        />
      )}
    </AppShell>
  )
}