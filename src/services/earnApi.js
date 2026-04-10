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
// We define a "sane" vault as one that is:
//   1. Has a real, positive APY that is not absurdly high
//   2. Has a 30-day rolling APY that exists and agrees with the current APY
//      (this is the strongest signal — data errors show up as extreme divergence)
//   3. Has meaningful TVL (liquidity exists for the user to actually deposit)
//
// We use 80% (0.80) as our APY ceiling. Anything above this on a real,
// established vault with a consistent 30d history is extremely rare.
// Vaults offering 108,000% APY are data errors or ephemeral liquidity-mining
// spikes that will vanish — we must not show these to users.
const MAX_REASONABLE_APY = 0.80  // 80% — real, sustainable upper bound
const MIN_TVL_FOR_DISPLAY = 100_000 // $100k minimum liquidity

export function isVaultSane(vault) {
  const apy = vault?.analytics?.apy?.total
  const tvl = Number(vault?.analytics?.tvl?.usd ?? 0)
  const apy30d = vault?.analytics?.apy30d

  // Must have a real, numeric APY
  if (apy == null || typeof apy !== 'number') return false

  // Must be positive
  if (apy <= 0) return false

  // Hard cap: no vault above 80% APY is trustworthy unless the 30d avg confirms it
  if (apy > MAX_REASONABLE_APY) {
    // Only allow above 80% if the 30d average is also above 50% — meaning it's
    // a consistently high-yield vault, not a one-day spike
    if (apy30d == null || apy30d < 0.50) return false
    // Even then, cap at 150% absolute maximum
    if (apy > 1.50) return false
  }

  // Must have meaningful TVL
  if (tvl < MIN_TVL_FOR_DISPLAY) return false

  // 30d average must exist and must be in reasonable ratio to current APY.
  // A ratio >4x or <0.1x means the current reading is a spike/error.
  if (apy30d != null && apy30d > 0) {
    const ratio = apy / apy30d
    if (ratio > 4 || ratio < 0.1) return false
  }

  return true
}

// ─── Fetch vaults with automatic pagination and sanity filtering ──────────────
// Fetches broadly (no minTvlUsd enforced at API level) and filters client-side.
// This is necessary because the API's sorting can bury sane vaults behind
// insane ones when filtered too tightly.
export async function getVaults({
  chainId,
  asset,
  protocol,
  sortBy = 'apy',
  minTvlUsd = 100_000,
  limit = 20,
  cursor,
  maxPages = 8,
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
    params.set('limit', '100')
    if (currentCursor) params.set('cursor', currentCursor)

    let json
    try {
      json = await safeFetch(`${BASE}/v1/earn/vaults?${params}`)
    } catch (err) {
      if (pages === 0) throw err
      break
    }

    const page = Array.isArray(json) ? json : (json.data ?? [])
    currentCursor = json.nextCursor ?? null
    pages++

    for (const vault of page) {
      const tvl = Number(vault?.analytics?.tvl?.usd ?? 0)
      if (isVaultSane(vault) && tvl >= minTvlUsd) {
        sane.push(vault)
        if (sane.length >= limit) break
      }
    }

    if (!currentCursor || page.length === 0) break
  }

  return sane
}

// Paginated vault fetch for VaultPage — fetches a broad set, filters sane ones,
// and returns cursor for the next page of RAW API data.
export async function getVaultsPaged({
  chainId,
  asset,
  protocol,
  sortBy = 'apy',
  minTvlUsd = 100_000,
  pageSize = 20,
  cursor,
} = {}) {
  const params = new URLSearchParams()
  if (chainId) params.set('chainId', String(chainId))
  if (asset) params.set('asset', asset)
  if (protocol) params.set('protocol', protocol)
  if (sortBy) params.set('sortBy', sortBy)
  // Fetch large batches so after filtering we still have enough sane vaults
  params.set('limit', '100')
  if (cursor) params.set('cursor', cursor)

  const json = await safeFetch(`${BASE}/v1/earn/vaults?${params}`)
  const raw = Array.isArray(json) ? json : (json.data ?? [])
  const nextCursor = json.nextCursor ?? null

  const sane = raw
    .filter(v => isVaultSane(v) && Number(v?.analytics?.tvl?.usd ?? 0) >= minTvlUsd)
    .slice(0, pageSize)

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