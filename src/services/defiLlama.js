// src/services/defiLlama.js
// Fetches DeFiLlama yield pool data and provides matching + risk scoring logic.

const DEFILLAMA_URL = 'https://yields.llama.fi/pools'

// ─── Cache ────────────────────────────────────────────────────────────────────
let _poolsCache = null
let _poolsCacheTime = 0
const CACHE_TTL = 60 * 60 * 1000 // 1 hour

export async function fetchDefiLlamaPools() {
  if (_poolsCache && Date.now() - _poolsCacheTime < CACHE_TTL) return _poolsCache
  try {
    const res = await fetch(DEFILLAMA_URL)
    if (!res.ok) throw new Error(`DeFiLlama API ${res.status}`)
    const json = await res.json()
    _poolsCache = json.data ?? []
    _poolsCacheTime = Date.now()
    return _poolsCache
  } catch (err) {
    console.warn('[defiLlama] Failed to fetch pools:', err.message)
    return []
  }
}

// ─── Protocol name normalization ──────────────────────────────────────────────
const PROTOCOL_MAP = {
  'morpho-v1': 'morpho',
  'morpho-v2': 'morpho',
  'morpho':    'morpho',
  'aave-v3':   'aave-v3',
  'aave-v2':   'aave-v2',
  'aave':      'aave-v3',
  'compound-v3': 'compound-v3',
  'compound-v2': 'compound-v2',
  'compound':  'compound-v3',
  'euler-v2':  'euler',
  'euler-v1':  'euler',
  'euler':     'euler',
  'yearn-v3':  'yearn',
  'yearn-v2':  'yearn',
  'yearn':     'yearn',
  'beefy':     'beefy',
  'pendle-v2': 'pendle',
  'pendle':    'pendle',
  'sky':       'sky',
  'sky-lending': 'sky-lending',
  'maker':     'maker',
  'spark':     'spark',
  'spark-v1':  'spark',
  'fluid':     'fluid',
  'maple':     'maple',
  'convex':    'convex-finance',
  'curve':     'curve',
  'balancer-v2': 'balancer',
  'balancer':  'balancer',
  'ethena':    'ethena',
  'upshift':   'upshift',
}

function normalizeProtocol(lifiProtocolName) {
  if (!lifiProtocolName) return ''
  const lower = lifiProtocolName.toLowerCase()
  return PROTOCOL_MAP[lower] ?? lower.replace(/-v\d+$/, '').replace(/-/g, '')
}

// ─── Chain id → DeFiLlama chain name ─────────────────────────────────────────
const CHAIN_ID_TO_LLAMA = {
  1:      'Ethereum',
  10:     'Optimism',
  56:     'BSC',
  100:    'Gnosis',
  130:    'Unichain',
  137:    'Polygon',
  143:    'Monad',
  146:    'Sonic',
  5000:   'Mantle',
  8453:   'Base',
  42161:  'Arbitrum',
  42220:  'Celo',
  43114:  'Avalanche',
  59144:  'Linea',
  80094:  'Berachain',
  534352: 'Scroll',
  747:    'Katana',
}

function chainToLlama(chainId) {
  return (CHAIN_ID_TO_LLAMA[chainId] ?? '').toLowerCase()
}

// ─── Build lookup index ───────────────────────────────────────────────────────
let _indexByAddrKey = null
let _indexBySymbolKey = null
let _indexedFromCache = null

function buildIndex(pools) {
  if (_indexedFromCache === pools) return
  _indexedFromCache = pools
  _indexByAddrKey = new Map()
  _indexBySymbolKey = new Map()

  for (const pool of pools) {
    const chain = (pool.chain ?? '').toLowerCase()
    const project = (pool.project ?? '').toLowerCase()

    for (const addr of (pool.underlyingTokens ?? [])) {
      const key = `${chain}:${project}:${addr.toLowerCase()}`
      if (!_indexByAddrKey.has(key)) _indexByAddrKey.set(key, pool)
    }

    const sym = (pool.symbol ?? '').toLowerCase()
    const symKey = `${chain}:${project}:${sym}`
    if (!_indexBySymbolKey.has(symKey)) _indexBySymbolKey.set(symKey, pool)
  }
}

