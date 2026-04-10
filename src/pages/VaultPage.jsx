// src/pages/VaultPage.jsx
import { useState, useEffect, useCallback } from 'react'
import { useAccount } from 'wagmi'
import AppShell from '../components/AppShell'
import { getVaultsPaged } from '../services/earnApi'
import { executeDeposit } from '../services/executeDeposit'

// ─── Doctor's Choice logic ────────────────────────────────────────────────────
// Best vault = highest APY among sane vaults with TVL > $1M
// We weight high TVL (real liquidity) and a top APY together.
function getDoctorsChoice(vaults) {
  if (!vaults.length) return null
  // Among all sane vaults, pick the one with the highest APY that also has TVL > $1M
  const highLiquidity = vaults.filter(
    (v) => Number(v.analytics?.tvl?.usd ?? 0) >= 1_000_000
  )
  const pool = highLiquidity.length ? highLiquidity : vaults
  return pool.reduce((best, vault) => {
    const apy = vault.analytics?.apy?.total ?? 0
    const bestApy = best.analytics?.apy?.total ?? 0
    return apy > bestApy ? vault : best
  }, pool[0])
}

// Upgrade impact vs market median
function computeUpgradeImpact(doctorsChoiceVault, allVaults, assumedBalanceUsd = 10_000) {
  const apys = allVaults
    .map((v) => v.analytics?.apy?.total)
    .filter((a) => a != null)
    .sort((a, b) => a - b)
  if (!apys.length || !doctorsChoiceVault?.analytics?.apy?.total) return null
  const medianApy = apys[Math.floor(apys.length / 2)]
  const bestApy = doctorsChoiceVault.analytics.apy.total
  const annualGain = (bestApy - medianApy) * assumedBalanceUsd
  return {
    apyBoost: ((bestApy - medianApy) * 100).toFixed(2),
    annualGain: annualGain.toFixed(2),
  }
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function VaultPage() {
  const { address } = useAccount()
  const [vaults, setVaults] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(null)
  const [depositing, setDepositing] = useState(null)
  const [nextCursor, setNextCursor] = useState(null)

  const PAGE_SIZE = 10

  const loadVaults = useCallback(async (cursor = null, append = false) => {
    if (!cursor) setLoading(true)
    else setLoadingMore(true)
    setError(null)
    try {
      const { data, nextCursor: nc } = await getVaultsPaged({
        sortBy: 'apy',
        minTvlUsd: 500_000,
        pageSize: PAGE_SIZE,
        cursor: cursor ?? undefined,
      })
      setVaults((prev) => (append ? [...prev, ...data] : data))
      setNextCursor(nc)
    } catch (err) {
      console.error('VaultPage error:', err)
      setError(err.message)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [])

  useEffect(() => {
    loadVaults()
  }, [loadVaults])

  const doctorsChoice = getDoctorsChoice(vaults)
  const upgradeImpact = doctorsChoice ? computeUpgradeImpact(doctorsChoice, vaults) : null

  async function handleDeposit(vault) {
    if (!vault.underlyingTokens?.length) {
      alert('No underlying token info available for this vault.')
      return
    }
    setDepositing(vault.address)
    try {
      await executeDeposit({
        vault,
        fromToken: vault.underlyingTokens[0],
        fromAmount: '1000000',
        userAddress: address,
      })
      alert('Deposit transaction sent!')
    } catch (err) {
      alert(`Deposit failed: ${err.message}`)
    } finally {
      setDepositing(null)
    }
  }

  if (loading) {
    return (
      <AppShell>
        <LoadingSkeleton />
      </AppShell>
    )
  }

  return (
    <AppShell>
      {/* ── Header ── */}
      <header className="mb-8 flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-headline font-extrabold tracking-tight text-on-surface">
            Ranked Alternatives: Upgrade Your Yield
          </h1>
          <p className="text-on-surface-variant font-medium mt-1">
            Our clinical engine identified the highest-verified yield opportunities across protocols.
          </p>
        </div>
        {!loading && !error && vaults.length > 0 && (
          <div className="flex items-center gap-2 bg-surface-container-lowest px-4 py-2 rounded-full clinical-shadow">
            <span className="text-[10px] text-on-surface-variant font-bold uppercase tracking-widest">
              Analysis Mode:
            </span>
            <span className="flex items-center gap-1.5 text-[10px] font-black text-on-tertiary-container">
              <span className="w-1.5 h-1.5 rounded-full bg-on-tertiary-container animate-pulse" />
              Precision Yield
            </span>
          </div>
        )}
      </header>

      {error && (
        <div className="mb-6 p-4 bg-error-container/30 border border-error-container rounded-xl text-on-error-container text-sm font-medium">
          <strong>Error loading vaults:</strong> {error}
          <button onClick={() => loadVaults()} className="ml-4 underline hover:no-underline">
            Retry
          </button>
        </div>
      )}

      {!error && vaults.length === 0 && (
        <div className="p-8 text-center text-on-surface-variant">
          No vaults found. Try adjusting filters or check your API key.
        </div>
      )}

      {vaults.length > 0 && (
        <div className="space-y-8">

          {/* ── Doctor's Choice — full width on top ── */}
          {doctorsChoice && (
            <DoctorsChoiceCard
              vault={doctorsChoice}
              impact={upgradeImpact}
              onDeposit={() => handleDeposit(doctorsChoice)}
              isDepositing={depositing === doctorsChoice.address}
            />
          )}

          {/* ── Vault Table — full width below ── */}
          <VaultTable
            vaults={vaults}
            doctorsChoiceAddress={doctorsChoice?.address}
            onDeposit={handleDeposit}
            depositing={depositing}
            onLoadMore={nextCursor ? () => loadVaults(nextCursor, true) : null}
            loadingMore={loadingMore}
          />

        </div>
      )}

      {/* Footer note */}
      <div className="mt-10 flex items-center justify-between text-xs text-on-surface-variant">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-sm">verified_user</span>
          All suggested protocols have passed APY sanity verification · APY capped at 200% · TVL &gt; $500k
        </div>
        <button
          onClick={() => loadVaults()}
          className="flex items-center gap-1.5 hover:text-on-surface transition-colors font-medium"
        >
          <span className="material-symbols-outlined text-sm">refresh</span>
          Refresh Analysis
        </button>
      </div>
    </AppShell>
  )
}

// ─── Doctor's Choice Card (full width, on top) ────────────────────────────────
function DoctorsChoiceCard({ vault, impact, onDeposit, isDepositing }) {
  const apy =
    vault.analytics.apy.total != null
      ? (vault.analytics.apy.total * 100).toFixed(2)
      : 'N/A'
  const apy30d =
    vault.analytics.apy30d != null
      ? (vault.analytics.apy30d * 100).toFixed(2)
      : null
  const tvlM = (Number(vault.analytics.tvl.usd) / 1e6).toFixed(1)

  return (
    <div className="bg-surface-container-lowest rounded-2xl clinical-shadow overflow-hidden">
      <div className="grid grid-cols-12 gap-0">
        {/* Left: vault info */}
        <div className="col-span-12 lg:col-span-8 p-8 space-y-6">
          {/* Badge */}
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-on-tertiary-container text-lg">
              verified
            </span>
            <span className="text-xs font-black uppercase tracking-widest text-on-tertiary-container">
              Doctor's Choice
            </span>
          </div>

          {/* Vault name */}
          <div>
            <h2 className="text-3xl font-headline font-extrabold text-on-surface tracking-tight">
              {vault.name}
            </h2>
            <p className="text-on-surface-variant text-sm mt-1 font-medium">
              {vault.protocol.name} · {vault.network ?? `Chain ${vault.chainId}`}
            </p>
          </div>

          {/* Metrics row */}
          <div className="grid grid-cols-3 gap-8">
            <div>
              <p className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant mb-1">
                Expected APY
              </p>
              <p className="text-4xl font-headline font-black text-on-surface">
                {apy}%
              </p>
            </div>
            {apy30d && (
              <div>
                <p className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant mb-1">
                  30-Day Avg
                </p>
                <p className="text-4xl font-headline font-black text-on-surface-variant">
                  {apy30d}%
                </p>
              </div>
            )}
            <div>
              <p className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant mb-1">
                Total TVL
              </p>
              <p className="text-4xl font-headline font-black text-on-surface">
                ${tvlM}M
              </p>
            </div>
          </div>

          {/* Underlying tokens */}
          {vault.underlyingTokens?.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {vault.underlyingTokens.map((t, i) => (
                <span
                  key={i}
                  className="px-3 py-1 bg-secondary-container text-on-secondary-container rounded-full text-xs font-bold"
                >
                  {t.symbol}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Right: Upgrade Impact */}
        <div className="col-span-12 lg:col-span-4 bg-primary-container p-8 flex flex-col justify-between">
          <div className="space-y-4">
            <h3 className="font-headline font-bold text-xl text-white">
              Upgrade Impact
            </h3>
            {impact ? (
              <p className="text-sm text-slate-300 leading-relaxed">
                Switching to the recommended position will increase your projected annual revenue by{' '}
                <span className="text-tertiary-fixed font-bold">
                  +${Number(impact.annualGain).toLocaleString()}/yr
                </span>{' '}
                with a{' '}
                <span className="text-tertiary-fixed font-bold">
                  +{impact.apyBoost}% APY boost
                </span>{' '}
                vs the market median on a $10,000 deposit.
              </p>
            ) : (
              <p className="text-sm text-slate-300 leading-relaxed">
                This vault offers the best verified yield-to-safety ratio in the current market.
              </p>
            )}
          </div>
          <button
            onClick={onDeposit}
            disabled={isDepositing}
            className="w-full mt-6 py-4 bg-white text-primary-container rounded-xl font-black text-sm hover:bg-slate-100 transition-colors disabled:opacity-50"
          >
            {isDepositing ? 'Depositing...' : 'Execute Upgrade'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Vault Table (full width, below Doctor's Choice) ─────────────────────────
function VaultTable({ vaults, doctorsChoiceAddress, onDeposit, depositing, onLoadMore, loadingMore }) {
  return (
    <div className="bg-surface-container-lowest rounded-2xl clinical-shadow">
      {/* Table header */}
      <div className="px-6 py-5 border-b border-surface-container flex justify-between items-center">
        <div>
          <h3 className="font-headline font-bold text-xl text-on-surface">
            All Verified Vaults
          </h3>
          <p className="text-xs text-on-surface-variant mt-0.5">
            Sorted by highest APY · All verified: APY ≤ 200% · TVL &gt; $500k
          </p>
        </div>
        <span className="text-[10px] bg-surface-container px-3 py-1 rounded-full font-bold text-on-surface-variant uppercase tracking-wider">
          {vaults.length} vaults
        </span>
      </div>

      {/* Column headers */}
      <div className="px-6 py-3 grid grid-cols-12 gap-4 text-[10px] uppercase tracking-widest font-bold text-on-surface-variant border-b border-surface-container bg-surface-container-low">
        <div className="col-span-5">Protocol / Chain</div>
        <div className="col-span-2 text-right">Current APY</div>
        <div className="col-span-2 text-right">TVL</div>
        <div className="col-span-3 text-right">Action</div>
      </div>

      {/* Rows */}
      <div>
        {vaults.map((vault, i) => {
          const isBestMatch = vault.address === doctorsChoiceAddress
          const apy =
            vault.analytics.apy.total != null
              ? (vault.analytics.apy.total * 100).toFixed(2)
              : null
          const tvlM = (Number(vault.analytics.tvl.usd) / 1e6).toFixed(1)
          // Improvement vs next vault (or just show the APY rank)
          const prevApy = i > 0 ? (vaults[i - 1].analytics?.apy?.total ?? 0) * 100 : null
          const improvementVsPrev = prevApy && apy
            ? null // only show improvement for first vault vs rest
            : null
          // For first vault show "Best APY" badge, for others show improvement vs median
          const medianApy = vaults.length > 2
            ? (vaults[Math.floor(vaults.length / 2)]?.analytics?.apy?.total ?? 0) * 100
            : null
          const improvementVsMedian = apy && medianApy
            ? (Number(apy) - medianApy).toFixed(1)
            : null

          return (
            <div
              key={i}
              className={`px-6 py-5 grid grid-cols-12 gap-4 items-center hover:bg-surface-container-low transition-colors
                ${isBestMatch ? 'bg-tertiary-container/5' : ''}
                ${i < vaults.length - 1 ? 'border-b border-surface-container' : ''}
              `}
            >
              {/* Protocol / Chain */}
              <div className="col-span-5 flex items-center gap-4">
                {/* Rank number */}
                <span className="text-xl font-black text-on-surface-variant w-7 shrink-0">
                  {i + 1}
                </span>
                {/* Icon placeholder */}
                <div className="w-10 h-10 rounded-xl bg-surface-container flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-on-surface-variant text-[18px]">
                    account_balance
                  </span>
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold text-sm text-on-surface truncate">
                      {vault.name}
                    </p>
                    {isBestMatch && (
                      <span className="shrink-0 px-2 py-0.5 bg-on-tertiary-container text-white text-[9px] font-black rounded-full uppercase tracking-wider">
                        Best Match
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-on-surface-variant mt-0.5 truncate">
                    {vault.protocol.name} · {vault.network ?? `Chain ${vault.chainId}`}
                  </p>
                  {/* Underlying tokens */}
                  {vault.underlyingTokens?.length > 0 && (
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {vault.underlyingTokens.slice(0, 3).map((t, ti) => (
                        <span
                          key={ti}
                          className="px-1.5 py-0.5 bg-surface-container text-on-surface-variant rounded text-[9px] font-bold"
                        >
                          {t.symbol}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* APY */}
              <div className="col-span-2 text-right">
                <p
                  className={`font-headline font-black text-lg ${
                    isBestMatch ? 'text-on-tertiary-container' : 'text-on-surface'
                  }`}
                >
                  {apy ? `${apy}%` : 'N/A'}
                </p>
                {improvementVsMedian && Number(improvementVsMedian) > 0 && (
                  <p className="text-[10px] font-bold text-on-tertiary-container mt-0.5">
                    +{improvementVsMedian}% vs median
                  </p>
                )}
              </div>

              {/* TVL */}
              <div className="col-span-2 text-right">
                <p className="font-bold text-sm text-on-surface">${tvlM}M</p>
                {Number(vault.analytics.tvl.usd) >= 10_000_000 && (
                  <p className="text-[9px] text-on-tertiary-container font-bold mt-0.5 uppercase tracking-wider">
                    High Liquidity
                  </p>
                )}
              </div>

              {/* Action */}
              <div className="col-span-3 flex justify-end">
                <button
                  onClick={() => onDeposit(vault)}
                  disabled={depositing === vault.address}
                  className={`px-6 py-2.5 rounded-full text-sm font-bold transition-all disabled:opacity-50
                    ${isBestMatch
                      ? 'bg-primary-container text-white hover:opacity-90'
                      : 'border-2 border-primary-container text-primary-container hover:bg-primary-container hover:text-white'
                    }
                  `}
                >
                  {depositing === vault.address ? '...' : 'Deposit'}
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Load More */}
      {onLoadMore && (
        <div className="p-6 border-t border-surface-container text-center">
          <button
            onClick={onLoadMore}
            disabled={loadingMore}
            className="px-8 py-3 bg-surface-container text-on-surface rounded-full text-sm font-bold hover:bg-surface-container-high transition-colors disabled:opacity-50 flex items-center gap-2 mx-auto"
          >
            {loadingMore ? (
              <>
                <span className="material-symbols-outlined text-sm animate-spin">refresh</span>
                Loading more vaults...
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-sm">expand_more</span>
                Load more vaults
              </>
            )}
          </button>
        </div>
      )}
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-8 w-96 bg-surface-container rounded" />
      <div className="h-56 bg-surface-container rounded-2xl" />
      <div className="h-96 bg-surface-container rounded-2xl" />
    </div>
  )
}