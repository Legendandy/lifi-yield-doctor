// src/services/tokenBalances.js
// Uses LI.FI SDK getTokens + getTokenBalances for reliable token lists and balances.
// The SDK's EVM provider (configured via wagmi in main.jsx) handles RPC calls directly.
//
// FIX: getTokenBalances returns `amount` as a raw BigInt string (e.g., "1000000" for 1 USDC).
// We must use formatUnits(amount, decimals) to get the human-readable float.

import { getTokens, getTokenBalances } from '@lifi/sdk'
import { formatUnits } from 'viem'

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

export const NATIVE_ADDRESS    = '0x0000000000000000000000000000000000000000'
const       NATIVE_ADDRESS_ALT = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'

export function isNativeToken(address) {
  if (!address) return true
  const a = address.toLowerCase()
  return a === NATIVE_ADDRESS || a === NATIVE_ADDRESS_ALT
}

// ─── Stablecoin detection ─────────────────────────────────────────────────────
// These symbols get 2 decimal places; everything else keeps full precision
const STABLECOIN_SYMBOLS = new Set([
  'USDC', 'USDT', 'DAI', 'USDE', 'USDE', 'USDe', 'BUSD', 'TUSD', 'FRAX',
  'LUSD', 'SUSD', 'EURC', 'EURS', 'EURT', 'USDD', 'USDP', 'GUSD', 'HUSD',
  'CUSD', 'MUSD', 'XUSD', 'ALUSD', 'CRVUSD', 'MKUSD', 'PYUSD', 'FDUSD',
  'WXDAI', 'XDAI',
])

function isStablecoin(symbol) {
  if (!symbol) return false
  const s = symbol.toUpperCase()
  // Match exact symbol or common patterns like USDC.e, USDT.e, DAI.e
  if (STABLECOIN_SYMBOLS.has(s)) return true
  // Also match if it starts with USD or ends with USD
  if (s.startsWith('USD') || s.endsWith('USD')) return true
  if (s.startsWith('EUR') && s.length <= 6) return true
  return false
}

// ─── Format helpers ───────────────────────────────────────────────────────────
function formatBalance(f, symbol) {
  if (f === 0) return '0.00'
  if (isStablecoin(symbol)) {
    // Stablecoins: always 2 decimal places
    return f.toFixed(2)
  }
  // Non-stablecoins (ETH, BTC, etc.): preserve meaningful precision
  if (f < 0.0001) return f.toFixed(8)
  if (f < 1)      return f.toFixed(6)
  if (f < 1000)   return f.toFixed(4)
  return f.toLocaleString(undefined, { maximumFractionDigits: 4 })
}

// ─── Fallback static token list (used when SDK token fetch fails) ─────────────
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
  ],
  100: [
    { address: NATIVE_ADDRESS,                                    symbol: 'xDAI',   name: 'xDai',          decimals: 18 },
    { address: '0xddafbb505ad214d7b80b1f830fccc89b60fb7a83',     symbol: 'USDC',   name: 'USD Coin',      decimals: 6  },
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
  143: [{ address: NATIVE_ADDRESS, symbol: 'MON',  name: 'Monad',     decimals: 18 }],
  146: [
    { address: NATIVE_ADDRESS,                                    symbol: 'S',      name: 'Sonic',         decimals: 18 },
    { address: '0x29219dd400f2bf60e5a23d13be72b486d4038894',     symbol: 'USDC',   name: 'USD Coin',      decimals: 6  },
  ],
  5000: [
    { address: NATIVE_ADDRESS,                                    symbol: 'MNT',    name: 'Mantle',        decimals: 18 },
    { address: '0x09bc4e0d864854c6afb6eb9a9cdf58ac190d0df9',     symbol: 'USDC',   name: 'USD Coin',      decimals: 6  },
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
  ],
  43114: [
    { address: NATIVE_ADDRESS,                                    symbol: 'AVAX',   name: 'Avalanche',     decimals: 18 },
    { address: '0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e',     symbol: 'USDC',   name: 'USD Coin',      decimals: 6  },
    { address: '0x9702230a8ea53601f5cd2dc00fdbc13d4df4a8c7',     symbol: 'USDT',   name: 'Tether USD',    decimals: 6  },
  ],
  59144: [
    { address: NATIVE_ADDRESS,                                    symbol: 'ETH',    name: 'Ether',         decimals: 18 },
    { address: '0x176211869ca2b568f2a7d4ee941e073a821ee1ff',     symbol: 'USDC',   name: 'USD Coin',      decimals: 6  },
    { address: '0xa219439258ca9da29e9cc4ce5596924745e12b93',     symbol: 'USDT',   name: 'Tether USD',    decimals: 6  },
  ],
  80094: [
    { address: NATIVE_ADDRESS,                                    symbol: 'BERA',   name: 'Berachain',     decimals: 18 },
    { address: '0x549943e04f40284185054145c6E4e9568C1D3241',     symbol: 'USDC',   name: 'USD Coin',      decimals: 6  },
  ],
  534352: [
    { address: NATIVE_ADDRESS,                                    symbol: 'ETH',    name: 'Ether',         decimals: 18 },
    { address: '0x06efdbff2a14a7c8e15944d1f4a48f9f95f663a4',     symbol: 'USDC',   name: 'USD Coin',      decimals: 6  },
    { address: '0xf55bec9cafdbe8730f096aa55dad6d22d44099df',     symbol: 'USDT',   name: 'Tether USD',    decimals: 6  },
    { address: '0x5300000000000000000000000000000000000004',     symbol: 'WETH',   name: 'Wrapped Ether', decimals: 18 },
  ],
  747: [{ address: NATIVE_ADDRESS, symbol: 'ETH',  name: 'Ether',     decimals: 18 }],
}

