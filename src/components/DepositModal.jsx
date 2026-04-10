// src/components/DepositModal.jsx
import { useState, useEffect, useRef } from 'react'
import { useAccount, useBalance, useSwitchChain } from 'wagmi'
import { useToast } from './ToastNotifications'
import { executeDeposit } from '../services/executeDeposit'

// Chain ID → name map for display
const CHAIN_NAMES = {
  1: 'Ethereum',
  10: 'Optimism',
  56: 'BNB Chain',
  100: 'Gnosis',
  137: 'Polygon',
  250: 'Fantom',
  8453: 'Base',
  42161: 'Arbitrum',
  43114: 'Avalanche',
  59144: 'Linea',
  534352: 'Scroll',
  7777777: 'Zora',
}

function getChainName(chainId) {
  return CHAIN_NAMES[chainId] ?? `Chain ${chainId}`
}

// Format a token amount for display
function formatTokenAmount(raw, decimals = 18) {
  if (!raw) return '0'
  const n = Number(BigInt(raw)) / Math.pow(10, decimals)
  if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 })
  if (n >= 1) return n.toFixed(4)
  if (n >= 0.0001) return n.toFixed(6)
  return n.toExponential(2)
}

// Attempt to parse decimals from the underlying token
function getTokenDecimals(vault) {
  return vault?.underlyingTokens?.[0]?.decimals ?? 18
}

function getTokenAddress(vault) {
  return vault?.underlyingTokens?.[0]?.address ?? null
}

function getTokenSymbol(vault) {
  return vault?.underlyingTokens?.[0]?.symbol ?? 'tokens'
}

