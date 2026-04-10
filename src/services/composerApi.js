// src/services/composerApi.js
// Uses Vite dev proxy (/lifi-api → https://li.quest) to avoid CORS issues
const BASE = '/lifi-api'

export async function getDepositQuote({
  fromChain,
  toChain,
  fromToken,
  toToken,
  fromAddress,
  fromAmount,
}) {
  const params = new URLSearchParams({
    fromChain: String(fromChain),
    toChain: String(toChain),
    fromToken,
    toToken,
    fromAddress,
    toAddress: fromAddress,
    fromAmount: String(fromAmount),
  })

  const res = await fetch(`${BASE}/v1/quote?${params}`)
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Quote API ${res.status}: ${text}`)
  }
  return res.json()
}

export async function getTransactionStatus(txHash, fromChain, toChain) {
  const params = new URLSearchParams({
    txHash,
    fromChain: String(fromChain),
    toChain: String(toChain),
  })
  const res = await fetch(`${BASE}/v1/status?${params}`)
  if (!res.ok) throw new Error(`Status API ${res.status}`)
  return res.json()
}