// src/services/vaultCache.js
// 30-minute in-memory cache for vault data
// Prevents rankings from changing on every refresh

const CACHE_TTL_MS = 30 * 60 * 1000 // 30 minutes

const cache = {}

export function getCached(key) {
  const entry = cache[key]
  if (!entry) return null
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    delete cache[key]
    return null
  }
  return entry.data
}

export function setCached(key, data) {
  cache[key] = { data, timestamp: Date.now() }
}

export function getCacheAge(key) {
  const entry = cache[key]
  if (!entry) return null
  return Date.now() - entry.timestamp
}

export function getCacheExpiresIn(key) {
  const entry = cache[key]
  if (!entry) return null
  const remaining = CACHE_TTL_MS - (Date.now() - entry.timestamp)
  return Math.max(0, remaining)
}

export function invalidateCache(key) {
  delete cache[key]
}

export function invalidateAll() {
  Object.keys(cache).forEach(k => delete cache[k])
}

export const CACHE_KEYS = {
  chainVaults: (chainId) => `vaults:chain:${chainId}`,
  allChainsBest: 'vaults:allChains:best',
  chains: 'chains:list',
}