// Keep for WithdrawModal backwards compat
export const CHAIN_TOKENS = FALLBACK_TOKENS

// ─── Main export ──────────────────────────────────────────────────────────────
/**
 * Fetches token list via LI.FI SDK getTokens, then balances via getTokenBalances.
 *
 * IMPORTANT: The LI.FI SDK's getTokenBalances returns `amount` as a raw integer
 * string in the token's smallest unit (e.g. "1000000" = 1 USDC with 6 decimals,
 * NOT 1,000,000 USDC). We use viem's formatUnits(amount, decimals) to convert
 * to a human-readable float before displaying or using in calculations.
 *
 * Stablecoins (USDC, USDT, DAI, USDe, EURC, etc.) are formatted to 2 decimal places.
 * All other tokens (ETH, BTC, BNB, etc.) retain full meaningful precision.
 */
export async function getTokenBalancesOnChain(walletAddress, chainId) {
  if (!walletAddress || !chainId) return []

  // Step 1: Fetch token list from LI.FI SDK
  let sdkTokens = []
  try {
    const response = await getTokens({ chains: [chainId] })
    sdkTokens = response.tokens?.[chainId] ?? []
  } catch (err) {
    console.warn(`[getTokenBalancesOnChain] getTokens failed for chain ${chainId}:`, err.message)
  }

  // Fall back to static list if SDK returned nothing
  if (!sdkTokens.length) {
    const fallback = FALLBACK_TOKENS[chainId] ?? []
    sdkTokens = fallback.map(t => ({ ...t, chainId }))
  }

  // Ensure native token is present
  const hasNative = sdkTokens.some(t => isNativeToken(t.address))
  if (!hasNative) {
    const fb = (FALLBACK_TOKENS[chainId] ?? [])[0]
    if (fb) sdkTokens.unshift({ ...fb, chainId })
  }

  // Cap at 120 tokens, priority tokens first
  const PRIORITY = new Set([
    'ETH','BNB','MATIC','POL','AVAX','MON','BERA','S','MNT','CELO','xDAI',
    'USDC','USDT','DAI','USDe','USDE','EURC','WETH','WBTC','WBNB',
    'wstETH','stETH','rETH','cbBTC','WXDAI','WMATIC','cbETH',
  ])
  const sorted = [
    ...sdkTokens.filter(t => PRIORITY.has(t.symbol)),
    ...sdkTokens.filter(t => !PRIORITY.has(t.symbol)),
  ].slice(0, 120)

  // Step 2: Fetch balances via LI.FI SDK (uses wagmi EVM provider internally)
  let tokenAmounts = []
  try {
    tokenAmounts = await getTokenBalances(walletAddress, sorted)
  } catch (err) {
    console.warn(`[getTokenBalancesOnChain] getTokenBalances failed:`, err.message)
    return sorted.map(t => ({
      ...t,
      formattedBalance: isStablecoin(t.symbol) ? '0.00' : '0',
      balanceRaw: '0',
      balanceFloat: 0,
    }))
  }

  // Step 3: Merge SDK balance results with token metadata.
  // SDK `amount` is a raw integer string (smallest unit). Use formatUnits to convert.
  const balanceMap = new Map(
    tokenAmounts.map(ta => [ta.address?.toLowerCase(), ta])
  )

  const result = sorted.map(token => {
    const ta        = balanceMap.get(token.address?.toLowerCase())
    const rawAmount = ta?.amount ?? '0'
    const decimals  = typeof token.decimals === 'number' ? token.decimals : 18

    let floatVal = 0
    try {
      // formatUnits("1000000", 6) → "1.0"  (1 USDC, NOT 1,000,000 USDC)
      floatVal = parseFloat(formatUnits(BigInt(rawAmount), decimals)) || 0
    } catch {
      floatVal = 0
    }

    return {
      ...token,
      logoURI: token.logoURI ?? ta?.logoURI ?? null,
      formattedBalance: formatBalance(floatVal, token.symbol),
      balanceRaw: rawAmount,
      balanceFloat: floatVal,
    }
  })

  // Sort: tokens with balance first, then by descending balance
  return result.sort((a, b) => {
    const aHas = a.balanceFloat > 0
    const bHas = b.balanceFloat > 0
    if (aHas && !bHas) return -1
    if (!aHas && bHas) return 1
    return b.balanceFloat - a.balanceFloat
  })
}