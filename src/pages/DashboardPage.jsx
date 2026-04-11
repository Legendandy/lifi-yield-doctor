// src/pages/DashboardPage.jsx
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAccount } from 'wagmi'
import AppShell from '../components/AppShell'
import DepositModal from '../components/DepositModal'
import WithdrawModal from '../components/WithdrawModal'
import { getPortfolioPositions, getVaults, getBestVaultAcrossAllChains } from '../services/earnApi'
import { getDiagnosis } from '../services/aiDiagnosis'
import { getCacheExpiresIn, CACHE_KEYS } from '../services/vaultCache'
import { SUPPORTED_CHAINS } from '../services/tokenBalances'

const CHAIN_NAMES = Object.fromEntries(SUPPORTED_CHAINS.map(c => [c.id, c.name]))
function getChainName(chainId) {
  if (!chainId) return 'Unknown'
  return CHAIN_NAMES[chainId] ?? `Chain ${chainId}`
}

function getHealthTag(currentApy, bestAvailableApy) {
  if (currentApy == null || bestAvailableApy == null) return { label: 'Unknown', color: '#76777d' }
  const isUnderperforming = bestAvailableApy > currentApy * 1.2
  if (isUnderperforming) return { label: '🔴 Underperforming', color: '#ef4444' }
  return { label: '🟢 Healthy', color: '#22c55e' }
}

function formatTimeRemaining(ms) {
  if (!ms || ms <= 0) return null
  const mins = Math.floor(ms / 60000)
  const secs = Math.floor((ms % 60000) / 1000)
  if (mins > 0) return `${mins}m ${secs}s`
  return `${secs}s`
}

