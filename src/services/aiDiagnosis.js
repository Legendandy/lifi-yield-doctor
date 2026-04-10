// src/services/aiDiagnosis.js
const ANTHROPIC_API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY

export async function getDiagnosis({ positions, availableVaults, isNewUser }) {
  // Build data-grounded context — AI can ONLY reference numbers that appear here
  const positionSummary = isNewUser
    ? 'User has no active vault positions.'
    : positions.map(p =>
        `- ${p.asset?.symbol} via ${p.protocolName}: $${p.balanceUsd} balance`
      ).join('\n')

  const vaultSummary = availableVaults.slice(0, 5).map(v => {
    const apy = v.analytics.apy.total != null
      ? `${(v.analytics.apy.total * 100).toFixed(2)}%` : 'N/A'
    const apy30d = v.analytics.apy30d != null
      ? `${(v.analytics.apy30d * 100).toFixed(2)}%` : 'N/A'
    const drift30d = v.analytics.apy.total && v.analytics.apy30d
      ? `${(((v.analytics.apy.total - v.analytics.apy30d) / v.analytics.apy30d) * 100).toFixed(1)}%`
      : 'N/A'
    const tvlM = (Number(v.analytics.tvl.usd) / 1e6).toFixed(1)
    return `- ${v.name} (${v.protocol.name}): APY ${apy}, 30d avg ${apy30d}, 30d drift ${drift30d}, TVL $${tvlM}M`
  }).join('\n')

  const prompt = `You are Yield Doctor, a DeFi yield advisor. Your diagnosis must ONLY reference numbers and vault names listed below. Do not invent any figures.

${isNewUser ? "User's situation: No vault positions." : "User's current positions:"}
${positionSummary}

Available vaults (real data):
${vaultSummary}

${isNewUser
  ? 'In 2-3 sentences: Recommend the single best vault from the list above. Reference its exact APY and explain why.'
  : 'In 2-3 sentences: Are the user\'s positions competitive? Is there a better option? Reference exact vault names and APY numbers from the data above.'
}

Be specific, grounded, and concise.`

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!response.ok) throw new Error(`AI API error: ${response.status}`)
  const data = await response.json()
  return data.content[0].text
}