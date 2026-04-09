import { useState, useEffect } from 'react'
import { useAccount, useChainId } from 'wagmi'
import { useConnectModal } from '@rainbow-me/rainbowkit'
import HomePage from './HomePage'
import { getVaults, getPortfolioPositions } from './services/earnApi'
import { getDiagnosis } from './services/aiDiagnosis'
import { computeStabilityScore, getHealthTag, getRiskFilters } from './utils/stability'
import { executeDeposit } from './services/executeDeposit'

export default function App() {
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const { openConnectModal } = useConnectModal()

  const [showDashboard, setShowDashboard] = useState(false)
  const [riskMode, setRiskMode] = useState(null)
  const [positions, setPositions] = useState([])
  const [vaults, setVaults] = useState([])
  const [diagnosis, setDiagnosis] = useState('')
  const [isNewUser, setIsNewUser] = useState(false)
  const [loading, setLoading] = useState(false)
  const [depositingVault, setDepositingVault] = useState(null)

  // When wallet connects, auto-show dashboard
  useEffect(() => {
    if (isConnected && showDashboard === false) {
      setShowDashboard(true)
    }
    if (!isConnected) {
      setShowDashboard(false)
      setRiskMode(null)
      setDiagnosis('')
    }
  }, [isConnected])

  // When risk mode is chosen, run the diagnosis
  useEffect(() => {
    if (isConnected && address && riskMode) {
      runDiagnosis()
    }
  }, [riskMode])

  async function runDiagnosis() {
    setLoading(true)
    setDiagnosis('')
    try {
      const userPositions = await getPortfolioPositions(address)
      const hasPositions = userPositions && userPositions.length > 0
      setIsNewUser(!hasPositions)
      setPositions(userPositions || [])

      const filters = getRiskFilters(riskMode)
      const availableVaults = await getVaults({ chainId, sortBy: 'apy', ...filters })
      const depositable = availableVaults.filter((v) => v.isTransactional)
      setVaults(depositable)

      const aiText = await getDiagnosis({
        positions: userPositions,
        availableVaults: depositable,
        riskMode,
        isNewUser: !hasPositions,
      })
      setDiagnosis(aiText)
    } catch (err) {
      setDiagnosis('Could not load diagnosis. Please try again.')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  async function handleDeposit(vault) {
    setDepositingVault(vault.address)
    try {
      const fromToken = vault.underlyingTokens[0]
      await executeDeposit({ vault, fromToken, fromAmount: '1000000', userAddress: address })
      alert('Deposit successful! Refreshing...')
      runDiagnosis()
    } catch (err) {
      alert(`Deposit failed: ${err.message}`)
    } finally {
      setDepositingVault(null)
    }
  }

  function stabilityBarWidth(vault) {
    const score = computeStabilityScore(vault)
    return score === null ? 50 : Math.round(score * 100)
  }

  // ── SCREEN 1: Homepage (not connected or not yet showing dashboard)
  if (!showDashboard) {
    return <HomePage onConnected={() => setShowDashboard(true)} />
  }

  // ── SCREEN 2: Risk mode picker (connected, no risk mode chosen yet)
  if (!riskMode) {
    return (
      <div style={{ maxWidth: 600, margin: '0 auto', padding: '4rem 2rem', textAlign: 'center', fontFamily: 'Manrope, sans-serif' }}>
        <h2 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '0.5rem' }}>What's your risk preference?</h2>
        <p style={{ color: '#64748b', marginBottom: '2rem' }}>This filters which vaults we recommend for your diagnosis.</p>
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
          {[
            { key: 'safe', label: '🛡️ Safe', desc: 'Stablecoins, high TVL' },
            { key: 'balanced', label: '🩺 Balanced', desc: 'Any token, moderate risk' },
            { key: 'degen', label: '⚡ Degen', desc: 'Highest APY, no filter' },
          ].map((mode) => (
            <button
              key={mode.key}
              onClick={() => setRiskMode(mode.key)}
              style={{
                padding: '1.25rem 1.5rem', fontSize: '1rem', cursor: 'pointer',
                borderRadius: 16, border: '2px solid #e2e8f0', background: 'white',
                fontFamily: 'Manrope, sans-serif', fontWeight: 700, minWidth: 140,
                transition: 'all 0.2s',
              }}
              onMouseEnter={e => e.target.style.borderColor = '#10b981'}
              onMouseLeave={e => e.target.style.borderColor = '#e2e8f0'}
            >
              <div>{mode.label}</div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 500, marginTop: 4 }}>{mode.desc}</div>
            </button>
          ))}
        </div>
        <button
          onClick={() => { setShowDashboard(false) }}
          style={{ marginTop: '2rem', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '0.85rem' }}
        >
          ← Back to homepage
        </button>
      </div>
    )
  }

  // ── SCREEN 3: Loading
  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', fontFamily: 'Inter, sans-serif' }}>
        <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>🩺</div>
        <p style={{ fontSize: '1.1rem', color: '#64748b' }}>Running your yield diagnosis...</p>
      </div>
    )
  }

  // ── SCREEN 4: Dashboard
  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '2rem', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '1.5rem' }}>🩺</span>
          <span style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 800, fontSize: '1.25rem' }}>Yield Doctor</span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
            {address?.slice(0,6)}...{address?.slice(-4)} · {riskMode}
          </span>
          <button
            onClick={() => { setRiskMode(null); setDiagnosis('') }}
            style={{ padding: '6px 14px', borderRadius: 20, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', fontSize: '0.8rem' }}
          >
            Change risk mode
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>

        {/* Left: Positions */}
        <div>
          <h3 style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 800, marginBottom: '1rem' }}>
            {isNewUser ? 'Your Idle Assets' : 'Your Current Positions'}
          </h3>
          {isNewUser && (
            <div style={{ padding: '1.5rem', background: '#f8fafc', borderRadius: 12, color: '#64748b' }}>
              <p style={{ margin: 0 }}>⚪ No vault positions found.</p>
              <p style={{ margin: '0.5rem 0 0', fontSize: '0.9rem' }}>Check recommendations on the right to get started.</p>
            </div>
          )}
          {!isNewUser && positions.map((pos, i) => {
            const matchingVault = vaults.find(v => v.underlyingTokens?.[0]?.symbol === pos.asset.symbol)
            const score = matchingVault ? computeStabilityScore(matchingVault) : null
            const bestApy = vaults[0]?.analytics?.apy?.total || 0
            const currentApy = matchingVault?.analytics?.apy?.total || 0
            const tag = getHealthTag(score, currentApy, bestApy)
            return (
              <div key={i} style={{ padding: '1rem', background: 'white', border: '1px solid #f1f5f9', borderRadius: 12, marginBottom: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <strong>{pos.asset.symbol}</strong>
                  <span style={{ color: tag.color, fontWeight: 700, fontSize: '0.85rem' }}>{tag.label}</span>
                </div>
                <div style={{ fontSize: '0.85rem', color: '#64748b' }}>{pos.protocolName} · ${pos.balanceUsd}</div>
                {matchingVault && (
                  <>
                    <div style={{ fontSize: '0.85rem', marginTop: 4 }}>APY: {(matchingVault.analytics.apy.total * 100).toFixed(2)}%</div>
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: 4 }}>Stability</div>
                      <div style={{ background: '#f1f5f9', borderRadius: 4, height: 8 }}>
                        <div style={{ width: `${stabilityBarWidth(matchingVault)}%`, background: tag.color, height: '100%', borderRadius: 4, transition: 'width 0.5s ease' }} />
                      </div>
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>

        {/* Right: AI Diagnosis + Vaults */}
        <div>
          <h3 style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 800, marginBottom: '1rem' }}>🤖 AI Diagnosis</h3>
          <div style={{ padding: '1rem', background: '#f0fdf4', borderRadius: 12, marginBottom: '1.5rem', lineHeight: 1.7, fontSize: '0.95rem', border: '1px solid #bbf7d0' }}>
            {diagnosis || 'No diagnosis available.'}
          </div>

          <h3 style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 800, marginBottom: '1rem' }}>Recommended Vaults</h3>
          {vaults.slice(0, 5).map((vault, i) => {
            const score = computeStabilityScore(vault)
            const apy = vault.analytics.apy.total != null ? (vault.analytics.apy.total * 100).toFixed(2) + '%' : 'N/A'
            const apy30d = vault.analytics.apy30d != null ? (vault.analytics.apy30d * 100).toFixed(2) + '%' : 'N/A'
            return (
              <div key={i} style={{ padding: '1rem', background: 'white', border: '1px solid #f1f5f9', borderRadius: 12, marginBottom: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                  <strong style={{ fontSize: '0.9rem' }}>{vault.name}</strong>
                  <span style={{ fontWeight: 700, color: '#10b981' }}>{apy}</span>
                </div>
                <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: 6 }}>
                  {vault.protocol.name} · {vault.network} · 30d avg: {apy30d} · TVL: ${Number(vault.analytics.tvl.usd).toLocaleString()}
                </div>
                {score !== null && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: 4 }}>Stability: {Math.round(score * 100)}%</div>
                    <div style={{ background: '#f1f5f9', borderRadius: 4, height: 8 }}>
                      <div style={{
                        width: `${Math.round(score * 100)}%`,
                        background: score > 0.7 ? '#22c55e' : score > 0.4 ? '#f59e0b' : '#ef4444',
                        height: '100%', borderRadius: 4,
                      }} />
                    </div>
                  </div>
                )}
                <button
                  onClick={() => handleDeposit(vault)}
                  disabled={depositingVault === vault.address}
                  style={{
                    width: '100%', padding: '0.5rem', background: depositingVault === vault.address ? '#94a3b8' : '#0f172a',
                    color: 'white', border: 'none', borderRadius: 8, cursor: depositingVault === vault.address ? 'not-allowed' : 'pointer',
                    fontWeight: 700, fontSize: '0.9rem',
                  }}
                >
                  {depositingVault === vault.address ? 'Depositing...' : 'Deposit'}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}