// ─── Match a LiFi vault to a DeFiLlama pool ──────────────────────────────────
export function matchVaultToPool(vault, pools) {
  if (!pools?.length) return null
  buildIndex(pools)

  const lifiProtocol = vault?.protocol?.name ?? ''
  const chainId = vault?.chainId
  const chain = chainToLlama(chainId)
  const underlyingTokens = vault?.underlyingTokens ?? []

  const normalizedProto = normalizeProtocol(lifiProtocol)
  const protoVariants = [
    lifiProtocol.toLowerCase(),
    normalizedProto,
    lifiProtocol.toLowerCase().replace(/-v\d+$/, ''),
    lifiProtocol.toLowerCase().replace(/-/g, ''),
  ].filter(Boolean)

  // 1. Match by underlying token address (most reliable)
  for (const token of underlyingTokens) {
    const addr = (token.address ?? '').toLowerCase()
    if (!addr) continue
    for (const proto of protoVariants) {
      const key = `${chain}:${proto}:${addr}`
      const match = _indexByAddrKey?.get(key)
      if (match) return match
    }
  }

  // 2. Match by underlying token symbol
  for (const token of underlyingTokens) {
    const sym = (token.symbol ?? '').toLowerCase()
    if (!sym) continue
    for (const proto of protoVariants) {
      const key = `${chain}:${proto}:${sym}`
      const match = _indexBySymbolKey?.get(key)
      if (match) return match
    }
  }

  // 3. Fuzzy: same chain + partial protocol match + partial symbol match
  for (const token of underlyingTokens) {
    const sym = (token.symbol ?? '').toLowerCase()
    if (!sym) continue
    for (const [key, pool] of (_indexBySymbolKey ?? new Map())) {
      const [pChain, pProto, pSym] = key.split(':')
      if (pChain !== chain) continue
      if (!protoVariants.some(v => pProto.includes(v) || v.includes(pProto))) continue
      if (pSym.includes(sym) || sym.includes(pSym)) return pool
    }
  }

  return null
}

// ─── Risk Score ───────────────────────────────────────────────────────────────
// A ≥ 70  |  B ≥ 45  |  C ≥ 20  |  D < 20

const PROTOCOL_TIERS = {
  A: new Set(['morpho','aave','aave-v3','aave-v2','compound','compound-v3','compound-v2','spark','euler','yearn','beefy','sky','maker','sky-lending']),
  B: new Set(['pendle','ethena','fluid','maple','convex','convex-finance','curve','balancer','balancer-v2']),
}

function getProtocolTier(lifiProtocolName) {
  const n = normalizeProtocol(lifiProtocolName)
  const raw = (lifiProtocolName ?? '').toLowerCase()
  if (PROTOCOL_TIERS.A.has(n) || PROTOCOL_TIERS.A.has(raw)) return { tier: 'A', pts: 20 }
  if (PROTOCOL_TIERS.B.has(n) || PROTOCOL_TIERS.B.has(raw)) return { tier: 'B', pts: 13 }
  for (const t of PROTOCOL_TIERS.A) { if (n.includes(t) || t.includes(n)) return { tier: 'A', pts: 20 } }
  for (const t of PROTOCOL_TIERS.B) { if (n.includes(t) || t.includes(n)) return { tier: 'B', pts: 13 } }
  return { tier: 'C', pts: 6 }
}