export default function DepositModal({ vault, onClose, onSuccess }) {
  const { address, chainId: walletChainId } = useAccount()
  const { switchChainAsync } = useSwitchChain()
  const toast = useToast()

  const vaultChainId = vault?.chainId
  const tokenAddress = getTokenAddress(vault)
  const tokenDecimals = getTokenDecimals(vault)
  const tokenSymbol = getTokenSymbol(vault)
  const needsChainSwitch = walletChainId !== vaultChainId

  // Get user's balance of the underlying token
  const { data: balanceData, isLoading: balanceLoading } = useBalance({
    address,
    token: tokenAddress && tokenAddress !== '0x0000000000000000000000000000000000000000' ? tokenAddress : undefined,
    chainId: vaultChainId,
  })

  const [amount, setAmount] = useState('')
  const [step, setStep] = useState('input') // input | switching | approving | depositing | done
  const [error, setError] = useState(null)
  const inputRef = useRef(null)

  useEffect(() => {
    // Focus input on open
    setTimeout(() => inputRef.current?.focus(), 100)
  }, [])

  // Derived values
  const balanceRaw = balanceData?.value ?? 0n
  const balanceFormatted = balanceData
    ? `${Number(balanceData.formatted).toFixed(4)} ${balanceData.symbol}`
    : balanceLoading ? 'Loading...' : `0 ${tokenSymbol}`

  const amountNum = parseFloat(amount) || 0
  const balanceNum = balanceData ? parseFloat(balanceData.formatted) : 0
  const hasInsufficientBalance = amountNum > 0 && amountNum > balanceNum
  const isValid = amountNum > 0 && !hasInsufficientBalance && amount.trim() !== ''

  // Convert human amount → raw (with decimals)
  function toRawAmount(humanAmount, decimals) {
    if (!humanAmount || isNaN(parseFloat(humanAmount))) return '0'
    // Use BigInt math to avoid floating point issues
    const [whole, frac = ''] = humanAmount.toString().split('.')
    const fracPadded = frac.padEnd(decimals, '0').slice(0, decimals)
    return (BigInt(whole) * BigInt(10 ** decimals) + BigInt(fracPadded || '0')).toString()
  }

  function setMax() {
    if (balanceData) {
      // Leave a tiny bit for gas if it's a native token
      const isNative = !tokenAddress || tokenAddress === '0x0000000000000000000000000000000000000000'
      if (isNative) {
        const gasBuffer = 0.002
        const maxAmount = Math.max(0, parseFloat(balanceData.formatted) - gasBuffer)
        setAmount(maxAmount > 0 ? maxAmount.toFixed(6) : '0')
      } else {
        setAmount(balanceData.formatted)
      }
    }
  }

  function setHalf() {
    if (balanceData) {
      const half = parseFloat(balanceData.formatted) / 2
      setAmount(half.toFixed(6))
    }
  }

  async function handleDeposit() {
    if (!isValid) return
    setError(null)

    try {
      // Step 1: Switch chain if needed
      if (needsChainSwitch) {
        setStep('switching')
        const switchId = toast.loading(
          'Switching Network',
          `Switching to ${getChainName(vaultChainId)}...`
        )
        try {
          await switchChainAsync({ chainId: vaultChainId })
          toast.update(switchId, {
            type: 'success',
            title: 'Network Switched',
            message: `Now on ${getChainName(vaultChainId)}`,
            duration: 3000,
          })
        } catch (switchErr) {
          toast.update(switchId, {
            type: 'error',
            title: 'Switch Failed',
            message: switchErr?.message?.includes('User rejected')
              ? 'You rejected the network switch.'
              : `Failed to switch to ${getChainName(vaultChainId)}.`,
            duration: 5000,
          })
          setStep('input')
          setError('Please switch to ' + getChainName(vaultChainId) + ' in your wallet.')
          return
        }
      }

      // Step 2: Approval (if needed — handled inside executeDeposit)
      setStep('approving')
      const approvingId = toast.loading('Approving Token', `Requesting approval for ${tokenSymbol}...`)

      const rawAmount = toRawAmount(amount, tokenDecimals)

      let result
      try {
        result = await executeDeposit({
          vault,
          fromToken: vault.underlyingTokens?.[0] ?? { address: tokenAddress, decimals: tokenDecimals, symbol: tokenSymbol },
          fromAmount: rawAmount,
          userAddress: address,
          onApprovalSent: () => {
            toast.update(approvingId, {
              type: 'loading',
              title: 'Approval Sent',
              message: 'Waiting for approval confirmation...',
            })
          },
          onApprovalDone: () => {
            toast.update(approvingId, {
              type: 'success',
              title: 'Token Approved',
              message: `${tokenSymbol} approved for deposit`,
              duration: 3000,
            })
            setStep('depositing')
          },
          onDepositSent: (txHash) => {
            toast.dismiss(approvingId)
            toast.tx('Deposit Submitted', txHash, { title: 'Transaction Sent' })
            setStep('depositing')
          },
        })
      } catch (depositErr) {
        toast.dismiss(approvingId)
        const msg = depositErr?.message ?? ''
        const isRejected = msg.toLowerCase().includes('user rejected') || msg.toLowerCase().includes('user denied') || msg.toLowerCase().includes('rejected')
        if (isRejected) {
          toast.error('Transaction Rejected', 'You cancelled the transaction.')
        } else if (msg.includes('No routes found') || msg.includes('no routes')) {
          toast.error('No Route Found', 'This vault may not support deposits from this token/chain combination.')
        } else if (msg.includes('insufficient')) {
          toast.error('Insufficient Balance', 'You don\'t have enough tokens for this deposit.')
        } else {
          toast.error('Deposit Failed', msg.slice(0, 120))
        }
        setStep('input')
        setError(isRejected ? 'Transaction was rejected.' : 'Deposit failed. ' + msg.slice(0, 100))
        return
      }

      // Success!
      setStep('done')
      toast.success(
        'Deposit Successful! 🎉',
        `${amount} ${tokenSymbol} deposited into ${vault.name}`,
        { duration: 8000 }
      )
      onSuccess?.({ vault, amount, txHash: result?.txHash })

    } catch (err) {
      setStep('input')
      setError(err?.message ?? 'Unknown error')
      toast.error('Error', err?.message ?? 'Something went wrong')
    }
  }

  const isBusy = step === 'switching' || step === 'approving' || step === 'depositing'

  const apy = vault?.analytics?.apy?.total
  const apyDisplay = apy != null ? `${(apy * 100).toFixed(2)}%` : 'N/A'

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={!isBusy ? onClose : undefined}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden animate-in">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-surface-container">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-headline font-extrabold text-xl text-on-surface">
                Deposit
              </h2>
              <p className="text-xs text-on-surface-variant mt-0.5 font-medium">
                {vault?.name}
              </p>
            </div>
            <button
              onClick={onClose}
              disabled={isBusy}
              className="w-8 h-8 rounded-full bg-surface-container hover:bg-surface-container-high flex items-center justify-center transition-colors disabled:opacity-40"
            >
              <span className="material-symbols-outlined text-[16px] text-on-surface-variant">close</span>
            </button>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* Vault summary */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-surface-container rounded-xl p-3 text-center">
              <p className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant mb-1">APY</p>
              <p className="font-headline font-black text-lg text-on-tertiary-container">{apyDisplay}</p>
            </div>
            <div className="bg-surface-container rounded-xl p-3 text-center">
              <p className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant mb-1">Protocol</p>
              <p className="font-bold text-sm text-on-surface truncate">{vault?.protocol?.name}</p>
            </div>
            <div className="bg-surface-container rounded-xl p-3 text-center">
              <p className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant mb-1">Network</p>
              <p className="font-bold text-sm text-on-surface truncate">{getChainName(vaultChainId)}</p>
            </div>
          </div>

          {/* Chain switch warning */}
          {needsChainSwitch && step !== 'done' && (
            <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
              <span className="material-symbols-outlined text-amber-500 text-[18px] shrink-0 mt-0.5">swap_horiz</span>
              <div>
                <p className="font-bold text-sm text-amber-800">Network Switch Required</p>
                <p className="text-xs text-amber-700 mt-0.5">
                  You're on {getChainName(walletChainId)}. Depositing will auto-switch to {getChainName(vaultChainId)}.
                </p>
              </div>
            </div>
          )}

          {/* Amount input */}
          {step !== 'done' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">
                  Amount ({tokenSymbol})
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-on-surface-variant font-medium">
                    Balance: {balanceFormatted}
                  </span>
                </div>
              </div>

              {/* Input box */}
              <div className={`relative flex items-center border-2 rounded-xl transition-all ${
                hasInsufficientBalance
                  ? 'border-red-400 bg-red-50'
                  : amount && !hasInsufficientBalance
                  ? 'border-on-tertiary-container/50 bg-surface-container-low'
                  : 'border-surface-container-high bg-surface-container-low hover:border-primary-container/40'
              }`}>
                <input
                  ref={inputRef}
                  type="number"
                  min="0"
                  step="any"
                  value={amount}
                  onChange={e => {
                    setError(null)
                    setAmount(e.target.value)
                  }}
                  placeholder="0.00"
                  disabled={isBusy}
                  className="flex-1 px-4 py-3.5 bg-transparent text-xl font-headline font-black text-on-surface outline-none placeholder:text-on-surface-variant/40 disabled:opacity-50"
                />
                <div className="flex items-center gap-1 pr-3">
                  <button
                    onClick={setHalf}
                    disabled={isBusy || !balanceData}
                    className="px-2 py-1 text-[10px] font-black uppercase tracking-wider text-on-surface-variant bg-surface-container rounded-lg hover:bg-surface-container-high transition-colors disabled:opacity-40"
                  >
                    50%
                  </button>
                  <button
                    onClick={setMax}
                    disabled={isBusy || !balanceData}
                    className="px-2 py-1 text-[10px] font-black uppercase tracking-wider text-on-tertiary-container bg-on-tertiary-container/10 rounded-lg hover:bg-on-tertiary-container/20 transition-colors disabled:opacity-40"
                  >
                    MAX
                  </button>
                </div>
              </div>

              {/* Validation messages */}
              {hasInsufficientBalance && (
                <div className="flex items-center gap-2 text-red-600">
                  <span className="material-symbols-outlined text-[14px]">error</span>
                  <p className="text-xs font-bold">
                    Insufficient balance. You have {balanceData ? Number(balanceData.formatted).toFixed(4) : '0'} {tokenSymbol}.
                  </p>
                </div>
              )}

              {/* Projected earnings */}
              {isValid && apy != null && (
                <div className="flex items-center justify-between p-2.5 bg-on-tertiary-container/5 rounded-xl border border-on-tertiary-container/10">
                  <p className="text-xs text-on-surface-variant font-medium">Projected earnings</p>
                  <div className="text-right">
                    <p className="text-xs font-black text-on-tertiary-container">
                      +{(amountNum * apy / 12).toFixed(4)} {tokenSymbol}/mo
                    </p>
                    <p className="text-[10px] text-on-surface-variant">
                      +{(amountNum * apy).toFixed(4)} {tokenSymbol}/yr
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Error message */}
          {error && step !== 'done' && (
            <div className="flex items-start gap-2 p-3 bg-error-container/20 border border-error-container rounded-xl">
              <span className="material-symbols-outlined text-error text-[16px] shrink-0 mt-0.5">error</span>
              <p className="text-xs font-medium text-on-error-container">{error}</p>
            </div>
          )}

          {/* Status during transaction */}
          {isBusy && (
            <div className="space-y-2">
              <StepIndicator
                label="Switch Network"
                status={step === 'switching' ? 'active' : (step === 'approving' || step === 'depositing' || !needsChainSwitch) ? 'done' : 'pending'}
                skip={!needsChainSwitch}
              />
              <StepIndicator
                label="Approve Token"
                status={step === 'approving' ? 'active' : step === 'depositing' ? 'done' : 'pending'}
              />
              <StepIndicator
                label="Submit Deposit"
                status={step === 'depositing' ? 'active' : 'pending'}
              />
            </div>
          )}

          {/* Done state */}
          {step === 'done' && (
            <div className="text-center space-y-3 py-4">
              <div className="w-16 h-16 bg-on-tertiary-container/10 rounded-full flex items-center justify-center mx-auto">
                <span className="material-symbols-outlined text-on-tertiary-container text-3xl">check_circle</span>
              </div>
              <h3 className="font-headline font-extrabold text-xl text-on-surface">Deposit Complete!</h3>
              <p className="text-sm text-on-surface-variant">
                {amount} {tokenSymbol} is now earning {apyDisplay} APY in {vault?.name}.
              </p>
            </div>
          )}

          {/* Action button */}
          {step !== 'done' ? (
            <button
              onClick={handleDeposit}
              disabled={!isValid || isBusy}
              className={`w-full py-4 rounded-2xl font-headline font-black text-base transition-all flex items-center justify-center gap-2
                ${isValid && !isBusy
                  ? 'bg-primary-container text-white hover:opacity-90 shadow-md'
                  : 'bg-surface-container text-on-surface-variant cursor-not-allowed'
                }
              `}
            >
              {isBusy ? (
                <>
                  <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
                  {step === 'switching' && 'Switching Network...'}
                  {step === 'approving' && 'Approving Token...'}
                  {step === 'depositing' && 'Depositing...'}
                </>
              ) : needsChainSwitch ? (
                <>
                  <span className="material-symbols-outlined text-[18px]">swap_horiz</span>
                  Switch & Deposit
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[18px]">add_circle</span>
                  Deposit {amount ? `${amount} ${tokenSymbol}` : ''}
                </>
              )}
            </button>
          ) : (
            <button
              onClick={onClose}
              className="w-full py-4 rounded-2xl font-headline font-black text-base bg-on-tertiary-container text-white hover:opacity-90 transition-all"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function StepIndicator({ label, status, skip }) {
  if (skip) return null
  return (
    <div className={`flex items-center gap-3 p-2.5 rounded-xl transition-all ${
      status === 'active' ? 'bg-primary-container/5 border border-primary-container/20' :
      status === 'done' ? 'opacity-50' : 'opacity-30'
    }`}>
      {status === 'active' ? (
        <span className="material-symbols-outlined text-primary-container text-[16px] animate-spin">progress_activity</span>
      ) : status === 'done' ? (
        <span className="material-symbols-outlined text-on-tertiary-container text-[16px]">check_circle</span>
      ) : (
        <span className="material-symbols-outlined text-on-surface-variant text-[16px]">radio_button_unchecked</span>
      )}
      <p className={`text-sm font-bold ${status === 'active' ? 'text-on-surface' : 'text-on-surface-variant'}`}>
        {label}
      </p>
    </div>
  )
}