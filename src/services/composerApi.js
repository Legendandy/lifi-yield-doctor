const COMPOSER_BASE_URL = 'https://li.quest'

// Get a deposit quote from Composer
// fromToken: the token the user holds (e.g. USDC address)
// toToken: the vault contract address
// fromAmount: amount in smallest unit (mind decimals!)
export async function getDepositQuote({ fromChain, toChain, fromToken, toToken, fromAddress, fromAmount }) {
  const params = new URLSearchParams({
    fromChain: String(fromChain),
    toChain: String(toChain),
    fromToken,
    toToken,
    fromAddress,
    toAddress: fromAddress,
    fromAmount: String(fromAmount),
  })

  const res = await fetch(`${COMPOSER_BASE_URL}/v1/quote?${params}`)
  return res.json() // contains transactionRequest + estimate.approvalAddress
}

// Poll status for cross-chain transactions
export async function getTransactionStatus(txHash, fromChain, toChain) {
  const params = new URLSearchParams({
    txHash,
    fromChain: String(fromChain),
    toChain: String(toChain),
  })
  const res = await fetch(`${COMPOSER_BASE_URL}/v1/status?${params}`)
  return res.json()
}