export function computeRiskScore(vault, llamaPool) {
  const lifiApy = vault?.analytics?.apy?.total ?? 0
  const lifiTvl = Number(vault?.analytics?.tvl?.usd ?? 0)
  const protocolName = vault?.protocol?.name ?? ''

  // Dim 1: Sigma (0–40)
  const sigma = llamaPool?.sigma ?? null
  let sigmaScore
  if (sigma === null) sigmaScore = 5
  else if (sigma < 0.05) sigmaScore = 40
  else if (sigma < 0.10) sigmaScore = 30
  else if (sigma < 0.20) sigmaScore = 18
  else if (sigma < 0.50) sigmaScore = 8
  else sigmaScore = 0

  // Dim 2: Mu drift (0–20)
  const mu = llamaPool?.mu ?? null
  let muScore
  if (mu === null || mu === 0) {
    muScore = 5
  } else {
    const drift = (lifiApy - mu) / Math.abs(mu)
    if (lifiApy < mu) muScore = 20
    else if (drift <= 0.20) muScore = 20
    else if (drift <= 0.50) muScore = 14
    else if (drift <= 1.00) muScore = 7
    else muScore = 0
  }

  // Dim 3: Protocol trust (0–20)
  const { tier: protocolTier, pts: protocolScore } = getProtocolTier(protocolName)

  // Dim 4: TVL depth (0–15)
  let tvlScore
  if (lifiTvl < 1_000_000) tvlScore = 0
  else if (lifiTvl < 10_000_000) tvlScore = 5
  else if (lifiTvl < 50_000_000) tvlScore = 9
  else if (lifiTvl < 200_000_000) tvlScore = 12
  else tvlScore = 15

  // Dim 5: Flags (0–5)
  let flagScore = 5
  if (llamaPool?.outlier === true) flagScore -= 4
  if (llamaPool?.ilRisk === 'yes') flagScore -= 1
  flagScore = Math.max(0, flagScore)

  const total = sigmaScore + muScore + protocolScore + tvlScore + flagScore

  let grade
  if (total >= 70) grade = 'A'
  else if (total >= 45) grade = 'B'
  else if (total >= 20) grade = 'C'
  else grade = 'D'

  return {
    score: total,
    grade,
    sigma,
    mu,
    protocolTier,
    breakdown: { sigmaScore, muScore, protocolScore, tvlScore, flagScore },
    isOutlier: llamaPool?.outlier ?? false,
    ilRisk: llamaPool?.ilRisk ?? null,
    predictions: llamaPool?.predictions ?? null,
  }
}

export const GRADE_CONFIG = {
  A: { label: 'A', color: '#009844', bg: 'rgba(0,152,68,0.12)', border: 'rgba(0,152,68,0.35)', desc: 'Low risk' },
  B: { label: 'B', color: '#d97706', bg: 'rgba(217,119,6,0.12)', border: 'rgba(217,119,6,0.35)', desc: 'Moderate risk' },
  C: { label: 'C', color: '#ea580c', bg: 'rgba(234,88,12,0.12)', border: 'rgba(234,88,12,0.35)', desc: 'Higher risk' },
  D: { label: 'D', color: '#ba1a1a', bg: 'rgba(186,26,26,0.12)', border: 'rgba(186,26,26,0.35)', desc: 'High risk' },
}

// ─── Doctor's Choice ─────────────────────────────────────────────────────────
// Best + safest vault on chain. Picks highest-grade vaults first (A → B → C → D),
// then within that grade picks the best APY × TVL composite.
export function pickDoctorsChoice(vaults, riskMap) {
  if (!vaults.length) return null

  for (const targetGrade of ['A', 'B', 'C', 'D']) {
    const candidates = vaults.filter(v => {
      const key = v.slug ?? v.address
      const risk = riskMap.get(key)
      return risk?.grade === targetGrade
    })
    if (candidates.length === 0) continue

    const scored = candidates.map(v => {
      const apy = v.analytics?.apy?.total ?? 0
      const tvl = Number(v.analytics?.tvl?.usd ?? 0)
      const tvlScore = tvl > 0 ? Math.min(Math.log10(tvl / 10_000) / 4, 1) : 0
      const apyScore = Math.min(Math.sqrt(apy / 50), 1)
      return { vault: v, score: apyScore * 0.55 + tvlScore * 0.45 }
    })
    scored.sort((a, b) => b.score - a.score)
    return scored[0].vault
  }

  // No risk data: fall back to highest TVL
  return [...vaults].sort(
    (a, b) => Number(b.analytics?.tvl?.usd ?? 0) - Number(a.analytics?.tvl?.usd ?? 0)
  )[0] ?? null
}