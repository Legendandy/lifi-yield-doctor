// src/services/earnApi.js
// Uses Vite dev proxy (/earn-api → https://earn.li.fi) to avoid CORS issues
const BASE = '/earn-api'
const API_KEY = import.meta.env.VITE_LIFI_API_KEY

function headers() {
  const h = { 'Content-Type': 'application/json' }
  if (API_KEY) h['x-lifi-api-key'] = API_KEY
  return h
}

async function safeFetch(url) {
  const res = await fetch(url, { headers: headers() })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`API ${res.status}: ${text}`)
  }
  return res.json()
}

export async function getVaults({
  chainId,
  asset,
  protocol,
  sortBy = 'apy',
  minTvlUsd,
  limit = 20,
  cursor,
} = {}) {
  const params = new URLSearchParams()
  if (chainId) params.set('chainId', String(chainId))
  if (asset) params.set('asset', asset)
  if (protocol) params.set('protocol', protocol)
  if (sortBy) params.set('sortBy', sortBy)
  if (minTvlUsd != null) params.set('minTvlUsd', String(minTvlUsd))
  params.set('limit', String(limit))
  if (cursor) params.set('cursor', cursor)

  const json = await safeFetch(`${BASE}/v1/earn/vaults?${params}`)
  // API returns { data: [...], nextCursor, total }
  return Array.isArray(json) ? json : (json.data ?? [])
}

export async function getVaultById(chainId, address) {
  return safeFetch(`${BASE}/v1/earn/vaults/${chainId}/${address}`)
}

export async function getPortfolioPositions(userAddress) {
  if (!userAddress) return []
  const json = await safeFetch(
    `${BASE}/v1/earn/portfolio/${userAddress}/positions`
  )
  return json.positions ?? []
}

export async function getSupportedChains() {
  return safeFetch(`${BASE}/v1/earn/chains`)
}

export async function getProtocols() {
  return safeFetch(`${BASE}/v1/earn/protocols`)
}