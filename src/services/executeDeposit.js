import { ethers } from 'ethers'
import { getDepositQuote } from './composerApi'

const ERC20_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
]

// Main deposit function — handles approval + deposit in sequence
export async function executeDeposit({ vault, fromToken, fromAmount, userAddress }) {
  const provider = new ethers.BrowserProvider(window.ethereum)
  const signer = await provider.getSigner()

  // Step 1: Get a Composer quote
  const quote = await getDepositQuote({
    fromChain: vault.chainId,
    toChain: vault.chainId,
    fromToken: fromToken.address,
    toToken: vault.address, // vault contract address is the toToken
    fromAddress: userAddress,
    fromAmount: String(fromAmount),
  })

  if (quote.message) {
    throw new Error(`Quote error: ${quote.message}`)
  }

  // Step 2: Handle token approval (skip for native ETH)
  const isNative = fromToken.address === ethers.ZeroAddress
  if (!isNative) {
    const erc20 = new ethers.Contract(fromToken.address, ERC20_ABI, signer)
    const owner = await signer.getAddress()
    const spender = quote.estimate.approvalAddress // always use from API, never hardcode
    const currentAllowance = await erc20.allowance(owner, spender)

    if (currentAllowance < BigInt(fromAmount)) {
      const approveTx = await erc20.approve(spender, fromAmount)
      await approveTx.wait()
    }
  }

  // Step 3: Send the deposit transaction
  const tx = await signer.sendTransaction(quote.transactionRequest)
  console.log('Transaction sent:', tx.hash)

  const receipt = await tx.wait()
  console.log('Confirmed in block:', receipt.blockNumber)

  return { txHash: tx.hash, receipt }
}