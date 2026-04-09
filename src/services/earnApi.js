const EARN_BASE_URL = 'https://earn.li.fi'
const API_KEY = import.meta.env.VITE_LIFI_API_KEY

const headers = {
  'x-lifi-api-key': API_KEY,
}

// Fetch vaults filtered by chainId, asset, and minTvlUsd
// sortBy: 'apy' or 'tvl'
export async function getVaults({ chainId, asset, sortBy = 'apy', minTvlUsd = 100000, limit = 20 }) {
  const params = new URLSearchParams()
  if (chainId) params.set('chainId', String(chainId))
  if (asset) params.set('asset', asset)
  if (sortBy) params.set('sortBy', sortBy)
  if (minTvlUsd) params.set('minTvlUsd', String(minTvlUsd))
  params.set('limit', String(limit))

  const res = await fetch(`${EARN_BASE_URL}/v1/earn/vaults?${params}`, { headers })
  const json = await res.json()
  return json.data // array of NormalizedVault
}

// Fetch a user's current DeFi positions across all protocols
export async function getPortfolioPositions(userAddress) {
  const res = await fetch(
    `${EARN_BASE_URL}/v1/earn/portfolio/${userAddress}/positions`,
    { headers }
  )
  const json = await res.json()
  return json.positions // array of positions
}

// Get all supported chains that have active vaults
export async function getSupportedChains() {
  const res = await fetch(`${EARN_BASE_URL}/v1/earn/chains`, { headers })
  return res.json()
}