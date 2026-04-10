// src/pages/HealthMonitorPage.jsx
import { useState, useEffect } from 'react'
import AppShell from '../components/AppShell'
import { getVaults, getProtocols } from '../services/earnApi'
import { computeStabilityScore } from '../utils/stability'

// REAL PROTOCOL HEALTH SCORE LOGIC
// Based on: stability score + TVL size + whether they have reward tokens (complexity risk)
function computeProtocolHealthScore(vaults) {
  if (!vaults.length) return 0
  const avgStability = vaults.reduce((sum, v) => sum + (computeStabilityScore(v) || 0), 0) / vaults.length
  const avgTvl = vaults.reduce((sum, v) => sum + Number(v.analytics?.tvl?.usd || 0), 0) / vaults.length
  // Normalize TVL: $100M = 1.0
  const tvlScore = Math.min(avgTvl / 1e8, 1)
  // Penalize protocols with complex reward structures (more moving parts = more risk)
  const complexityPenalty = vaults.some(v => v.rewardTokens?.length > 0) ? 0.05 : 0
  return Math.min(1, avgStability * 0.6 + tvlScore * 0.4 - complexityPenalty)
}

// DECOUPLING RISK: detect vaults where current APY has drifted > 2x from 30d average
// This indicates a temporary spike or collapse — a real warning signal
function detectDecouplingRisks(vaults) {
  return vaults
    .filter(v => {
      const { apy, apy30d } = v.analytics
      if (!apy?.total || !apy30d) return false
      const ratio = apy.total / apy30d
      return ratio > 1.5 || ratio < 0.5 // 50%+ spike or drop vs 30d avg
    })
    .map(v => ({
      name: v.name,
      protocol: v.protocol.name,
      currentApy: (v.analytics.apy.total * 100).toFixed(2),
      avgApy: (v.analytics.apy30d * 100).toFixed(2),
      drift: (((v.analytics.apy.total / v.analytics.apy30d) - 1) * 100).toFixed(0),
      severity: Math.abs(v.analytics.apy.total / v.analytics.apy30d - 1) > 1 ? 'high' : 'medium',
    }))
    .slice(0, 5)
}

// LIQUIDITY DEPTH: approximate from TVL — higher TVL = lower slippage risk
function computeLiquidityDepth(vault) {
  const tvl = Number(vault.analytics?.tvl?.usd || 0)
  // $100M TVL = 100% depth score
  return Math.min(tvl / 1e8, 1)
}

