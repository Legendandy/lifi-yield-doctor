// src/services/earnApi.js
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
// We only exclude truly impossible data — extreme spikes with zero history.
// Vaults missing 30d data are still valid (e.g. newly launched vaults).
// Ethereum vaults often lack 30d rolling data — we must not exclude them.

const ABSOLUTE_MAX_APY = 5.0  // 500% — anything above is a data error
const MIN_TVL_FOR_DISPLAY = 10_000 // $10k minimum — very permissive

export function isVaultSane(vault) {
  const apy = vault?.analytics?.apy?.total
  const tvl = Number(vault?.analytics?.tvl?.usd ?? 0)
  const apy30d = vault?.analytics?.apy30d

  // Must have a real, numeric APY
  if (apy == null || typeof apy !== 'number') return false

  // Must be non-negative (0% APY vaults are valid — they still exist)
  if (apy < 0) return false

  // Hard cap: above 500% is almost certainly a data error
  if (apy > ABSOLUTE_MAX_APY) return false

  // If 30d data exists, check for extreme divergence (ratio > 10x)
  // This catches ephemeral spikes but allows normally high-APY vaults
  if (apy30d != null && apy30d > 0) {
    const ratio = apy / apy30d
    if (ratio > 10 || ratio < 0.05) return false
  }

  // Minimum liquidity
  if (tvl < MIN_TVL_FOR_DISPLAY) return false

  return true
}

// ─── Vault Ranking Score ──────────────────────────────────────────────────────
// Composite score that balances APY and TVL.
// We don't just sort by APY because a 200% APY on $10k TVL is less useful
// than a 15% APY on $100M TVL. The score blends both dimensions.
//
// Formula:
//   apyScore  = normalized APY (sigmoid-like, caps around 50%)
//   tvlScore  = log-normalized TVL (rewards large TVL but with diminishing returns)
//   stability = bonus if 30d avg is close to current APY (consistent vault)
//
// Weights: APY 50%, TVL 35%, Stability 15%

export function computeVaultRankScore(vault) {
  const apy = vault?.analytics?.apy?.total ?? 0
  const tvl = Number(vault?.analytics?.tvl?.usd ?? 0)
  const apy30d = vault?.analytics?.apy30d

  // APY score: use sqrt to compress extreme values. 50% APY ≈ score 0.7
  // This means a vault at 5% vs 50% isn't 10x better in score — more like 3x
  const apyScore = Math.min(Math.sqrt(apy / 0.5), 1)

  // TVL score: log scale. $1M = 0.5, $100M = ~1.0
  const tvlScore = tvl > 0 ? Math.min(Math.log10(tvl / 10000) / 4, 1) : 0

  // Stability bonus: if 30d avg exists and is within 30% of current APY
  let stabilityBonus = 0
  if (apy30d != null && apy30d > 0 && apy > 0) {
    const ratio = Math.abs(apy - apy30d) / apy30d
    stabilityBonus = ratio < 0.3 ? 0.15 : ratio < 0.6 ? 0.07 : 0
  }

  return apyScore * 0.50 + tvlScore * 0.35 + stabilityBonus
}

// ─── Fetch vaults for a specific chain with full pagination ───────────────────
// Fetches ALL pages for a given chainId, applies relaxed sanity filter,
// then returns vaults sorted by composite rank score.
export async function getVaultsForChain({ chainId, maxPages = 15 } = {}) {
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

  // Sort by composite rank score (best first)
  return all.sort((a, b) => computeVaultRankScore(b) - computeVaultRankScore(a))
}

// ─── Paginated fetch (for VaultPage UI pagination) ────────────────────────────
// Returns a page of pre-ranked vaults + total count
export async function getVaultsPaged({
  chainId,
  pageSize = 20,
  pageIndex = 0, // 0-based
} = {}) {
  // Fetch all ranked vaults for this chain (cached conceptually in caller)
  const all = await getVaultsForChain({ chainId })
  const start = pageIndex * pageSize
  const end = start + pageSize
  return {
    data: all.slice(start, end),
    total: all.length,
    totalPages: Math.ceil(all.length / pageSize),
  }
}

// ─── Legacy helpers (used by Dashboard and Health Monitor) ───────────────────
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
  return safeFetch(`${BASE}/v1/earn/chains`)
}

export async function getProtocols() {
  return safeFetch(`${BASE}/v1/earn/protocols`)
}