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

// ─── APY Sanity Filter ────────────────────────────────────────────────────────
// Anything above 200% APY on a vault with real TVL is either:
//   (a) a liquidity-mining spike that will vanish, or
//   (b) a data error from the API.
// We cap at 200% (2.0 in decimal) and also require all rolling APY fields
// to be reasonably consistent so we're not misreporting to users.
const MAX_REASONABLE_APY = 2.0 // 200%
const MIN_TVL_FOR_DISPLAY = 100_000 // $100k TVL minimum

export function isVaultSane(vault) {
  const apy = vault?.analytics?.apy?.total
  const tvl = Number(vault?.analytics?.tvl?.usd ?? 0)

  // Must have a non-null APY
  if (apy == null || typeof apy !== 'number') return false

  // Must be positive
  if (apy <= 0) return false

  // Cap at MAX_REASONABLE_APY
  if (apy > MAX_REASONABLE_APY) return false

  // Must have meaningful TVL
  if (tvl < MIN_TVL_FOR_DISPLAY) return false

  // If we have 30d rolling data, check for extreme drift that suggests bad data
  const apy30d = vault?.analytics?.apy30d
  if (apy30d != null && apy30d > 0) {
    const ratio = apy / apy30d
    // If current APY is more than 5x the 30d average, something is off
    if (ratio > 5 || ratio < 0.05) return false
  }

  return true
}

// ─── Fetch vaults with automatic pagination and sanity filtering ──────────────
// Strategy:
// 1. Sort by APY descending (so we always consider the highest first).
// 2. Collect pages until we have enough sane vaults OR run out of data.
// 3. Return only vaults that pass isVaultSane().
export async function getVaults({
  chainId,
  asset,
  protocol,
  sortBy = 'apy',
  minTvlUsd = 500_000,
  limit = 20,
  cursor,
  maxPages = 5, // safety cap to avoid hammering the API
} = {}) {
  const sane = []
  let currentCursor = cursor
  let pages = 0

  while (sane.length < limit && pages < maxPages) {
    const params = new URLSearchParams()
    if (chainId) params.set('chainId', String(chainId))
    if (asset) params.set('asset', asset)
    if (protocol) params.set('protocol', protocol)
    if (sortBy) params.set('sortBy', sortBy)
    // Fetch with a larger page to reduce round-trips
    params.set('limit', '100')
    if (minTvlUsd != null) params.set('minTvlUsd', String(minTvlUsd))
    if (currentCursor) params.set('cursor', currentCursor)

    let json
    try {
      json = await safeFetch(`${BASE}/v1/earn/vaults?${params}`)
    } catch (err) {
      // Propagate the first-page error; silently stop on subsequent pages
      if (pages === 0) throw err
      break
    }

    const page = Array.isArray(json) ? json : (json.data ?? [])
    currentCursor = json.nextCursor ?? null
    pages++

    for (const vault of page) {
      if (isVaultSane(vault)) {
        sane.push(vault)
        if (sane.length >= limit) break
      }
    }

    // No more pages
    if (!currentCursor || page.length === 0) break
  }

  return sane
}

// Convenience wrapper: return just the nextCursor alongside data
// (used by VaultPage for manual pagination)
export async function getVaultsPaged({
  chainId,
  asset,
  protocol,
  sortBy = 'apy',
  minTvlUsd = 500_000,
  pageSize = 20,
  cursor,
} = {}) {
  const params = new URLSearchParams()
  if (chainId) params.set('chainId', String(chainId))
  if (asset) params.set('asset', asset)
  if (protocol) params.set('protocol', protocol)
  if (sortBy) params.set('sortBy', sortBy)
  if (minTvlUsd != null) params.set('minTvlUsd', String(minTvlUsd))
  // Fetch extra to account for sanity filtering
  params.set('limit', String(Math.min(pageSize * 3, 100)))
  if (cursor) params.set('cursor', cursor)

  const json = await safeFetch(`${BASE}/v1/earn/vaults?${params}`)
  const raw = Array.isArray(json) ? json : (json.data ?? [])
  const nextCursor = json.nextCursor ?? null

  const sane = raw.filter(isVaultSane).slice(0, pageSize)
  return { data: sane, nextCursor }
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