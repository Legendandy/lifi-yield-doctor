// Compute a stability score (0 to 1) from the vault's APY history.
// 0 = very volatile, 1 = rock-solid
// Based on: apy1d, apy7d, apy30d, apy.total from the NormalizedVault schema

export function computeStabilityScore(vault) {
  const { apy, apy1d, apy7d, apy30d } = vault.analytics

  // If any rolling data is missing, we can't score — return null
  if (apy1d == null || apy7d == null || apy30d == null || apy.total == null) {
    return null
  }

  const current = apy.total

  // Sum of absolute drifts across timeframes
  const drift =
    Math.abs(current - apy30d) +
    Math.abs(apy7d - apy30d) +
    Math.abs(apy1d - apy7d)

  // Normalize: cap drift at 0.05 (5 percentage points) as "max volatile"
  const maxDrift = 0.05
  const normalized = Math.min(drift / maxDrift, 1)

  return parseFloat((1 - normalized).toFixed(2)) // 0 to 1
}

// Returns a label and color for the health tag
export function getHealthTag(stabilityScore, currentApy, bestAvailableApy) {
  if (stabilityScore === null) return { label: 'Unknown', color: 'gray' }

  const isUnderperforming = bestAvailableApy > currentApy * 1.2 // 20% better exists
  if (isUnderperforming) return { label: '🔴 Underperforming', color: '#ef4444' }
  if (stabilityScore < 0.5) return { label: '🟡 Drifting', color: '#f59e0b' }
  return { label: '🟢 Healthy', color: '#22c55e' }
}

// Risk tier filtering logic — maps directly to API query params
export function getRiskFilters(riskMode) {
  switch (riskMode) {
    case 'safe':
      return { minTvlUsd: 1000000, asset: 'USDC' } // stablecoins, high TVL
    case 'balanced':
      return { minTvlUsd: 500000 }
    case 'degen':
      return { minTvlUsd: 0, sortBy: 'apy' } // pure highest APY
    default:
      return { minTvlUsd: 500000 }
  }
}