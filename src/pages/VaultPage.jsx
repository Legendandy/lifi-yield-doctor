// src/pages/VaultPage.jsx
import { useState, useEffect, useCallback, useRef } from 'react'
import { useAccount } from 'wagmi'
import AppShell from '../components/AppShell'
import DepositModal from '../components/DepositModal'
import { getVaultsForChain, getSupportedChains, computeVaultRankScore } from '../services/earnApi'
import { getCacheExpiresIn, CACHE_KEYS } from '../services/vaultCache'

const PAGE_SIZE = 20

function getDoctorsChoice(vaults) {
  if (!vaults.length) return null
  return vaults[0]
}

function computeUpgradeImpact(doctorsChoiceVault, allVaults, assumedBalanceUsd = 10_000) {
  if (!allVaults.length || !doctorsChoiceVault?.analytics?.apy?.total) return null

  const apys = allVaults
    .map(v => v.analytics?.apy?.total)
    .filter(a => a != null)
    .sort((a, b) => a - b)

  if (apys.length === 0) return null

  const medianApy = apys[Math.floor(apys.length / 2)]
  const bestApy = doctorsChoiceVault.analytics.apy.total

  if (bestApy <= medianApy) return null

  const annualGain = (bestApy - medianApy) * assumedBalanceUsd
  if (annualGain < 1) return null

  return {
    apyBoost: ((bestApy - medianApy) * 100).toFixed(2),
    annualGain: annualGain.toFixed(0),
    medianApy: (medianApy * 100).toFixed(2),
    bestApy: (bestApy * 100).toFixed(2),
  }
}

function formatTimeRemaining(ms) {
  if (!ms || ms <= 0) return null
  const mins = Math.floor(ms / 60000)
  const secs = Math.floor((ms % 60000) / 1000)
  if (mins > 0) return `${mins}m`
  return `${secs}s`
}

