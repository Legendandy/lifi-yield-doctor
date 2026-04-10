// src/services/earnApi.js
import { getCached, setCached, CACHE_KEYS } from './vaultCache'

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

// ─── Relaxed Sanity Filter ────────────────────────────────────────────────────
const ABSOLUTE_MAX_APY = 5.0
const MIN_TVL_FOR_DISPLAY = 10_000

export function isVaultSane(vault) {
  const apy = vault?.analytics?.apy?.total
  const tvl = Number(vault?.analytics?.tvl?.usd ?? 0)
  const apy30d = vault?.analytics?.apy30d

  if (apy == null || typeof apy !== 'number') return false
  if (apy < 0) return false
  if (apy > ABSOLUTE_MAX_APY) return false

  if (apy30d != null && apy30d > 0) {
    const ratio = apy / apy30d
    if (ratio > 10 || ratio < 0.05) return false
  }

  if (tvl < MIN_TVL_FOR_DISPLAY) return false

  return true
}

// ─── Vault Ranking Score ──────────────────────────────────────────────────────
export function computeVaultRankScore(vault) {
  const apy = vault?.analytics?.apy?.total ?? 0
  const tvl = Number(vault?.analytics?.tvl?.usd ?? 0)
  const apy30d = vault?.analytics?.apy30d

  const apyScore = Math.min(Math.sqrt(apy / 0.5), 1)
  const tvlScore = tvl > 0 ? Math.min(Math.log10(tvl / 10000) / 4, 1) : 0

  let stabilityBonus = 0
  if (apy30d != null && apy30d > 0 && apy > 0) {
    const ratio = Math.abs(apy - apy30d) / apy30d
    stabilityBonus = ratio < 0.3 ? 0.15 : ratio < 0.6 ? 0.07 : 0
  }

  return apyScore * 0.50 + tvlScore * 0.35 + stabilityBonus
}

// ─── Fetch vaults for a specific chain with caching ───────────────────────────
export async function getVaultsForChain({ chainId, maxPages = 15 } = {}) {
  const cacheKey = CACHE_KEYS.chainVaults(chainId)
  const cached = getCached(cacheKey)
  if (cached) return cached

  const all = []
  let cursor = undefined
  let pages = 0

  while (pages < maxPages) {
    const params = new URLSearchParams()
    if (chainId) params.set('chainId', String(chainId))
    params.set('limit', '100')
    if (cursor) params.set('cursor', cursor)

    let json
    try {
      json = await safeFetch(`${BASE}/v1/earn/vaults?${params}`)
    } catch (err) {
      if (pages === 0) throw err
      break
    }

    const page = Array.isArray(json) ? json : (json.data ?? [])
    cursor = json.nextCursor ?? null
    pages++

    for (const vault of page) {
      if (isVaultSane(vault)) {
        all.push(vault)
      }
    }

    if (!cursor || page.length === 0) break
  }

  const sorted = all.sort((a, b) => computeVaultRankScore(b) - computeVaultRankScore(a))
  setCached(cacheKey, sorted)
  return sorted
}

// ─── Fetch best vault across ALL chains ──────────────────────────────────────
// Used by the AI diagnosis to give a specific cross-chain recommendation
export async function getBestVaultAcrossAllChains() {
  const cacheKey = CACHE_KEYS.allChainsBest
  const cached = getCached(cacheKey)
  if (cached) return cached

  // Get chains first
  const chains = await getSupportedChains()

  // Fetch top vaults from first 5 chains in parallel (to avoid too many requests)
  const topChains = chains.slice(0, 5)
  const results = await Promise.allSettled(
    topChains.map(chain =>
      getVaultsForChain({ chainId: chain.chainId, maxPages: 3 })
        .then(vaults => vaults.slice(0, 5).map(v => ({ ...v, _chainName: chain.name })))
    )
  )

  const allTopVaults = results
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => r.value)

  const sorted = allTopVaults.sort(
    (a, b) => computeVaultRankScore(b) - computeVaultRankScore(a)
  )

  const best = sorted[0] ?? null
  setCached(cacheKey, best)
  return best
}

// ─── Paginated fetch ──────────────────────────────────────────────────────────
export async function getVaultsPaged({
  chainId,
  pageSize = 20,
  pageIndex = 0,
} = {}) {
  const all = await getVaultsForChain({ chainId })
  const start = pageIndex * pageSize
  const end = start + pageSize
  return {
    data: all.slice(start, end),
    total: all.length,
    totalPages: Math.ceil(all.length / pageSize),
  }
}

// ─── Legacy helpers ───────────────────────────────────────────────────────────
export async function getVaults({
  chainId,
  asset,
  protocol,
  sortBy = 'apy',
  minTvlUsd = 100_000,
  limit = 20,
} = {}) {
  const params = new URLSearchParams()
  if (chainId) params.set('chainId', String(chainId))
  if (asset) params.set('asset', asset)
  if (protocol) params.set('protocol', protocol)
  if (sortBy) params.set('sortBy', sortBy)
  params.set('limit', '100')

  const json = await safeFetch(`${BASE}/v1/earn/vaults?${params}`)
  const raw = Array.isArray(json) ? json : (json.data ?? [])

  return raw
    .filter(v => isVaultSane(v) && Number(v?.analytics?.tvl?.usd ?? 0) >= minTvlUsd)
    .sort((a, b) => computeVaultRankScore(b) - computeVaultRankScore(a))
    .slice(0, limit)
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
  const cacheKey = CACHE_KEYS.chains
  const cached = getCached(cacheKey)
  if (cached) return cached

  const data = await safeFetch(`${BASE}/v1/earn/chains`)
  setCached(cacheKey, data)
  return data
}

export async function getProtocols() {
  return safeFetch(`${BASE}/v1/earn/protocols`)
}