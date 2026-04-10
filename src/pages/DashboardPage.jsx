// src/pages/DashboardPage.jsx
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAccount } from 'wagmi'
import AppShell from '../components/AppShell'
import { getPortfolioPositions, getVaults } from '../services/earnApi'
import { getDiagnosis } from '../services/aiDiagnosis'

// Health label based on APY competitiveness vs top vault
function getHealthTag(currentApy, bestAvailableApy) {
  if (currentApy == null || bestAvailableApy == null) return { label: 'Unknown', color: '#76777d' }
  const isUnderperforming = bestAvailableApy > currentApy * 1.2
  if (isUnderperforming) return { label: '🔴 Underperforming', color: '#ef4444' }
  return { label: '🟢 Healthy', color: '#22c55e' }
}

export default function DashboardPage() {
  const { address } = useAccount()
  const navigate = useNavigate()
  const [positions, setPositions] = useState([])
  const [vaults, setVaults] = useState([])
  const [diagnosis, setDiagnosis] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [hasPositions, setHasPositions] = useState(false)

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

      // Fetch safe, high-quality vaults — sanity filter handles bad data
      const topVaults = await getVaults({
        sortBy: 'apy',
        minTvlUsd: 500_000,
        limit: 10,
      })
      setVaults(topVaults)

      const aiText = await getDiagnosis({
        positions: userPositions || [],
        availableVaults: topVaults,
        isNewUser: !hasAny,
      })
      setDiagnosis(aiText)
    } catch (err) {
      console.error('Dashboard load error:', err)
      setError(err.message)
      setDiagnosis('Unable to load diagnosis. Check your API key and network.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AppShell>
      <header className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-3xl font-headline font-extrabold tracking-tight text-on-surface">
            Your Positions
          </h1>
          <p className="text-on-surface-variant font-medium mt-1">
            Real-time clinical monitoring of active vaults.
          </p>
        </div>
        {!loading && !error && (
          <span className="px-3 py-1 bg-surface-container-high rounded-full text-[10px] font-bold uppercase tracking-wider text-on-secondary-container">
            {positions.length} Active Vault{positions.length !== 1 ? 's' : ''}
          </span>
        )}
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
          {/* LEFT: Active Vaults */}
          <section className="col-span-12 lg:col-span-7 space-y-4">
            {!hasPositions ? (
              <NoPositionsState onGoToVaults={() => navigate('/vaults')} />
            ) : (
              positions.map((pos, i) => (
                <PositionCard key={i} position={pos} allVaults={vaults} />
              ))
            )}
          </section>

          {/* RIGHT: Yield Health Report */}
          <section className="col-span-12 lg:col-span-5 space-y-6">
            <DiagnosisSummary diagnosis={diagnosis} loading={loading} />
            {hasPositions && vaults.length > 0 && (
              <AlternativesTable vaults={vaults} />
            )}
          </section>
        </div>
      )}
    </AppShell>
  )
}

function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-12 gap-8 animate-pulse">
      <div className="col-span-7 space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-40 bg-surface-container rounded-xl" />
        ))}
      </div>
      <div className="col-span-5 space-y-4">
        <div className="h-48 bg-surface-container rounded-xl" />
        <div className="h-64 bg-surface-container rounded-xl" />
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
        You don't have any positions yet. See the Doctor's vault recommendations to get started.
      </p>
      <button
        onClick={onGoToVaults}
        className="px-6 py-3 bg-primary-container text-white rounded-full font-bold text-sm hover:opacity-90 transition-all"
      >
        Deposit in a Vault
      </button>
    </div>
  )
}

function PositionCard({ position, allVaults }) {
  const matchingVault = allVaults.find((v) =>
    v.underlyingTokens?.some((t) => t.symbol === position.asset?.symbol)
  )
  const bestApy = allVaults[0]?.analytics?.apy?.total ?? 0
  const currentApy = matchingVault?.analytics?.apy?.total ?? null
  const tag = getHealthTag(currentApy, bestApy)

  const apyDisplay = currentApy != null
    ? `${(currentApy * 100).toFixed(2)}%`
    : 'N/A'

  return (
    <div className="bg-surface-container-lowest p-6 rounded-xl clinical-shadow hover:bg-surface-container-low transition-colors">
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center">
            <span className="material-symbols-outlined text-on-surface-variant">toll</span>
          </div>
          <div>
            <h3 className="font-headline font-bold text-lg text-on-surface">
              {position.asset?.symbol || 'Unknown'} Vault
            </h3>
            <p className="text-xs text-on-surface-variant font-medium">
              {position.protocolName} · Chain {position.chainId}
            </p>
          </div>
        </div>
        <div className="text-right">
          <span className="block text-2xl font-headline font-black text-on-surface">{apyDisplay}</span>
          <span className="text-[10px] uppercase tracking-tighter font-bold text-on-surface-variant">Current APY</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div>
          <span className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant block mb-1">Balance</span>
          <span className="text-lg font-bold text-on-surface">
            ${Number(position.balanceUsd || 0).toLocaleString()}
          </span>
        </div>
        <div>
          <span className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant block mb-1">Health</span>
          <span className="text-sm font-bold" style={{ color: tag.color }}>{tag.label}</span>
        </div>
      </div>
    </div>
  )
}

function DiagnosisSummary({ diagnosis, loading }) {
  return (
    <div className="bg-primary-container p-6 rounded-xl space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center">
          <span className="material-symbols-outlined text-tertiary-fixed text-[18px]">psychology</span>
        </div>
        <div>
          <h3 className="font-headline font-bold text-white">Diagnosis Summary</h3>
          <p className="text-[10px] uppercase tracking-widest text-on-primary-container">AI Health Report</p>
        </div>
      </div>
      <div className="text-sm text-slate-300 leading-relaxed">
        {loading ? (
          <div className="space-y-2 animate-pulse">
            <div className="h-3 bg-white/10 rounded w-full" />
            <div className="h-3 bg-white/10 rounded w-4/5" />
            <div className="h-3 bg-white/10 rounded w-3/5" />
          </div>
        ) : (
          diagnosis || 'No diagnosis available.'
        )}
      </div>
    </div>
  )
}

function AlternativesTable({ vaults }) {
  return (
    <div className="bg-surface-container-lowest rounded-xl clinical-shadow">
      <div className="p-4 border-b border-surface-container">
        <h3 className="font-headline font-bold text-on-surface">Recommended Vaults</h3>
        <p className="text-xs text-on-surface-variant">Highest verified APY · TVL &gt; $500k</p>
      </div>
      <div className="divide-y divide-surface-container">
        {vaults.slice(0, 5).map((vault, i) => {
          const apy = vault.analytics.apy.total != null
            ? `${(vault.analytics.apy.total * 100).toFixed(2)}%`
            : 'N/A'
          return (
            <div key={i} className="p-4 flex justify-between items-center hover:bg-surface-container-low transition-colors">
              <div>
                <p className="font-bold text-sm text-on-surface">{vault.name}</p>
                <p className="text-xs text-on-surface-variant">
                  {vault.protocol.name} · TVL ${(Number(vault.analytics.tvl.usd) / 1e6).toFixed(1)}M
                </p>
              </div>
              <span className="font-bold text-on-tertiary-container">{apy}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}