export default function VaultPage() {
  const { address } = useAccount()

  const [chains, setChains] = useState([])
  const [selectedChain, setSelectedChain] = useState(null)
  const [allVaults, setAllVaults] = useState([])
  const [pageIndex, setPageIndex] = useState(0)
  const [loading, setLoading] = useState(false)
  const [chainsLoading, setChainsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [cacheExpiresIn, setCacheExpiresIn] = useState(null)
  const [depositModal, setDepositModal] = useState(null)

  useEffect(() => {
    setChainsLoading(true)
    getSupportedChains()
      .then(data => {
        setChains(data)
        if (data.length > 0) setSelectedChain(data[0])
      })
      .catch(err => {
        console.error('Chains load error:', err)
        setError('Failed to load chains: ' + err.message)
      })
      .finally(() => setChainsLoading(false))
  }, [])

  const loadVaultsForChain = useCallback(async (chain) => {
    if (!chain) return
    setLoading(true)
    setError(null)
    setAllVaults([])
    setPageIndex(0)
    try {
      const ranked = await getVaultsForChain({ chainId: chain.chainId })
      setAllVaults(ranked)
      const remaining = getCacheExpiresIn(CACHE_KEYS.chainVaults(chain.chainId))
      setCacheExpiresIn(remaining)
    } catch (err) {
      console.error('Vault load error:', err)
      setError('Failed to load vaults: ' + err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadVaultsForChain(selectedChain)
  }, [selectedChain, loadVaultsForChain])

  useEffect(() => {
    if (!selectedChain) return
    const interval = setInterval(() => {
      const remaining = getCacheExpiresIn(CACHE_KEYS.chainVaults(selectedChain.chainId))
      setCacheExpiresIn(remaining)
    }, 10000)
    return () => clearInterval(interval)
  }, [selectedChain])

  const totalPages = Math.ceil(allVaults.length / PAGE_SIZE)
  const pagedVaults = allVaults.slice(pageIndex * PAGE_SIZE, (pageIndex + 1) * PAGE_SIZE)
  const doctorsChoice = getDoctorsChoice(allVaults)
  const upgradeImpact = doctorsChoice ? computeUpgradeImpact(doctorsChoice, allVaults) : null

  function handleChainSelect(chain) {
    if (chain.chainId === selectedChain?.chainId) return
    setSelectedChain(chain)
  }

  return (
    <AppShell>
      <header className="mb-6 flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-headline font-extrabold tracking-tight text-on-surface">
            Vault Explorer
          </h1>
          <p className="text-on-surface-variant font-medium mt-1">
            Select a chain to see all verified vaults, ranked by yield quality and liquidity depth.
          </p>
        </div>
        {cacheExpiresIn != null && (
          <span className="text-[10px] text-on-surface-variant font-medium bg-surface-container px-3 py-1.5 rounded-full">
            Rankings refresh in {formatTimeRemaining(cacheExpiresIn)}
          </span>
        )}
      </header>

      {chainsLoading ? (
        <div className="flex gap-2 mb-6 animate-pulse">
          {[1,2,3,4,5].map(i => (
            <div key={i} className="h-8 w-24 bg-surface-container rounded-full" />
          ))}
        </div>
      ) : (
        <div className="mb-6 flex gap-2 flex-wrap">
          {chains.map(chain => (
            <button
              key={chain.chainId}
              onClick={() => handleChainSelect(chain)}
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

      {error && (
        <div className="mb-6 p-4 bg-error-container/30 border border-error-container rounded-xl text-on-error-container text-sm font-medium">
          <strong>Error:</strong> {error}
          <button
            onClick={() => loadVaultsForChain(selectedChain)}
            className="ml-4 underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      )}

      {!selectedChain && !chainsLoading && (
        <div className="p-12 text-center text-on-surface-variant">
          <span className="material-symbols-outlined text-4xl block mb-3">hub</span>
          Select a chain above to explore vaults.
        </div>
      )}

      {loading && <LoadingSkeleton />}

      {!loading && selectedChain && allVaults.length === 0 && !error && (
        <div className="p-12 text-center text-on-surface-variant">
          <span className="material-symbols-outlined text-4xl block mb-3">search_off</span>
          No vaults found on {selectedChain.name}. This chain may have limited vault availability.
        </div>
      )}

      {!loading && allVaults.length > 0 && (
        <div className="space-y-8">
          {doctorsChoice && (
            <DoctorsChoiceCard
              vault={doctorsChoice}
              impact={upgradeImpact}
              onDeposit={() => setDepositModal(doctorsChoice)}
              chainName={selectedChain?.name}
            />
          )}

          <VaultTable
            vaults={pagedVaults}
            allVaults={allVaults}
            doctorsChoiceAddress={doctorsChoice?.address}
            onDeposit={(vault) => setDepositModal(vault)}
            pageIndex={pageIndex}
            totalPages={totalPages}
            totalVaults={allVaults.length}
            onPageChange={setPageIndex}
          />
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

function DoctorsChoiceCard({ vault, impact, onDeposit, chainName }) {
  const apy = vault.analytics.apy.total != null
    ? (vault.analytics.apy.total * 100).toFixed(2)
    : 'N/A'
  const apy30d = vault.analytics.apy30d != null
    ? (vault.analytics.apy30d * 100).toFixed(2)
    : null
  const tvlM = Number(vault.analytics.tvl.usd) >= 1_000_000
    ? `$${(Number(vault.analytics.tvl.usd) / 1e6).toFixed(1)}M`
    : `$${(Number(vault.analytics.tvl.usd) / 1000).toFixed(0)}K`

  const rankScore = computeVaultRankScore(vault)
  const isComposable = vault.isTransactional !== false
  const isRedeemable = vault.isRedeemable !== false

  return (
    <div className="bg-surface-container-lowest rounded-2xl clinical-shadow overflow-hidden border border-surface-container">
      <div className="grid grid-cols-12 gap-0">
        <div className={`${impact ? 'col-span-12 lg:col-span-8' : 'col-span-12'} p-8 space-y-6`}>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="material-symbols-outlined text-on-tertiary-container text-lg">verified</span>
            <span className="text-xs font-black uppercase tracking-widest text-on-tertiary-container">
              Doctor's Choice — {chainName}
            </span>
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
              <span className="flex items-center gap-1 text-[10px] font-black bg-error/10 text-error px-2 py-0.5 rounded-full">
                ⚠ Not redeemable
              </span>
            )}
          </div>

          <div>
            <h2 className="text-3xl font-headline font-extrabold text-on-surface tracking-tight">
              {vault.name}
            </h2>
            <p className="text-on-surface-variant text-sm mt-1 font-medium">
              {vault.protocol.name} · {vault.network ?? `Chain ${vault.chainId}`}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-6">
            <div>
              <p className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant mb-1">Expected APY</p>
              <p className="text-4xl font-headline font-black text-on-surface">{apy}%</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant mb-1">30-Day Avg</p>
              <p className="text-4xl font-headline font-black text-on-surface-variant">
                {apy30d ? `${apy30d}%` : 'N/A'}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant mb-1">Total TVL</p>
              <p className="text-4xl font-headline font-black text-on-surface">{tvlM}</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {vault.underlyingTokens?.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {vault.underlyingTokens.map((t, i) => (
                  <span key={i} className="px-3 py-1 bg-secondary-container text-on-secondary-container rounded-full text-xs font-bold">
                    {t.symbol}
                  </span>
                ))}
              </div>
            )}
            <div className="flex items-center gap-1.5 ml-auto">
              <span className="text-[10px] text-on-surface-variant font-bold uppercase tracking-wider">Quality Score</span>
              <span className="px-2 py-0.5 bg-on-tertiary-container/10 text-on-tertiary-container rounded-full text-xs font-black">
                {Math.round(rankScore * 100)}/100
              </span>
            </div>
          </div>

          {!impact && (
            <button
              onClick={onDeposit}
              className="px-6 py-3 bg-primary-container text-white rounded-xl font-black text-sm hover:opacity-90 transition-colors"
            >
              Deposit Now
            </button>
          )}
        </div>

        {impact && (
          <div className="col-span-12 lg:col-span-4 bg-primary-container p-8 flex flex-col justify-between">
            <div className="space-y-4">
              <h3 className="font-headline font-bold text-xl text-white">Upgrade Impact</h3>
              <p className="text-sm text-slate-300 leading-relaxed">
                Switching to this vault increases your projected annual revenue by{' '}
                <span className="text-tertiary-fixed font-bold">
                  +${Number(impact.annualGain).toLocaleString()}/yr
                </span>{' '}
                with a{' '}
                <span className="text-tertiary-fixed font-bold">
                  +{impact.apyBoost}% APY boost
                </span>{' '}
                vs the chain median on a $10,000 deposit.
              </p>
              <div className="pt-2 space-y-2">
                <div className="flex justify-between text-xs text-slate-400">
                  <span>Chain median APY</span>
                  <span>{impact.medianApy}%</span>
                </div>
                <div className="flex justify-between text-xs text-white font-bold">
                  <span>This vault APY</span>
                  <span className="text-tertiary-fixed">{impact.bestApy}%</span>
                </div>
              </div>
            </div>
            <button
              onClick={onDeposit}
              className="w-full mt-6 py-4 bg-white text-primary-container rounded-xl font-black text-sm hover:bg-slate-100 transition-colors"
            >
              Execute Upgrade
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function VaultTable({
  vaults, allVaults, doctorsChoiceAddress,
  onDeposit,
  pageIndex, totalPages, totalVaults, onPageChange
}) {
  const medianApy = (() => {
    const apys = allVaults.map(v => v.analytics?.apy?.total).filter(a => a != null).sort((a, b) => a - b)
    return apys.length > 0 ? apys[Math.floor(apys.length / 2)] : null
  })()

  const sortedByTvl = [...allVaults].sort((a, b) => Number(b.analytics?.tvl?.usd ?? 0) - Number(a.analytics?.tvl?.usd ?? 0))
  const highLiquidityThreshold = Number(sortedByTvl[Math.floor(sortedByTvl.length * 0.2)]?.analytics?.tvl?.usd ?? 0)

  return (
    <div className="bg-surface-container-lowest rounded-2xl clinical-shadow">
      <div className="px-6 py-5 border-b border-surface-container flex justify-between items-center">
        <div>
          <h3 className="font-headline font-bold text-xl text-on-surface">All Verified Vaults</h3>
          <p className="text-xs text-on-surface-variant mt-0.5">
            Ranked by quality score (APY × TVL blend) · {totalVaults} vaults found
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] bg-surface-container px-3 py-1 rounded-full font-bold text-on-surface-variant uppercase tracking-wider">
            Page {pageIndex + 1} of {totalPages}
          </span>
        </div>
      </div>

      {/* Column headers */}
      <div className="px-6 py-3 grid grid-cols-12 gap-4 text-[10px] uppercase tracking-widest font-bold text-on-surface-variant border-b border-surface-container bg-surface-container-low">
        <div className="col-span-1 text-center">#</div>
        <div className="col-span-4">Protocol / Chain</div>
        <div className="col-span-2 text-right">Current APY</div>
        <div className="col-span-1 text-right">30d Avg</div>
        <div className="col-span-2 text-right">TVL</div>
        <div className="col-span-2 text-right">Action</div>
      </div>

      <div className="divide-y divide-surface-container">
        {vaults.map((vault, i) => {
          const globalRank = pageIndex * PAGE_SIZE + i + 1
          const isBestMatch = vault.address === doctorsChoiceAddress
          const apy = vault.analytics.apy.total != null
            ? (vault.analytics.apy.total * 100).toFixed(2)
            : null
          const apy30d = vault.analytics.apy30d != null
            ? (vault.analytics.apy30d * 100).toFixed(2)
            : null
          const tvlRaw = Number(vault.analytics.tvl.usd ?? 0)
          const tvlDisplay = tvlRaw >= 1_000_000
            ? `$${(tvlRaw / 1e6).toFixed(1)}M`
            : `$${(tvlRaw / 1000).toFixed(0)}K`
          const isHighLiquidity = tvlRaw >= highLiquidityThreshold && tvlRaw > 0
          const rankScore = computeVaultRankScore(vault)

          const vsMedian = apy && medianApy
            ? ((Number(apy) / 100) - medianApy)
            : null

          const isComposable = vault.isTransactional !== false
          const isRedeemable = vault.isRedeemable !== false
          const isStablecoin = vault.tags?.includes('stablecoin')

          const badges = []
          if (isBestMatch) badges.push({ label: "Doctor's Pick", color: 'bg-on-tertiary-container text-white' })
          if (isHighLiquidity && !isBestMatch) badges.push({ label: 'High Liquidity', color: 'bg-secondary-container text-on-secondary-container' })
          if (isStablecoin) badges.push({ label: 'Stablecoin', color: 'bg-surface-container text-on-surface-variant' })
          // Composer capability badges — renamed to cross-chain deposit
          if (vault.isTransactional === true && !isBestMatch) {
            badges.push({ label: '⚡ Cross-chain deposit', color: 'bg-on-tertiary-container/10 text-on-tertiary-container' })
          }
          if (vault.isTransactional === false) {
            badges.push({ label: '🔒 Same-chain', color: 'bg-amber-100 text-amber-700' })
          }
          if (vault.isRedeemable === false) {
            badges.push({ label: '⚠ Not redeemable', color: 'bg-error/10 text-error' })
          }

          return (
            <div
              key={vault.address + i}
              className={`px-6 py-4 grid grid-cols-12 gap-4 items-center hover:bg-surface-container-low transition-colors
                ${isBestMatch ? 'bg-tertiary-container/5' : ''}
              `}
            >
              <div className="col-span-1 text-center">
                <span className="text-sm font-black text-on-surface-variant">{globalRank}</span>
              </div>

              <div className="col-span-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-surface-container flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-on-surface-variant text-[16px]">account_balance</span>
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="font-bold text-sm text-on-surface truncate">{vault.name}</p>
                  </div>
                  <p className="text-xs text-on-surface-variant mt-0.5 truncate">
                    {vault.protocol.name} · {vault.network ?? `Chain ${vault.chainId}`}
                  </p>
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {vault.underlyingTokens?.slice(0, 2).map((t, ti) => (
                      <span key={ti} className="px-1.5 py-0.5 bg-surface-container text-on-surface-variant rounded text-[9px] font-bold">
                        {t.symbol}
                      </span>
                    ))}
                    {badges.map((b, bi) => (
                      <span key={bi} className={`px-1.5 py-0.5 rounded text-[9px] font-black ${b.color}`}>
                        {b.label}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="col-span-2 text-right">
                <p className={`font-headline font-black text-base ${isBestMatch ? 'text-on-tertiary-container' : 'text-on-surface'}`}>
                  {apy ? `${apy}%` : 'N/A'}
                </p>
                {vsMedian !== null && vsMedian > 0 && (
                  <p className="text-[10px] font-bold text-on-tertiary-container mt-0.5">
                    +{(vsMedian * 100).toFixed(1)}% vs avg
                  </p>
                )}
              </div>

              <div className="col-span-1 text-right">
                <p className="text-sm font-medium text-on-surface-variant">
                  {apy30d ? `${apy30d}%` : '—'}
                </p>
              </div>

              <div className="col-span-2 text-right">
                <p className="font-bold text-sm text-on-surface">{tvlDisplay}</p>
                <p className="text-[9px] text-on-surface-variant mt-0.5">
                  Score {Math.round(rankScore * 100)}/100
                </p>
              </div>

              <div className="col-span-2 flex justify-end">
                <button
                  onClick={() => onDeposit(vault)}
                  className={`px-4 py-2 rounded-full text-xs font-bold transition-all
                    ${isBestMatch
                      ? 'bg-primary-container text-white hover:opacity-90'
                      : 'border-2 border-primary-container text-primary-container hover:bg-primary-container hover:text-white'
                    }
                  `}
                >
                  Deposit
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {totalPages > 1 && (
        <div className="p-5 border-t border-surface-container flex items-center justify-between">
          <button
            onClick={() => onPageChange(Math.max(0, pageIndex - 1))}
            disabled={pageIndex === 0}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold border-2 border-surface-container text-on-surface-variant hover:border-primary-container hover:text-on-surface disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            <span className="material-symbols-outlined text-[18px]">chevron_left</span>
            Previous
          </button>

          <div className="flex items-center gap-1">
            {Array.from({ length: totalPages }, (_, i) => i).map(p => {
              const show = p === 0 || p === totalPages - 1 || Math.abs(p - pageIndex) <= 2
              const isEllipsis = !show && (p === 1 || p === totalPages - 2)
              if (!show && !isEllipsis) return null
              if (isEllipsis) return <span key={p} className="px-1 text-on-surface-variant text-sm">…</span>
              return (
                <button
                  key={p}
                  onClick={() => onPageChange(p)}
                  className={`w-9 h-9 rounded-full text-sm font-bold transition-all ${
                    p === pageIndex
                      ? 'bg-primary-container text-white'
                      : 'text-on-surface-variant hover:bg-surface-container'
                  }`}
                >
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
            Next
            <span className="material-symbols-outlined text-[18px]">chevron_right</span>
          </button>
        </div>
      )}

      <div className="px-6 py-3 border-t border-surface-container bg-surface-container-low rounded-b-2xl">
        <p className="text-[10px] text-on-surface-variant text-center">
          Showing {pageIndex * PAGE_SIZE + 1}–{Math.min((pageIndex + 1) * PAGE_SIZE, totalVaults)} of {totalVaults} verified vaults
          · Ranked by APY quality × TVL depth
        </p>
      </div>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-56 bg-surface-container rounded-2xl" />
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-16 bg-surface-container rounded-xl" />
        ))}
      </div>
    </div>
  )
}