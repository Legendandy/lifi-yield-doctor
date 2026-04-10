// src/pages/VaultPage.jsx
import { useState, useEffect } from 'react'
import { useAccount } from 'wagmi'
import AppShell from '../components/AppShell'
import { getVaults } from '../services/earnApi'
import { computeStabilityScore } from '../utils/stability'
import { executeDeposit } from '../services/executeDeposit'

function computeUpgradeImpact(doctorsChoiceVault, allVaults, assumedBalanceUsd = 10000) {
  const apys = allVaults
    .map((v) => v.analytics?.apy?.total)
    .filter((a) => a != null)
    .sort((a, b) => a - b)

  if (!apys.length || !doctorsChoiceVault?.analytics?.apy?.total) return null

  const medianApy = apys[Math.floor(apys.length / 2)]
  const bestApy = doctorsChoiceVault.analytics.apy.total
  const annualGain = (bestApy - medianApy) * assumedBalanceUsd
  const stabilityScore = computeStabilityScore(doctorsChoiceVault)
  const medianStability = 0.5

  return {
    apyBoost: ((bestApy - medianApy) * 100).toFixed(2),
    annualGain: annualGain.toFixed(2),
    stabilityDelta:
      stabilityScore !== null
        ? ((stabilityScore - medianStability) * 100).toFixed(0)
        : null,
  }
}

