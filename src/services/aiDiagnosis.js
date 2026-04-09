const ANTHROPIC_API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY

// Takes positions (or idle balances) + available vaults + risk mode
// Returns a plain-English diagnosis string from Claude
export async function getDiagnosis({ positions, availableVaults, riskMode, isNewUser }) {
  const positionSummary = isNewUser
    ? `The user has no vault positions. They have idle tokens in their wallet.`
    : positions.map(p =>
        `${p.asset.symbol} on chain ${p.chainId} via ${p.protocolName}: $${p.balanceUsd} balance`
      ).join('\n')

  const vaultSummary = availableVaults.slice(0, 5).map(v => {
    const apy = v.analytics.apy.total != null
      ? (v.analytics.apy.total * 100).toFixed(2) + '%'
      : 'N/A'
    const apy30d = v.analytics.apy30d != null
      ? (v.analytics.apy30d * 100).toFixed(2) + '%'
      : 'N/A'
    return `${v.name} (${v.protocol.name}) — APY: ${apy}, 30d avg: ${apy30d}, TVL: $${Number(v.analytics.tvl.usd).toLocaleString()}`
  }).join('\n')

  const prompt = `You are Yield Doctor, a DeFi yield advisor. Be concise, direct, and helpful. 2-4 sentences max.

User's risk preference: ${riskMode.toUpperCase()}

${isNewUser ? 'User has no vault positions. Recommend where to start.' : "User's current positions:"}
${positionSummary}

Best available vaults right now (filtered for their risk preference):
${vaultSummary}

${isNewUser
  ? 'Tell the user what token they have sitting idle and recommend the single best vault from the list above. Be specific about APY and why it suits their risk preference.'
  : 'Diagnose their current positions. Are they in good vaults? Are better options available? Be specific with vault names and APY numbers. Keep it to 2-4 sentences.'
}`

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

  const data = await response.json()
  return data.content[0].text
}