export default function HealthMonitorPage() {
  const [vaults, setVaults] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      const data = await getVaults({ sortBy: 'tvl', minTvlUsd: 100000, limit: 50 })
      setVaults(data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  // Group vaults by protocol
  const byProtocol = {}
  vaults.forEach(v => {
    const key = v.protocol.name
    if (!byProtocol[key]) byProtocol[key] = []
    byProtocol[key].push(v)
  })

  const protocolScores = Object.entries(byProtocol).map(([name, pvaults]) => ({
    name,
    score: computeProtocolHealthScore(pvaults),
    vaultCount: pvaults.length,
    totalTvl: pvaults.reduce((s, v) => s + Number(v.analytics?.tvl?.usd || 0), 0),
  })).sort((a, b) => b.score - a.score)

  const decouplingRisks = detectDecouplingRisks(vaults)

  const liquidityData = vaults
    .filter(v => v.analytics?.tvl?.usd)
    .sort((a, b) => Number(b.analytics.tvl.usd) - Number(a.analytics.tvl.usd))
    .slice(0, 8)
    .map(v => ({
      name: v.name,
      protocol: v.protocol.name,
      depth: computeLiquidityDepth(v),
      tvl: Number(v.analytics.tvl.usd),
    }))

  if (loading) return <AppShell><LoadingSkeleton /></AppShell>

  return (
    <AppShell>
      <header className="mb-8">
        <h1 className="text-3xl font-headline font-extrabold tracking-tight text-on-surface">
          Health Monitor
        </h1>
        <p className="text-on-surface-variant font-medium mt-1">
          Real-time clinical observation of decentralized liquidity primitives and peg stability.
        </p>
      </header>

      <div className="grid grid-cols-12 gap-8">
        {/* Protocol Health Scores */}
        <section className="col-span-12 lg:col-span-4 space-y-3">
          <h3 className="font-headline font-bold text-xl text-on-surface mb-4">Protocol Health Scores</h3>
          <p className="text-xs text-on-surface-variant mb-4">
            Computed from: APY stability (60%) + TVL depth (40%) − complexity penalty
          </p>
          {protocolScores.slice(0, 8).map(({ name, score, vaultCount, totalTvl }, i) => (
            <div key={i} className="bg-surface-container-lowest p-4 rounded-xl clinical-shadow">
              <div className="flex justify-between items-center mb-2">
                <div>
                  <p className="font-bold text-sm text-on-surface">{name}</p>
                  <p className="text-[10px] text-on-surface-variant">
                    {vaultCount} vault{vaultCount !== 1 ? 's' : ''} · ${(totalTvl / 1e6).toFixed(0)}M TVL
                  </p>
                </div>
                <div className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                  score > 0.75 ? 'bg-tertiary-container/20 text-on-tertiary-container' :
                  score > 0.5 ? 'bg-secondary-container text-on-secondary-container' :
                  'bg-error-container text-on-error-container'
                }`}>
                  {Math.round(score * 100)}
                </div>
              </div>
              <div className="h-1.5 bg-surface-container rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.round(score * 100)}%`,
                    backgroundColor: score > 0.75 ? '#009844' : score > 0.5 ? '#f59e0b' : '#ba1a1a',
                  }}
                />
              </div>
            </div>
          ))}
        </section>

        {/* Liquidity Depth */}
        <section className="col-span-12 lg:col-span-4 space-y-4">
          <div>
            <h3 className="font-headline font-bold text-xl text-on-surface">Liquidity Depth</h3>
            <p className="text-xs text-on-surface-variant mt-1">
              Slippage risk proxy — derived from real vault TVL data
            </p>
          </div>
          <div className="bg-surface-container-lowest p-6 rounded-xl clinical-shadow space-y-4">
            {liquidityData.map((item, i) => (
              <div key={i}>
                <div className="flex justify-between mb-1">
                  <span className="text-xs font-bold text-on-surface">{item.name}</span>
                  <span className="text-xs text-on-surface-variant">
                    ${(item.tvl / 1e6).toFixed(1)}M
                  </span>
                </div>
                <div className="h-2 bg-surface-container rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.round(item.depth * 100)}%`,
                      backgroundColor: item.depth > 0.7 ? '#009844' : item.depth > 0.3 ? '#3b82f6' : '#f59e0b',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Decoupling Risks */}
        <section className="col-span-12 lg:col-span-4 space-y-4">
          <div>
            <h3 className="font-headline font-bold text-xl text-on-surface">Decoupling Risks</h3>
            <p className="text-xs text-on-surface-variant mt-1">
              Vaults where current APY deviates ≥50% from 30-day average
            </p>
          </div>
          {decouplingRisks.length === 0 ? (
            <div className="bg-tertiary-container/10 border border-on-tertiary-container/20 p-6 rounded-xl text-center">
              <span className="material-symbols-outlined text-on-tertiary-container text-3xl">check_circle</span>
              <p className="font-bold text-on-tertiary-container mt-2">No decoupling risks detected</p>
              <p className="text-xs text-on-surface-variant mt-1">All monitored vaults within normal APY range</p>
            </div>
          ) : (
            <div className="space-y-3">
              {decouplingRisks.map((risk, i) => (
                <div
                  key={i}
                  className={`p-4 rounded-xl border-l-4 ${
                    risk.severity === 'high'
                      ? 'bg-error-container/20 border-error'
                      : 'bg-secondary-container/30 border-secondary'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-bold text-sm text-on-surface">{risk.name}</p>
                      <p className="text-xs text-on-surface-variant">{risk.protocol}</p>
                    </div>
                    <span className={`text-xs font-black px-2 py-0.5 rounded-full ${
                      risk.severity === 'high' ? 'bg-error-container text-on-error-container' : 'bg-secondary-container text-on-secondary-container'
                    }`}>
                      {risk.drift > 0 ? '+' : ''}{risk.drift}% drift
                    </span>
                  </div>
                  <p className="text-xs text-on-surface-variant mt-2">
                    Current: {risk.currentApy}% vs 30d avg: {risk.avgApy}%
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  )
}

function LoadingSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-8 w-64 bg-surface-container rounded" />
      <div className="grid grid-cols-12 gap-8 mt-6">
        {[4, 4, 4].map((cols, i) => (
          <div key={i} className={`col-span-${cols} space-y-3`}>
            {[1,2,3,4,5].map(j => (
              <div key={j} className="h-16 bg-surface-container rounded-xl" />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}