export default function DashboardPage() {
  const { address } = useAccount()
  const navigate = useNavigate()
  const [positions, setPositions] = useState([])
  const [vaults, setVaults] = useState([])
  const [bestCrossChain, setBestCrossChain] = useState(null)
  const [diagnosis, setDiagnosis] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [hasPositions, setHasPositions] = useState(false)
  const [cacheExpiresIn, setCacheExpiresIn] = useState(null)
  const [depositModal, setDepositModal] = useState(null)
  const [withdrawModal, setWithdrawModal] = useState(null)

  useEffect(() => {
    if (!address) return
    loadData()
  }, [address])

  useEffect(() => {
    const interval = setInterval(() => {
      const remaining = getCacheExpiresIn(CACHE_KEYS.allChainsBest)
      setCacheExpiresIn(remaining)
    }, 10000)
    return () => clearInterval(interval)
  }, [])

  async function loadData() {
    setLoading(true)
    setError(null)
    try {
      const [userPositions, topVaults, bestVault] = await Promise.all([
        getPortfolioPositions(address),  // now enriched with apy, apy30d, balanceNative
        getVaults({ sortBy: 'apy', minTvlUsd: 500_000, limit: 10 }),
        getBestVaultAcrossAllChains(),
      ])

      const hasAny = userPositions && userPositions.length > 0
      setHasPositions(hasAny)
      setPositions(userPositions || [])
      setVaults(topVaults)
      setBestCrossChain(bestVault)

      const remaining = getCacheExpiresIn(CACHE_KEYS.allChainsBest)
      setCacheExpiresIn(remaining)

      const aiText = await getDiagnosis({
        positions: userPositions || [],
        availableVaults: topVaults,
        isNewUser: !hasAny,
        bestCrossChainVault: bestVault,
      })
      setDiagnosis(aiText)
    } catch (err) {
      console.error('Dashboard load error:', err)
      setError(err.message)
      setDiagnosis('Unable to load diagnosis.')
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
        <div className="flex items-center gap-3">
          {cacheExpiresIn != null && (
            <span className="text-[10px] text-on-surface-variant font-medium">
              Data refreshes in {formatTimeRemaining(cacheExpiresIn)}
            </span>
          )}
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
              positions.map((pos, i) => (
                <PositionCard
                  key={i}
                  position={pos}
                  bestApy={vaults[0]?.analytics?.apy?.total ?? 0}
                  onDeposit={(vault) => setDepositModal(vault)}
                  onWithdraw={(vault, position) => setWithdrawModal({ vault, position })}
                />
              ))
            )}
          </section>

          <section className="col-span-12 lg:col-span-5 space-y-6">
            <DiagnosisSummary diagnosis={diagnosis} loading={loading} />
            {bestCrossChain && (
              <BestCrossChainCard
                vault={bestCrossChain}
                onDeposit={() => setDepositModal(bestCrossChain)}
              />
            )}
            {hasPositions && vaults.length > 0 && (
              <AlternativesTable
                vaults={vaults}
                onDeposit={(vault) => setDepositModal(vault)}
              />
            )}
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
        <div className="h-48 bg-surface-container rounded-xl" />
        <div className="h-32 bg-surface-container rounded-xl" />
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

function PositionCard({ position, bestApy, onDeposit, onWithdraw }) {
  // After enrichment in earnApi.js, position now has:
  // - position.apy (from vault analytics)
  // - position.apy30d
  // - position.vaultName
  // - position.protocolName
  // - position.vaultAddress (= position.asset.address = vault LP token)
  // - position.underlyingTokens
  // - position.balanceNative (raw LP token string)
  // - position.balanceUsd
  // - position._vaultData (full vault object)

  const currentApy = position.apy
  const tag = getHealthTag(currentApy, bestApy)
  const apyDisplay = currentApy != null ? `${(currentApy * 100).toFixed(2)}%` : 'N/A'
  const chainName = getChainName(position.chainId)
  const protocolName = position.protocolName ?? 'Unknown'
  const vaultName = position.vaultName ?? `${position.asset?.symbol ?? 'Unknown'} Vault`

  // Build vault object for modals
  // Use _vaultData if available (most accurate), otherwise synthesize
  const vaultForModal = position._vaultData ?? {
    name: vaultName,
    protocol: { name: protocolName },
    network: chainName,
    chainId: position.chainId,
    address: position.vaultAddress ?? position.asset?.address ?? '',
    analytics: {
      apy: { total: currentApy },
      apy30d: position.apy30d ?? null,
      tvl: { usd: position.tvlUsd ?? 0 },
    },
    underlyingTokens: position.underlyingTokens ?? (position.asset ? [position.asset] : []),
  }

  return (
    <div className="bg-surface-container-lowest p-6 rounded-xl clinical-shadow hover:bg-surface-container-low transition-colors">
      <div className="flex justify-between items-start mb-4">
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
          <span className="block text-2xl font-headline font-black text-on-surface">{apyDisplay}</span>
          <span className="text-[10px] uppercase tracking-tighter font-bold text-on-surface-variant">Current APY</span>
        </div>
      </div>

      {/* APY breakdown if available */}
      {position.apy30d != null && (
        <div className="flex gap-4 mb-4 p-3 bg-surface-container rounded-xl">
          <div className="flex-1 text-center">
            <p className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant">1D APY</p>
            <p className="font-bold text-sm text-on-surface mt-0.5">
              {position.apy1d != null ? `${(position.apy1d * 100).toFixed(2)}%` : '—'}
            </p>
          </div>
          <div className="flex-1 text-center border-x border-surface-container-high">
            <p className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant">7D APY</p>
            <p className="font-bold text-sm text-on-surface mt-0.5">
              {position.apy7d != null ? `${(position.apy7d * 100).toFixed(2)}%` : '—'}
            </p>
          </div>
          <div className="flex-1 text-center">
            <p className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant">30D APY</p>
            <p className="font-bold text-sm text-on-tertiary-container mt-0.5">
              {`${(position.apy30d * 100).toFixed(2)}%`}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-6 mb-4">
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

      <div className="flex gap-2 pt-2 border-t border-surface-container">
        <button
          onClick={() => onDeposit(vaultForModal)}
          className="flex-1 py-2 rounded-xl text-xs font-black bg-primary-container text-white hover:opacity-90 transition-all flex items-center justify-center gap-1.5"
        >
          <span className="material-symbols-outlined text-[14px]">add_circle</span>
          Deposit More
        </button>
        <button
          onClick={() => onWithdraw(vaultForModal, position)}
          className="flex-1 py-2 rounded-xl text-xs font-black border-2 border-surface-container-high text-on-surface-variant hover:border-error hover:text-error transition-all flex items-center justify-center gap-1.5"
        >
          <span className="material-symbols-outlined text-[14px]">remove_circle</span>
          Withdraw
        </button>
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

function BestCrossChainCard({ vault, onDeposit }) {
  const apy = vault.analytics?.apy?.total != null
    ? `${(vault.analytics.apy.total * 100).toFixed(2)}%` : 'N/A'
  const chainName = vault._chainName ?? vault.network ?? getChainName(vault.chainId)
  const tvlM = Number(vault.analytics?.tvl?.usd ?? 0) >= 1_000_000
    ? `$${(Number(vault.analytics.tvl.usd) / 1e6).toFixed(1)}M`
    : `$${(Number(vault.analytics?.tvl?.usd ?? 0) / 1000).toFixed(0)}K`

  return (
    <div className="bg-tertiary-container/10 border border-on-tertiary-container/20 p-5 rounded-xl">
      <div className="flex items-center gap-2 mb-3">
        <span className="material-symbols-outlined text-on-tertiary-container text-[18px]">verified</span>
        <span className="text-[10px] font-black uppercase tracking-widest text-on-tertiary-container">
          Best Vault Across All Chains
        </span>
      </div>
      <div className="flex justify-between items-start mb-4">
        <div>
          <p className="font-headline font-bold text-on-surface text-base leading-tight">{vault.name}</p>
          <p className="text-xs text-on-surface-variant mt-0.5">
            {vault.protocol?.name} · {chainName} · TVL {tvlM}
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-headline font-black text-on-tertiary-container">{apy}</p>
          <p className="text-[10px] text-on-surface-variant font-bold uppercase">APY</p>
        </div>
      </div>
      <button
        onClick={onDeposit}
        className="w-full py-2 rounded-xl text-xs font-black bg-on-tertiary-container text-white hover:opacity-90 transition-all flex items-center justify-center gap-1.5"
      >
        <span className="material-symbols-outlined text-[14px]">add_circle</span>
        Deposit in This Vault
      </button>
    </div>
  )
}

function AlternativesTable({ vaults, onDeposit }) {
  return (
    <div className="bg-surface-container-lowest rounded-xl clinical-shadow">
      <div className="p-4 border-b border-surface-container">
        <h3 className="font-headline font-bold text-on-surface">Recommended Vaults</h3>
        <p className="text-xs text-on-surface-variant">Highest verified APY · TVL &gt; $500k</p>
      </div>
      <div className="divide-y divide-surface-container">
        {vaults.slice(0, 5).map((vault, i) => {
          const apy = vault.analytics.apy.total != null
            ? `${(vault.analytics.apy.total * 100).toFixed(2)}%` : 'N/A'
          return (
            <div key={i} className="p-4 flex justify-between items-center hover:bg-surface-container-low transition-colors">
              <div>
                <p className="font-bold text-sm text-on-surface">{vault.name}</p>
                <p className="text-xs text-on-surface-variant">
                  {vault.protocol.name} · TVL ${(Number(vault.analytics.tvl.usd) / 1e6).toFixed(1)}M
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-on-tertiary-container">{apy}</span>
                <button
                  onClick={() => onDeposit(vault)}
                  className="px-3 py-1 rounded-full text-[10px] font-black bg-primary-container/10 text-primary-container hover:bg-primary-container hover:text-white transition-all border border-primary-container/20"
                >
                  Deposit
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}