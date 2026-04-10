// src/pages/StabilityIndexPage.jsx
import { useState, useEffect } from 'react'
import AppShell from '../components/AppShell'
import { getVaults } from '../services/earnApi'
import { computeStabilityScore } from '../utils/stability'

function computeApyDrift(vault) {
  const { apy, apy1d, apy7d, apy30d } = vault.analytics
  if (!apy?.total || !apy1d || !apy7d || !apy30d) return null

  return {
    current: apy.total,
    drift1d: (((apy.total - apy1d) / apy1d) * 100).toFixed(1),
    drift7d: (((apy.total - apy7d) / apy7d) * 100).toFixed(1),
    drift30d: (((apy.total - apy30d) / apy30d) * 100).toFixed(1),
    absoluteDrift:
      Math.abs(apy.total - apy30d) +
      Math.abs(apy7d - apy30d) +
      Math.abs(apy1d - apy7d),
  }
}

function getVolatilityColor(drift) {
  const abs = Math.abs(drift?.absoluteDrift || 0)
  if (abs < 0.005) return { bg: '#dcfce7', text: '#166534' }
  if (abs < 0.015) return { bg: '#d1fae5', text: '#065f46' }
  if (abs < 0.03) return { bg: '#fef9c3', text: '#854d0e' }
  if (abs < 0.05) return { bg: '#fed7aa', text: '#9a3412' }
  return { bg: '#fecdd3', text: '#9f1239' }
}

