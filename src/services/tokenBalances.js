// src/services/tokenBalances.js
// Strategy:
// 1. Fetch token list from LI.FI API (all tokens for a chain — USDe, EURC, etc.)
// 2. For the CONNECTED chain: use window.ethereum directly (most reliable, avoids RPC issues)
// 3. For OTHER chains: use public RPC via ethers.JsonRpcProvider
// 4. Balances fetched in parallel, sorted non-zero first

import { ethers } from 'ethers'

export const SUPPORTED_CHAINS = [
  { id: 1,      name: 'Ethereum'  },
  { id: 10,     name: 'Optimism'  },
  { id: 56,     name: 'BSC'       },
  { id: 100,    name: 'Gnosis'    },
  { id: 130,    name: 'Unichain'  },
  { id: 137,    name: 'Polygon'   },
  { id: 143,    name: 'Monad'     },
  { id: 146,    name: 'Sonic'     },
  { id: 5000,   name: 'Mantle'    },
  { id: 8453,   name: 'Base'      },
  { id: 42161,  name: 'Arbitrum'  },
  { id: 42220,  name: 'Celo'      },
  { id: 43114,  name: 'Avalanche' },
  { id: 59144,  name: 'Linea'     },
  { id: 80094,  name: 'Berachain' },
  { id: 534352, name: 'Scroll'    },
  { id: 747,    name: 'Katana'    },
]

export const NATIVE_ADDRESS     = '0x0000000000000000000000000000000000000000'
const       NATIVE_ADDRESS_ALT  = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'

export function isNativeToken(address) {
  if (!address) return true
  const a = address.toLowerCase()
  return a === NATIVE_ADDRESS || a === NATIVE_ADDRESS_ALT
}

const RPC_URLS = {
  1:      'https://cloudflare-eth.com',
  10:     'https://mainnet.optimism.io',
  56:     'https://bsc-dataseed1.binance.org',
  100:    'https://rpc.gnosis.gateway.fm',
  130:    'https://mainnet.unichain.org',
  137:    'https://polygon-rpc.com',
  143:    'https://monad-mainnet.drpc.org',
  146:    'https://rpc.soniclabs.com',
  5000:   'https://rpc.mantle.xyz',
  8453:   'https://mainnet.base.org',
  42161:  'https://arb1.arbitrum.io/rpc',
  42220:  'https://forno.celo.org',
  43114:  'https://api.avax.network/ext/bc/C/rpc',
  59144:  'https://rpc.linea.build',
  80094:  'https://rpc.berachain.com',
  534352: 'https://rpc.scroll.io',
  747:    'https://rpc.katana.network',
}

