// src/services/aiDiagnosis.js
const FIREWORKS_API_KEY = import.meta.env.VITE_FIREWORKS_API_KEY

export async function getDiagnosis({ positions, availableVaults, isNewUser, bestCrossChainVault }) {
  const positionSummary = isNewUser
    ? 'User has no active vault positions.'
    : positions.map(p =>
        `- ${p.asset?.symbol} via ${p.protocolName}: $${Number(p.balanceUsd || 0).toLocaleString()} balance`
      ).join('\n')

  // Build a vault summary from the top available vaults on current chain
  const vaultSummary = availableVaults.slice(0, 5).map(v => {
    const apy = v.analytics.apy.total != null
      ? `${(v.analytics.apy.total * 100).toFixed(2)}%` : 'N/A'
    const apy30d = v.analytics.apy30d != null
      ? `${(v.analytics.apy30d * 100).toFixed(2)}%` : 'N/A'
    const tvlM = (Number(v.analytics.tvl.usd) / 1e6).toFixed(1)
    const chainName = v._chainName ?? v.network ?? `Chain ${v.chainId}`
    return `- ${v.name} on ${chainName} (${v.protocol.name}): APY ${apy}, 30d avg ${apy30d}, TVL $${tvlM}M`
  }).join('\n')

  // Best vault across all chains
  let bestVaultLine = ''
  if (bestCrossChainVault) {
    const bApy = bestCrossChainVault.analytics?.apy?.total != null
      ? `${(bestCrossChainVault.analytics.apy.total * 100).toFixed(2)}%`
      : 'N/A'
    const bChain = bestCrossChainVault._chainName ?? bestCrossChainVault.network ?? `Chain ${bestCrossChainVault.chainId}`
    const bTvl = (Number(bestCrossChainVault.analytics?.tvl?.usd ?? 0) / 1e6).toFixed(1)
    bestVaultLine = `\nBEST VAULT ACROSS ALL CHAINS: ${bestCrossChainVault.name} on ${bChain} (${bestCrossChainVault.protocol?.name}): APY ${bApy}, TVL $${bTvl}M`
  }

  const prompt = `You are Yield Doctor, a DeFi yield advisor. Your diagnosis must ONLY reference numbers, vault names, and chain names listed below. Do not invent any figures.

${isNewUser ? "User's situation: No vault positions." : "User's current positions:"}
${positionSummary}

Top available vaults:
${vaultSummary}
${bestVaultLine}

${isNewUser
  ? `In 2-3 sentences: Tell the user the single best vault they should deposit into. You MUST name the exact vault, the exact chain it is on, and the exact APY from the data above. Start with "The best vault right now is [VAULT NAME] on [CHAIN NAME] with an APY of [X]%."`
  : `In 2-3 sentences: Are the user's positions competitive? You MUST reference the best cross-chain vault by its exact name, chain, and APY. If a better option exists, name it explicitly. Reference exact vault names and APY numbers from the data above.`
}

Be specific, grounded, and concise. Never use placeholder names.`

  const response = await fetch('https://api.fireworks.ai/inference/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${FIREWORKS_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'accounts/fireworks/models/qwen3-vl-30b-a3b-instruct',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!response.ok) throw new Error(`AI API error: ${response.status}`)
  const data = await response.json()
  return data.choices[0].message.content
}