export default function VaultPage() {
  const { address } = useAccount()
  const [vaults, setVaults] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [depositing, setDepositing] = useState(null)

  useEffect(() => {
    loadVaults()
  }, [])

  async function loadVaults() {
    setLoading(true)
    setError(null)
    try {
      const data = await getVaults({ sortBy: 'apy', minTvlUsd: 1000000, limit: 20 })
      setVaults(data)
    } catch (err) {
      console.error('VaultPage error:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function getDoctorsChoice(vaults) {
    if (!vaults.length) return null
    const maxApy = Math.max(...vaults.map((v) => v.analytics?.apy?.total || 0))
    return vaults.reduce((best, vault) => {
      const score = computeStabilityScore(vault) ?? 0
      const normalizedApy = maxApy > 0 ? (vault.analytics?.apy?.total || 0) / maxApy : 0
      const composite = score * 0.6 + normalizedApy * 0.4
      const bestScore = computeStabilityScore(best) ?? 0
      const bestNormApy = maxApy > 0 ? (best?.analytics?.apy?.total || 0) / maxApy : 0
      const bestComposite = bestScore * 0.6 + bestNormApy * 0.4
      return composite > bestComposite ? vault : best
    }, vaults[0])
  }

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
      <header className="mb-8">
        <h1 className="text-3xl font-headline font-extrabold tracking-tight text-on-surface">
          Vault Explorer
        </h1>
        <p className="text-on-surface-variant font-medium mt-1">
          AI-curated vault recommendations based on real APY stability data.
        </p>
      </header>

      {error && (
        <div className="mb-6 p-4 bg-error-container/30 border border-error-container rounded-xl text-on-error-container text-sm font-medium">
          <strong>Error loading vaults:</strong> {error}
          <button onClick={loadVaults} className="ml-4 underline hover:no-underline">
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
        <div className="grid grid-cols-12 gap-8">
          <section className="col-span-12 lg:col-span-5 space-y-6">
            {doctorsChoice && (
              <DoctorsChoiceCard
                vault={doctorsChoice}
                impact={upgradeImpact}
                onDeposit={() => handleDeposit(doctorsChoice)}
                isDepositing={depositing === doctorsChoice.address}
              />
            )}
          </section>

          <section className="col-span-12 lg:col-span-7">
            <SafestProtocolsTable
              vaults={vaults}
              onDeposit={handleDeposit}
              depositing={depositing}
            />
          </section>
        </div>
      )}
    </AppShell>
  )
}

function DoctorsChoiceCard({ vault, impact, onDeposit, isDepositing }) {
  const score = computeStabilityScore(vault)
  const apy =
    vault.analytics.apy.total != null
      ? (vault.analytics.apy.total * 100).toFixed(2)
      : 'N/A'
  const apy30d =
    vault.analytics.apy30d != null
      ? (vault.analytics.apy30d * 100).toFixed(2)
      : 'N/A'

  return (
    <div className="bg-primary-container p-8 rounded-xl text-white space-y-6">
      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined text-tertiary-fixed">verified</span>
        <span className="text-sm font-bold text-tertiary-fixed uppercase tracking-widest">
          Doctor's Choice
        </span>
      </div>
      <div>
        <h2 className="text-2xl font-headline font-bold">{vault.name}</h2>
        <p className="text-on-primary-container text-sm mt-1">
          {vault.protocol.name} · {vault.network}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Metric label="Current APY" value={`${apy}%`} highlight />
        <Metric label="30-Day Avg" value={apy30d !== 'N/A' ? `${apy30d}%` : 'N/A'} />
        <Metric
          label="Stability Score"
          value={score !== null ? `${Math.round(score * 100)}%` : 'N/A'}
        />
        <Metric
          label="TVL"
          value={`$${(Number(vault.analytics.tvl.usd) / 1e6).toFixed(1)}M`}
        />
      </div>

      {impact && (
        <div className="bg-white/10 rounded-lg p-4 space-y-2">
          <h3 className="font-headline font-bold text-white">Upgrade Impact</h3>
          <p className="text-sm text-slate-300 leading-relaxed">
            Switching to this vault gives you a{' '}
            <span className="text-tertiary-fixed font-bold">+{impact.apyBoost}% APY boost</span>{' '}
            vs the market median, projecting{' '}
            <span className="text-tertiary-fixed font-bold">+${impact.annualGain}/yr</span> on a
            $10,000 deposit.
            {impact.stabilityDelta !== null && (
              <> Stability is {impact.stabilityDelta}% above median.</>
            )}
          </p>
        </div>
      )}

      <button
        onClick={onDeposit}
        disabled={isDepositing}
        className="w-full py-3 bg-white text-primary-container rounded-full font-bold text-sm hover:bg-slate-100 transition-colors disabled:opacity-50"
      >
        {isDepositing ? 'Depositing...' : 'Deposit Here'}
      </button>
    </div>
  )
}

function Metric({ label, value, highlight }) {
  return (
    <div>
      <span className="text-[10px] uppercase tracking-widest font-bold text-on-primary-container block mb-0.5">
        {label}
      </span>
      <span
        className={`text-lg font-headline font-black ${
          highlight ? 'text-tertiary-fixed' : 'text-white'
        }`}
      >
        {value}
      </span>
    </div>
  )
}

function SafestProtocolsTable({ vaults, onDeposit, depositing }) {
  const sorted = [...vaults]
    .filter((v) => computeStabilityScore(v) !== null)
    .sort((a, b) => (computeStabilityScore(b) ?? 0) - (computeStabilityScore(a) ?? 0))

  return (
    <div className="bg-surface-container-lowest rounded-xl clinical-shadow">
      <div className="p-6 border-b border-surface-container">
        <h3 className="font-headline font-bold text-xl text-on-surface">
          Safest Protocols
        </h3>
        <p className="text-sm text-on-surface-variant mt-0.5">
          Ranked by stability score — drift across 1d/7d/30d APY
        </p>
      </div>
      <div className="divide-y divide-surface-container">
        {sorted.slice(0, 10).map((vault, i) => {
          const score = computeStabilityScore(vault)
          const apy =
            vault.analytics.apy.total != null
              ? `${(vault.analytics.apy.total * 100).toFixed(2)}%`
              : 'N/A'
          const tvlM = (Number(vault.analytics.tvl.usd) / 1e6).toFixed(1)

          return (
            <div
              key={i}
              className="p-4 flex items-center justify-between hover:bg-surface-container-low transition-colors"
            >
              <div className="flex items-center gap-4">
                <span className="text-2xl font-black text-on-surface-variant w-6">
                  {i + 1}
                </span>
                <div>
                  <p className="font-bold text-sm text-on-surface">{vault.name}</p>
                  <p className="text-xs text-on-surface-variant">
                    {vault.protocol.name} · {vault.network} · TVL ${tvlM}M
                  </p>
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="w-24 h-1.5 bg-surface-container rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.round((score ?? 0) * 100)}%`,
                          backgroundColor:
                            (score ?? 0) > 0.7
                              ? '#009844'
                              : (score ?? 0) > 0.4
                              ? '#f59e0b'
                              : '#ba1a1a',
                        }}
                      />
                    </div>
                    <span className="text-[10px] font-bold text-on-surface-variant">
                      {Math.round((score ?? 0) * 100)}%
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span className="font-bold text-on-tertiary-container">{apy}</span>
                <button
                  onClick={() => onDeposit(vault)}
                  disabled={depositing === vault.address}
                  className="px-4 py-2 bg-primary-container text-white rounded-full text-xs font-bold hover:opacity-90 transition-all disabled:opacity-50"
                >
                  {depositing === vault.address ? '...' : 'Deposit'}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-8 w-64 bg-surface-container rounded" />
      <div className="grid grid-cols-12 gap-8 mt-6">
        <div className="col-span-5 h-96 bg-surface-container rounded-xl" />
        <div className="col-span-7 h-96 bg-surface-container rounded-xl" />
      </div>
    </div>
  )
}