// ─── Fallback token lists (used when LI.FI API is unavailable) ────────────────
const FALLBACK_TOKENS = {
  1: [
    { address: NATIVE_ADDRESS,                                    symbol: 'ETH',    name: 'Ether',           decimals: 18 },
    { address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',     symbol: 'USDC',   name: 'USD Coin',        decimals: 6  },
    { address: '0xdac17f958d2ee523a2206206994597c13d831ec7',     symbol: 'USDT',   name: 'Tether USD',      decimals: 6  },
    { address: '0x4c9edd5852cd905f086c759e8383e09bff1e68b3',     symbol: 'USDe',   name: 'USDe',            decimals: 18 },
    { address: '0x1abaea1f7c830bd89acc67ec4af516284b1bc33c',     symbol: 'EURC',   name: 'Euro Coin',       decimals: 6  },
    { address: '0x6b175474e89094c44da98b954eedeac495271d0f',     symbol: 'DAI',    name: 'Dai',             decimals: 18 },
    { address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',     symbol: 'WETH',   name: 'Wrapped Ether',   decimals: 18 },
    { address: '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599',     symbol: 'WBTC',   name: 'Wrapped BTC',     decimals: 8  },
    { address: '0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0',     symbol: 'wstETH', name: 'Wrapped stETH',   decimals: 18 },
    { address: '0xae78736cd615f374d3085123a210448e74fc6393',     symbol: 'rETH',   name: 'Rocket Pool ETH', decimals: 18 },
  ],
  10: [
    { address: NATIVE_ADDRESS,                                    symbol: 'ETH',    name: 'Ether',         decimals: 18 },
    { address: '0x0b2c639c533813f4aa9d7837caf62653d097ff85',     symbol: 'USDC',   name: 'USD Coin',      decimals: 6  },
    { address: '0x94b008aa00579c1307b0ef2c499ad98a8ce58e58',     symbol: 'USDT',   name: 'Tether USD',    decimals: 6  },
    { address: '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1',     symbol: 'DAI',    name: 'Dai',           decimals: 18 },
    { address: '0x4200000000000000000000000000000000000006',     symbol: 'WETH',   name: 'Wrapped Ether', decimals: 18 },
  ],
  56: [
    { address: NATIVE_ADDRESS,                                    symbol: 'BNB',    name: 'BNB',           decimals: 18 },
    { address: '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d',     symbol: 'USDC',   name: 'USD Coin',      decimals: 18 },
    { address: '0x55d398326f99059ff775485246999027b3197955',     symbol: 'USDT',   name: 'Tether USD',    decimals: 18 },
    { address: '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c',     symbol: 'WBNB',   name: 'Wrapped BNB',   decimals: 18 },
  ],
  100: [
    { address: NATIVE_ADDRESS,                                    symbol: 'xDAI',   name: 'xDai',          decimals: 18 },
    { address: '0xddafbb505ad214d7b80b1f830fccc89b60fb7a83',     symbol: 'USDC',   name: 'USD Coin',      decimals: 6  },
    { address: '0x4ecaba5870353805a9f068101a40e0f32ed605c6',     symbol: 'USDT',   name: 'Tether USD',    decimals: 6  },
  ],
  130: [
    { address: NATIVE_ADDRESS,                                    symbol: 'ETH',    name: 'Ether',         decimals: 18 },
    { address: '0x078d782b760474a361dda0af3839290b0ef57ad6',     symbol: 'USDC',   name: 'USD Coin',      decimals: 6  },
  ],
  137: [
    { address: NATIVE_ADDRESS,                                    symbol: 'POL',    name: 'Polygon',       decimals: 18 },
    { address: '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359',     symbol: 'USDC',   name: 'USD Coin',      decimals: 6  },
    { address: '0xc2132d05d31c914a87c6611c10748aeb04b58e8f',     symbol: 'USDT',   name: 'Tether USD',    decimals: 6  },
    { address: '0x8f3cf7ad23cd3cadbd9735aff958023239c6a063',     symbol: 'DAI',    name: 'Dai',           decimals: 18 },
    { address: '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619',     symbol: 'WETH',   name: 'Wrapped Ether', decimals: 18 },
  ],
  143: [
    { address: NATIVE_ADDRESS,                                    symbol: 'MON',    name: 'Monad',         decimals: 18 },
  ],
  146: [
    { address: NATIVE_ADDRESS,                                    symbol: 'S',      name: 'Sonic',         decimals: 18 },
    { address: '0x29219dd400f2bf60e5a23d13be72b486d4038894',     symbol: 'USDC',   name: 'USD Coin',      decimals: 6  },
    { address: '0x6047828dc181963ba44974801ff68e538da5eaf9',     symbol: 'USDT',   name: 'Tether USD',    decimals: 6  },
  ],
  5000: [
    { address: NATIVE_ADDRESS,                                    symbol: 'MNT',    name: 'Mantle',        decimals: 18 },
    { address: '0x09bc4e0d864854c6afb6eb9a9cdf58ac190d0df9',     symbol: 'USDC',   name: 'USD Coin',      decimals: 6  },
    { address: '0x201eba5cc46d216ce6dc03f6a759e8e766e956ae',     symbol: 'USDT',   name: 'Tether USD',    decimals: 6  },
  ],
  8453: [
    { address: NATIVE_ADDRESS,                                    symbol: 'ETH',    name: 'Ether',         decimals: 18 },
    { address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',     symbol: 'USDC',   name: 'USD Coin',      decimals: 6  },
    { address: '0xfde4c96c8593536e31f229ea8f37b2ada2699bb2',     symbol: 'USDT',   name: 'Tether USD',    decimals: 6  },
    { address: '0x50c5725949a6f0c72e6c4a641f24049a917db0cb',     symbol: 'DAI',    name: 'Dai',           decimals: 18 },
    { address: '0x4200000000000000000000000000000000000006',     symbol: 'WETH',   name: 'Wrapped Ether', decimals: 18 },
    { address: '0x60a3e35cc302bfa44cb288bc5a4f316fdb1adb42',     symbol: 'EURC',   name: 'Euro Coin',     decimals: 6  },
    { address: '0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf',     symbol: 'cbBTC',  name: 'Coinbase BTC',  decimals: 8  },
  ],
  42161: [
    { address: NATIVE_ADDRESS,                                    symbol: 'ETH',    name: 'Ether',         decimals: 18 },
    { address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',     symbol: 'USDC',   name: 'USD Coin',      decimals: 6  },
    { address: '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9',     symbol: 'USDT',   name: 'Tether USD',    decimals: 6  },
    { address: '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1',     symbol: 'DAI',    name: 'Dai',           decimals: 18 },
    { address: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1',     symbol: 'WETH',   name: 'Wrapped Ether', decimals: 18 },
  ],
  42220: [
    { address: NATIVE_ADDRESS,                                    symbol: 'CELO',   name: 'Celo',          decimals: 18 },
    { address: '0xef4229c8c3250c675f21bcefa42f58efbff6002a',     symbol: 'USDC',   name: 'USD Coin',      decimals: 6  },
    { address: '0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e',     symbol: 'USDT',   name: 'Tether USD',    decimals: 6  },
  ],
  43114: [
    { address: NATIVE_ADDRESS,                                    symbol: 'AVAX',   name: 'Avalanche',     decimals: 18 },
    { address: '0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e',     symbol: 'USDC',   name: 'USD Coin',      decimals: 6  },
    { address: '0x9702230a8ea53601f5cd2dc00fdbc13d4df4a8c7',     symbol: 'USDT',   name: 'Tether USD',    decimals: 6  },
    { address: '0x49d5c2bdffac6ce2bfdb6640f4f80f226bc10bab',     symbol: 'WETH',   name: 'Wrapped Ether', decimals: 18 },
  ],
  59144: [
    { address: NATIVE_ADDRESS,                                    symbol: 'ETH',    name: 'Ether',         decimals: 18 },
    { address: '0x176211869ca2b568f2a7d4ee941e073a821ee1ff',     symbol: 'USDC',   name: 'USD Coin',      decimals: 6  },
    { address: '0xa219439258ca9da29e9cc4ce5596924745e12b93',     symbol: 'USDT',   name: 'Tether USD',    decimals: 6  },
    { address: '0xe5d7c2a44ffddf6b295a15c148167daaaf5cf34f',     symbol: 'WETH',   name: 'Wrapped Ether', decimals: 18 },
  ],
  80094: [
    { address: NATIVE_ADDRESS,                                    symbol: 'BERA',   name: 'Berachain',     decimals: 18 },
    { address: '0x549943e04f40284185054145c6E4e9568C1D3241',     symbol: 'USDC',   name: 'USD Coin',      decimals: 6  },
    { address: '0x05d0dD5135086a1C6b2297aEF2a3BB22bbeD2406',     symbol: 'USDT',   name: 'Tether USD',    decimals: 6  },
  ],
  534352: [
    { address: NATIVE_ADDRESS,                                    symbol: 'ETH',    name: 'Ether',         decimals: 18 },
    { address: '0x06efdbff2a14a7c8e15944d1f4a48f9f95f663a4',     symbol: 'USDC',   name: 'USD Coin',      decimals: 6  },
    { address: '0xf55bec9cafdbe8730f096aa55dad6d22d44099df',     symbol: 'USDT',   name: 'Tether USD',    decimals: 6  },
    { address: '0x5300000000000000000000000000000000000004',     symbol: 'WETH',   name: 'Wrapped Ether', decimals: 18 },
  ],
  747: [
    { address: NATIVE_ADDRESS,                                    symbol: 'ETH',    name: 'Ether',         decimals: 18 },
  ],
}

// Keep for WithdrawModal backwards compat
export const CHAIN_TOKENS = FALLBACK_TOKENS

// ─── Token list fetching ──────────────────────────────────────────────────────
async function fetchTokenList(chainId) {
  const cached = tokenListCache[chainId]
  if (cached && Date.now() - cached.timestamp < TOKEN_CACHE_TTL) {
    return cached.tokens
  }

  try {
    const apiKey = import.meta?.env?.VITE_LIFI_API_KEY
    const headers = { 'Content-Type': 'application/json' }
    if (apiKey) headers['x-lifi-api-key'] = apiKey

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)

    const res = await fetch(`https://li.quest/v1/tokens?chains=${chainId}`, {
      headers,
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (!res.ok) throw new Error(`status ${res.status}`)

    const data = await res.json()
    const raw = data.tokens?.[String(chainId)] ?? []

    const tokens = raw.map(t => ({
      address: t.address ?? NATIVE_ADDRESS,
      symbol: t.symbol ?? '???',
      name: t.name ?? t.symbol ?? 'Unknown',
      decimals: typeof t.decimals === 'number' ? t.decimals : 18,
      logoURI: t.logoURI ?? null,
      chainId,
    }))

    // Ensure native is in the list
    const hasNative = tokens.some(t => isNativeToken(t.address))
    if (!hasNative) {
      const fb = (FALLBACK_TOKENS[chainId] ?? [])[0]
      if (fb) tokens.unshift({ ...fb, chainId, logoURI: null })
    }

    tokenListCache[chainId] = { tokens, timestamp: Date.now() }
    return tokens
  } catch (err) {
    console.warn(`[fetchTokenList] chain ${chainId} — LI.FI API failed, using fallback. Reason:`, err.message)
    const fallback = (FALLBACK_TOKENS[chainId] ?? []).map(t => ({ ...t, chainId, logoURI: null }))
    // Cache the fallback too so we don't hammer the API
    tokenListCache[chainId] = { tokens: fallback, timestamp: Date.now() - TOKEN_CACHE_TTL + 60_000 }
    return fallback
  }
}

// ─── Provider selection ───────────────────────────────────────────────────────
/**
 * Returns the best available provider for a chain.
 * Uses window.ethereum when wallet is already on that chain — most reliable for balance reads.
 */
async function getBestProvider(chainId) {
  // Try wallet first (only works if wallet is already on this chain)
  if (window.ethereum) {
    try {
      const walletProvider = new ethers.BrowserProvider(window.ethereum)
      const network = await walletProvider.getNetwork()
      if (Number(network.chainId) === chainId) {
        return walletProvider
      }
    } catch {
      // Not on this chain or wallet unavailable
    }
  }

  // Fall back to public RPC
  const rpcUrl = RPC_URLS[chainId]
  if (!rpcUrl) return null

  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl, chainId, { staticNetwork: true })
    // Quick health check
    await provider.getBlockNumber()
    return provider
  } catch (err) {
    console.warn(`[getBestProvider] chain ${chainId} RPC failed:`, err.message)
    return null
  }
}

const ERC20_ABI = ['function balanceOf(address owner) view returns (uint256)']

function formatBalance(f) {
  if (f === 0) return '0'
  if (f < 0.0001) return f.toFixed(8)
  if (f < 1)      return f.toFixed(6)
  if (f < 1000)   return f.toFixed(4)
  return f.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

/**
 * Main export.
 * Fetches ALL token balances for a wallet on a given chain.
 * Token list comes from LI.FI API (100s of tokens), balances from direct RPC.
 */
export async function getTokenBalancesOnChain(walletAddress, chainId) {
  if (!walletAddress || !chainId) return []

  const [tokens, provider] = await Promise.all([
    fetchTokenList(chainId),
    getBestProvider(chainId),
  ])

  if (!tokens.length) return []

  // No provider → show token list with zero balances (better than empty)
  if (!provider) {
    return tokens.slice(0, 50).map(t => ({
      ...t,
      formattedBalance: '0',
      balanceRaw: '0',
      balanceFloat: 0,
    }))
  }

  // Order: priority tokens first (likely to have balances), then rest, capped at 120
  const PRIORITY = new Set([
    'ETH','BNB','MATIC','POL','AVAX','MON','BERA','S','MNT','CELO','xDAI',
    'USDC','USDT','DAI','USDe','USDE','EURC','WETH','WBTC','WBNB',
    'wstETH','stETH','rETH','cbBTC','WXDAI','WMATIC','cbETH',
  ])

  const sorted = [
    ...tokens.filter(t => PRIORITY.has(t.symbol)),
    ...tokens.filter(t => !PRIORITY.has(t.symbol)),
  ].slice(0, 120)

  const settled = await Promise.allSettled(
    sorted.map(async token => {
      let rawBigInt = 0n
      try {
        if (isNativeToken(token.address)) {
          rawBigInt = await provider.getBalance(walletAddress)
        } else {
          const contract = new ethers.Contract(token.address, ERC20_ABI, provider)
          rawBigInt = await contract.balanceOf(walletAddress)
        }
      } catch {
        rawBigInt = 0n
      }

      const decimals  = typeof token.decimals === 'number' ? token.decimals : 18
      const floatVal  = parseFloat(ethers.formatUnits(rawBigInt, decimals))

      return {
        ...token,
        formattedBalance: formatBalance(floatVal),
        balanceRaw: rawBigInt.toString(),
        balanceFloat: floatVal,
      }
    })
  )

  const result = settled.map((r, i) =>
    r.status === 'fulfilled'
      ? r.value
      : { ...sorted[i], formattedBalance: '0', balanceRaw: '0', balanceFloat: 0 }
  )

  return result.sort((a, b) => {
    const aHas = a.balanceFloat > 0
    const bHas = b.balanceFloat > 0
    if (aHas && !bHas) return -1
    if (!aHas && bHas) return 1
    return b.balanceFloat - a.balanceFloat
  })
}