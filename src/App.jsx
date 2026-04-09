import { useState, useEffect } from 'react'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount, useChainId } from 'wagmi'
import { getVaults, getPortfolioPositions } from './services/earnApi'
import { getDiagnosis } from './services/aiDiagnosis'
import { computeStabilityScore, getHealthTag, getRiskFilters } from './utils/stability'
import { executeDeposit } from './services/executeDeposit'

export default function App() {
  const { address, isConnected } = useAccount()
  const chainId = useChainId()

  const [riskMode, setRiskMode] = useState(null) // 'safe' | 'balanced' | 'degen'
  const [positions, setPositions] = useState([])
  const [vaults, setVaults] = useState([])
  const [diagnosis, setDiagnosis] = useState('')
  const [isNewUser, setIsNewUser] = useState(false)
  const [loading, setLoading] = useState(false)
  const [depositingVault, setDepositingVault] = useState(null)

  // Once wallet is connected and risk mode is chosen, run the diagnosis
  useEffect(() => {
    if (isConnected && address && riskMode) {
      runDiagnosis()
    }
  }, [isConnected, address, riskMode])

  async function runDiagnosis() {
    setLoading(true)
    setDiagnosis('')

    try {
      // Fetch portfolio positions
      const userPositions = await getPortfolioPositions(address)
      const hasPositions = userPositions && userPositions.length > 0
      setIsNewUser(!hasPositions)
      setPositions(userPositions || [])

      // Fetch available vaults based on risk mode
      const filters = getRiskFilters(riskMode)
      const availableVaults = await getVaults({
        chainId,
        sortBy: 'apy',
        ...filters,
      })

      // Filter for only depositable vaults
      const depositable = availableVaults.filter((v) => v.isTransactional)
      setVaults(depositable)

      // Get AI diagnosis
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
      // For demo: deposit 1 USDC (6 decimals = 1000000)
      // In production you'd show an amount input
      const fromToken = vault.underlyingTokens[0]
      await executeDeposit({
        vault,
        fromToken,
        fromAmount: '1000000', // 1 USDC
        userAddress: address,
      })
      alert('Deposit successful! Refreshing positions...')
      runDiagnosis()
    } catch (err) {
      alert(`Deposit failed: ${err.message}`)
    } finally {
      setDepositingVault(null)
    }
  }

  // Stability bar width as percentage
  function stabilityBarWidth(vault) {
    const score = computeStabilityScore(vault)
    if (score === null) return 50
    return Math.round(score * 100)
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '2rem', fontFamily: 'sans-serif' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1>🩺 Yield Doctor</h1>
        <ConnectButton />
      </div>

      {/* Step 1: Not connected */}
      {!isConnected && (
        <div style={{ textAlign: 'center', padding: '4rem' }}>
          <h2>Connect your wallet to get your yield diagnosis</h2>
          <p>We'll check your positions, score their stability, and find better opportunities — automatically.</p>
        </div>
      )}

      {/* Step 2: Connected, pick risk mode */}
      {isConnected && !riskMode && (
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <h2>What's your risk preference?</h2>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '1rem' }}>
            {['safe', 'balanced', 'degen'].map((mode) => (
              <button
                key={mode}
                onClick={() => setRiskMode(mode)}
                style={{
                  padding: '1rem 2rem',
                  fontSize: '1.1rem',
                  cursor: 'pointer',
                  borderRadius: 8,
                  border: '2px solid #333',
                  background: 'white',
                }}
              >
                {mode === 'safe' ? '🛡️ Safe' : mode === 'balanced' ? '🩺 Balanced' : '⚡ Degen'}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 3: Loading */}
      {isConnected && riskMode && loading && (
        <div style={{ textAlign: 'center', padding: '3rem' }}>
          <p>Running your yield diagnosis...</p>
        </div>
      )}

      {/* Step 4: Results */}
      {isConnected && riskMode && !loading && diagnosis && (
        <div>
          {/* Change risk mode */}
          <div style={{ marginBottom: '1rem' }}>
            <span>Risk mode: <strong>{riskMode}</strong> </span>
            <button onClick={() => { setRiskMode(null); setDiagnosis('') }} style={{ marginLeft: 8 }}>
              Change
            </button>
          </div>

          {/* Two-column layout */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>

            {/* Left Panel: Positions or Idle Assets */}
            <div>
              <h3>{isNewUser ? 'Your Idle Assets' : 'Your Current Positions'}</h3>

              {isNewUser && (
                <div style={{ padding: '1rem', background: '#f9f9f9', borderRadius: 8 }}>
                  <p>⚪ No vault positions found on this wallet.</p>
                  <p>Check the recommendations on the right to get started.</p>
                </div>
              )}

              {!isNewUser && positions.map((pos, i) => {
                // Find matching vault for stability score
                const matchingVault = vaults.find(
                  (v) => v.underlyingTokens?.[0]?.symbol === pos.asset.symbol
                )
                const score = matchingVault ? computeStabilityScore(matchingVault) : null
                const bestApy = vaults[0]?.analytics?.apy?.total || 0
                const currentApy = matchingVault?.analytics?.apy?.total || 0
                const tag = getHealthTag(score, currentApy, bestApy)

                return (
                  <div key={i} style={{ padding: '1rem', border: '1px solid #eee', borderRadius: 8, marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <strong>{pos.asset.symbol}</strong>
                      <span style={{ color: tag.color, fontWeight: 'bold' }}>{tag.label}</span>
                    </div>
                    <div>Protocol: {pos.protocolName}</div>
                    <div>Balance: ${pos.balanceUsd}</div>
                    {matchingVault && (
                      <>
                        <div>APY: {(matchingVault.analytics.apy.total * 100).toFixed(2)}%</div>
                        {/* Stability Bar */}
                        <div style={{ marginTop: 8 }}>
                          <small>Stability</small>
                          <div style={{ background: '#eee', borderRadius: 4, height: 8, marginTop: 4 }}>
                            <div style={{
                              width: `${stabilityBarWidth(matchingVault)}%`,
                              background: tag.color,
                              height: '100%',
                              borderRadius: 4,
                              transition: 'width 0.5s ease'
                            }} />
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Right Panel: AI Diagnosis + Recommendations */}
            <div>
              <h3>🤖 AI Diagnosis</h3>
              <div style={{ padding: '1rem', background: '#f0fdf4', borderRadius: 8, marginBottom: '1.5rem', lineHeight: 1.6 }}>
                {diagnosis}
              </div>

              <h3>Recommended Vaults</h3>
              {vaults.slice(0, 5).map((vault, i) => {
                const score = computeStabilityScore(vault)
                const apy = vault.analytics.apy.total != null
                  ? (vault.analytics.apy.total * 100).toFixed(2) + '%'
                  : 'N/A'
                const apy30d = vault.analytics.apy30d != null
                  ? (vault.analytics.apy30d * 100).toFixed(2) + '%'
                  : 'N/A'

                return (
                  <div key={i} style={{ padding: '1rem', border: '1px solid #eee', borderRadius: 8, marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <strong>{vault.name}</strong>
                      <span>{apy} APY</span>
                    </div>
                    <div style={{ color: '#666', fontSize: '0.9rem' }}>
                      {vault.protocol.name} · {vault.network}
                    </div>
                    <div style={{ fontSize: '0.85rem', marginTop: 4 }}>
                      30d avg: {apy30d} · TVL: ${Number(vault.analytics.tvl.usd).toLocaleString()}
                    </div>

                    {/* Stability Bar */}
                    {score !== null && (
                      <div style={{ marginTop: 8 }}>
                        <small>Stability: {Math.round(score * 100)}%</small>
                        <div style={{ background: '#eee', borderRadius: 4, height: 8, marginTop: 4 }}>
                          <div style={{
                            width: `${Math.round(score * 100)}%`,
                            background: score > 0.7 ? '#22c55e' : score > 0.4 ? '#f59e0b' : '#ef4444',
                            height: '100%',
                            borderRadius: 4,
                          }} />
                        </div>
                      </div>
                    )}

                    <button
                      onClick={() => handleDeposit(vault)}
                      disabled={depositingVault === vault.address}
                      style={{
                        marginTop: 12,
                        width: '100%',
                        padding: '0.5rem',
                        background: '#16a34a',
                        color: 'white',
                        border: 'none',
                        borderRadius: 6,
                        cursor: 'pointer',
                        fontWeight: 'bold',
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
      )}
    </div>
  )
}