export default function StabilityIndexPage() {
  const [vaults, setVaults] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedVault, setSelectedVault] = useState(null)
  const [timeframe, setTimeframe] = useState('30d')

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    setError(null)
    try {
      const data = await getVaults({ sortBy: 'apy', minTvlUsd: 100000, limit: 50 })
      setVaults(data)
      const withDrift = data.find((v) => computeApyDrift(v) !== null)
      if (withDrift) setSelectedVault(withDrift)
    } catch (err) {
      console.error('StabilityIndex error:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const heatmapVaults = vaults
    .filter((v) => computeApyDrift(v) !== null)
    .slice(0, 24)

  const selectedDrift = selectedVault ? computeApyDrift(selectedVault) : null

  if (loading) {
    return (
      <AppShell>
        <LoadingSkeleton />
      </AppShell>
    )
  }

  return (
    <AppShell>
      <header className="mb-8">
        <h1 className="text-3xl font-headline font-extrabold tracking-tight text-on-surface">
          Stability Index
        </h1>
        <p className="text-on-surface-variant font-medium mt-1">
          Quantifying yield drift across 1d/7d/30d timeframes with surgical precision.
        </p>
      </header>

      {error && (
        <div className="mb-6 p-4 bg-error-container/30 border border-error-container rounded-xl text-on-error-container text-sm font-medium">
          <strong>Error loading data:</strong> {error}
          <button onClick={loadData} className="ml-4 underline hover:no-underline">
            Retry
          </button>
        </div>
      )}

      {!error && vaults.length === 0 && (
        <div className="p-8 text-center text-on-surface-variant">No vault data available.</div>
      )}

      {vaults.length > 0 && (
        <div className="grid grid-cols-12 gap-8">
          {/* APY Drift Analysis */}
          <section className="col-span-12 lg:col-span-8 space-y-6">
            <div className="bg-surface-container-lowest p-8 rounded-xl clinical-shadow">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="font-headline font-bold text-xl text-on-surface">
                    APY Drift Analysis
                  </h3>
                  <p className="text-sm text-on-surface-variant mt-1">
                    {selectedVault ? `Active Vault: ${selectedVault.name}` : 'Select a vault'}
                  </p>
                </div>
                <div className="flex bg-surface-container-low p-1 rounded-lg gap-1">
                  {['1d', '7d', '30d'].map((tf) => (
                    <button
                      key={tf}
                      onClick={() => setTimeframe(tf)}
                      className={`px-3 py-1 rounded text-xs font-bold transition-all ${
                        timeframe === tf
                          ? 'bg-primary-container text-white'
                          : 'text-on-surface-variant hover:bg-surface-container'
                      }`}
                    >
                      {tf.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              {selectedDrift ? (
                <div className="grid grid-cols-3 gap-6 mb-8">
                  <DriftMetric
                    label="1-Day Drift"
                    value={`${selectedDrift.drift1d > 0 ? '+' : ''}${selectedDrift.drift1d}%`}
                    isActive={timeframe === '1d'}
                    isPositive={Number(selectedDrift.drift1d) > 0}
                  />
                  <DriftMetric
                    label="7-Day Drift"
                    value={`${selectedDrift.drift7d > 0 ? '+' : ''}${selectedDrift.drift7d}%`}
                    isActive={timeframe === '7d'}
                    isPositive={Number(selectedDrift.drift7d) > 0}
                  />
                  <DriftMetric
                    label="30-Day Drift"
                    value={`${selectedDrift.drift30d > 0 ? '+' : ''}${selectedDrift.drift30d}%`}
                    isActive={timeframe === '30d'}
                    isPositive={Number(selectedDrift.drift30d) > 0}
                  />
                </div>
              ) : (
                <p className="text-on-surface-variant text-sm mb-6">
                  No drift data available for this vault
                </p>
              )}

              {selectedVault && <ApyTimeline vault={selectedVault} />}
            </div>

            {/* Vault Drift Table */}
            <div className="bg-surface-container-lowest rounded-xl clinical-shadow">
              <div className="p-6 border-b border-surface-container">
                <h3 className="font-headline font-bold text-lg text-on-surface">
                  All Vault Drift Scores
                </h3>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  Sorted by absolute drift magnitude — click to inspect
                </p>
              </div>
              <div className="divide-y divide-surface-container">
                {vaults
                  .filter((v) => computeApyDrift(v))
                  .sort(
                    (a, b) =>
                      (computeApyDrift(b)?.absoluteDrift || 0) -
                      (computeApyDrift(a)?.absoluteDrift || 0)
                  )
                  .slice(0, 10)
                  .map((vault, i) => {
                    const drift = computeApyDrift(vault)
                    const score = computeStabilityScore(vault)
                    return (
                      <div
                        key={i}
                        onClick={() => setSelectedVault(vault)}
                        className={`p-4 flex items-center justify-between cursor-pointer hover:bg-surface-container-low transition-colors ${
                          selectedVault?.address === vault.address
                            ? 'bg-secondary-container/30'
                            : ''
                        }`}
                      >
                        <div>
                          <p className="font-bold text-sm text-on-surface">{vault.name}</p>
                          <p className="text-xs text-on-surface-variant">
                            {vault.protocol.name} · {vault.network}
                          </p>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="text-[10px] text-on-surface-variant">30d drift</p>
                            <p
                              className={`font-bold text-sm ${
                                Math.abs(Number(drift?.drift30d)) > 20
                                  ? 'text-on-error-container'
                                  : Math.abs(Number(drift?.drift30d)) > 10
                                  ? 'text-amber-600'
                                  : 'text-on-tertiary-container'
                              }`}
                            >
                              {Number(drift?.drift30d) > 0 ? '+' : ''}
                              {drift?.drift30d}%
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] text-on-surface-variant">Stability</p>
                            <p className="font-bold text-sm text-on-surface">
                              {score !== null ? `${Math.round(score * 100)}%` : 'N/A'}
                            </p>
                          </div>
                        </div>
                      </div>
                    )
                  })}
              </div>
            </div>
          </section>

          {/* Volatility Heatmap */}
          <section className="col-span-12 lg:col-span-4 space-y-4">
            <div className="bg-surface-container-lowest p-6 rounded-xl clinical-shadow">
              <div className="flex items-center gap-3 mb-4">
                <span className="material-symbols-outlined text-on-primary-container">
                  grid_view
                </span>
                <h3 className="font-headline font-bold text-lg text-on-surface">
                  Volatility Heatmap
                </h3>
              </div>
              <p className="text-xs text-on-surface-variant mb-4">
                Each cell = one vault. Color = absolute APY drift magnitude.
              </p>
              <div className="flex gap-2 flex-wrap mb-4">
                {[
                  { color: '#dcfce7', label: 'Stable' },
                  { color: '#fef9c3', label: 'Moderate' },
                  { color: '#fed7aa', label: 'Drifting' },
                  { color: '#fecdd3', label: 'Volatile' },
                ].map(({ color, label }) => (
                  <div key={label} className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: color }} />
                    <span className="text-[10px] text-on-surface-variant">{label}</span>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-6 gap-1.5">
                {heatmapVaults.length === 0 ? (
                  <p className="col-span-6 text-xs text-on-surface-variant text-center py-4">
                    No multi-timeframe data available
                  </p>
                ) : (
                  heatmapVaults.map((vault, i) => {
                    const drift = computeApyDrift(vault)
                    const colors = getVolatilityColor(drift)
                    return (
                      <div
                        key={i}
                        onClick={() => setSelectedVault(vault)}
                        className="aspect-square rounded-sm cursor-pointer hover:opacity-80 transition-opacity relative group"
                        style={{ backgroundColor: colors.bg }}
                        title={`${vault.name}: ${drift?.drift30d}% 30d drift`}
                      >
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span
                            className="text-[8px] font-black"
                            style={{ color: colors.text }}
                          >
                            {Math.abs(Number(drift?.drift30d) || 0).toFixed(0)}
                          </span>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>

            {/* Quick Stats */}
            <div className="bg-surface-container-lowest p-6 rounded-xl clinical-shadow space-y-4">
              <h3 className="font-headline font-bold text-lg text-on-surface">Market Overview</h3>
              {(() => {
                const withDrift = vaults.filter((v) => computeApyDrift(v))
                const avgDrift = withDrift.length
                  ? withDrift.reduce(
                      (s, v) => s + (computeApyDrift(v)?.absoluteDrift || 0),
                      0
                    ) / withDrift.length
                  : 0
                const stable = withDrift.filter(
                  (v) => (computeApyDrift(v)?.absoluteDrift || 0) < 0.01
                ).length
                const volatile = withDrift.filter(
                  (v) => (computeApyDrift(v)?.absoluteDrift || 0) > 0.05
                ).length
                return (
                  <>
                    <StatRow
                      label="Avg Drift (all vaults)"
                      value={`${(avgDrift * 100).toFixed(2)}%`}
                    />
                    <StatRow
                      label="Stable vaults (<1% drift)"
                      value={`${stable}`}
                      positive
                    />
                    <StatRow
                      label="Volatile vaults (>5% drift)"
                      value={`${volatile}`}
                      negative={volatile > 0}
                    />
                    <StatRow label="Vaults monitored" value={`${withDrift.length}`} />
                  </>
                )
              })()}
            </div>
          </section>
        </div>
      )}
    </AppShell>
  )
}

function DriftMetric({ label, value, isActive, isPositive }) {
  return (
    <div
      className={`p-4 rounded-xl transition-all ${
        isActive ? 'bg-primary-container' : 'bg-surface-container-low'
      }`}
    >
      <p
        className={`text-[10px] uppercase tracking-widest font-bold mb-1 ${
          isActive ? 'text-on-primary-container' : 'text-on-surface-variant'
        }`}
      >
        {label}
      </p>
      <p
        className={`text-2xl font-headline font-black ${
          isActive ? 'text-white' : isPositive ? 'text-on-tertiary-container' : 'text-on-error-container'
        }`}
      >
        {value}
      </p>
    </div>
  )
}

function ApyTimeline({ vault }) {
  const { apy, apy1d, apy7d, apy30d } = vault.analytics
  const points = [
    { label: '30d avg', value: apy30d },
    { label: '7d avg', value: apy7d },
    { label: '1d avg', value: apy1d },
    { label: 'Now', value: apy?.total },
  ].filter((p) => p.value != null)

  if (points.length < 2) return null

  const maxVal = Math.max(...points.map((p) => p.value))
  const minVal = Math.min(...points.map((p) => p.value))
  const range = maxVal - minVal || 0.001

  return (
    <div className="relative h-24 flex items-end gap-2">
      {points.map(({ label, value }, i) => {
        const height = Math.max(10, Math.round(((value - minVal) / range) * 80) + 10)
        const isLast = i === points.length - 1
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-1">
            <span className="text-[9px] font-bold text-on-surface-variant">
              {(value * 100).toFixed(1)}%
            </span>
            <div
              className="w-full rounded-t-sm transition-all duration-300"
              style={{
                height: `${height}px`,
                backgroundColor: isLast ? '#131b2e' : '#eceef0',
              }}
            />
            <span className="text-[9px] text-on-surface-variant">{label}</span>
          </div>
        )
      })}
    </div>
  )
}

function StatRow({ label, value, positive, negative }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-sm text-on-surface-variant">{label}</span>
      <span
        className={`font-bold text-sm ${
          positive
            ? 'text-on-tertiary-container'
            : negative
            ? 'text-on-error-container'
            : 'text-on-surface'
        }`}
      >
        {value}
      </span>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-8 w-64 bg-surface-container rounded" />
      <div className="grid grid-cols-12 gap-8 mt-6">
        <div className="col-span-8 space-y-4">
          <div className="h-64 bg-surface-container rounded-xl" />
          <div className="h-96 bg-surface-container rounded-xl" />
        </div>
        <div className="col-span-4 space-y-4">
          <div className="h-64 bg-surface-container rounded-xl" />
          <div className="h-48 bg-surface-container rounded-xl" />
        </div>
      </div>
    </div>
  )
}