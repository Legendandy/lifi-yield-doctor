// src/services/earnApi.js
const EARN_BASE_URL = 'https://earn.li.fi'
const API_KEY = import.meta.env.VITE_LIFI_API_KEY

const headers = { 'x-lifi-api-key': API_KEY }

export async function getVaults({ chainId, asset, protocol, sortBy = 'apy', minTvlUsd, limit = 20, cursor } = {}) {
  const params = new URLSearchParams()
  if (chainId) params.set('chainId', String(chainId))
  if (asset) params.set('asset', asset)
  if (protocol) params.set('protocol', protocol)
  if (sortBy) params.set('sortBy', sortBy)
  if (minTvlUsd != null) params.set('minTvlUsd', String(minTvlUsd))
  params.set('limit', String(limit))
  if (cursor) params.set('cursor', cursor)

  const res = await fetch(`${EARN_BASE_URL}/v1/earn/vaults?${params}`, { headers })
  if (!res.ok) throw new Error(`getVaults failed: ${res.status}`)
  const json = await res.json()
  return json.data
}

export async function getVaultById(chainId, address) {
  const res = await fetch(
    `${EARN_BASE_URL}/v1/earn/vaults/${chainId}/${address}`,
    { headers }
  )
  if (!res.ok) throw new Error(`getVaultById failed: ${res.status}`)
  return res.json()
}

export async function getPortfolioPositions(userAddress) {
  const res = await fetch(
    `${EARN_BASE_URL}/v1/earn/portfolio/${userAddress}/positions`,
    { headers }
  )
  if (!res.ok) throw new Error(`getPortfolioPositions failed: ${res.status}`)
  const json = await res.json()
  return json.positions || []
}

export async function getSupportedChains() {
  const res = await fetch(`${EARN_BASE_URL}/v1/earn/chains`, { headers })
  return res.json()
}

export async function getProtocols() {
  const res = await fetch(`${EARN_BASE_URL}/v1/earn/protocols`, { headers })
  return res.json()
}