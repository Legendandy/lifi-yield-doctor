// src/components/DepositModal.jsx
// Full Composer integration — deposit from ANY token on ANY chain into ANY vault
// One click: Composer handles swap + bridge + deposit behind the scenes

import { useState, useEffect, useRef } from 'react'
import { useAccount, useBalance, useSwitchChain, useChains } from 'wagmi'
import { useToast } from './ToastNotifications'
import { executeDeposit } from '../services/executeDeposit'

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
  81457: 'Blast',
  324: 'zkSync Era',
  1101: 'Polygon zkEVM',
}

function getChainName(chainId) {
  return CHAIN_NAMES[chainId] ?? `Chain ${chainId}`
}

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
  const chains = useChains()
  const toast = useToast()

  const vaultChainId = vault?.chainId
  const tokenAddress = getTokenAddress(vault)
  const tokenDecimals = getTokenDecimals(vault)
  const tokenSymbol = getTokenSymbol(vault)

  // Composer: user can deposit from their current chain — no need to switch
  // But we still need to be on a supported chain for the wallet tx
  const isSameChain = walletChainId === vaultChainId
  const isCrossChain = !isSameChain

  // Token balance on user's CURRENT chain (whatever they're on)
  const { data: balanceData, isLoading: balanceLoading } = useBalance({
    address,
    token: tokenAddress && tokenAddress !== '0x0000000000000000000000000000000000000000' ? tokenAddress : undefined,
    chainId: walletChainId,
  })

  // Also get native ETH balance on current chain
  const { data: nativeBalance } = useBalance({
    address,
    chainId: walletChainId,
  })

  const [amount, setAmount] = useState('')
  const [step, setStep] = useState('input') // input | approving | depositing | done | crosschain
  const [error, setError] = useState(null)
  const [crossChainTxHash, setCrossChainTxHash] = useState(null)
  const inputRef = useRef(null)

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100)
  }, [])

  const balanceFormatted = balanceData
    ? `${Number(balanceData.formatted).toFixed(4)} ${balanceData.symbol}`
    : balanceLoading ? 'Loading...' : `0 ${tokenSymbol}`

  const amountNum = parseFloat(amount) || 0
  const balanceNum = balanceData ? parseFloat(balanceData.formatted) : 0
  const hasInsufficientBalance = amountNum > 0 && amountNum > balanceNum
  const isValid = amountNum > 0 && !hasInsufficientBalance && amount.trim() !== ''

  const apy = vault?.analytics?.apy?.total
  const apyDisplay = apy != null ? `${(apy * 100).toFixed(2)}%` : 'N/A'

  function toRawAmount(humanAmount, decimals) {
    if (!humanAmount || isNaN(parseFloat(humanAmount))) return '0'
    const [whole, frac = ''] = humanAmount.toString().split('.')
    const fracPadded = frac.padEnd(decimals, '0').slice(0, decimals)
    return (BigInt(whole) * BigInt(10 ** decimals) + BigInt(fracPadded || '0')).toString()
  }

  function setMax() {
    if (balanceData) {
      const isNative = !tokenAddress || tokenAddress === '0x0000000000000000000000000000000000000000'
      if (isNative) {
        const maxAmount = Math.max(0, parseFloat(balanceData.formatted) - 0.002)
        setAmount(maxAmount > 0 ? maxAmount.toFixed(6) : '0')
      } else {
        setAmount(balanceData.formatted)
      }
    }
  }

  function setHalf() {
    if (balanceData) {
      setAmount((parseFloat(balanceData.formatted) / 2).toFixed(6))
    }
  }

  async function handleDeposit() {
    if (!isValid) return
    setError(null)

    const rawAmount = toRawAmount(amount, tokenDecimals)

    try {
      // For cross-chain: we don't need to switch. Composer handles it.
      // For same-chain: also fine, just send directly.
      setStep('approving')
      const approvingId = toast.loading('Preparing Deposit', `Building your deposit transaction via Composer...`)

      const result = await executeDeposit({
        vault,
        fromToken: vault.underlyingTokens?.[0] ?? {
          address: tokenAddress,
          decimals: tokenDecimals,
          symbol: tokenSymbol,
        },
        fromAmount: rawAmount,
        userAddress: address,
        onApprovalSent: () => {
          toast.update(approvingId, {
            type: 'loading',
            title: 'Approve Token',
            message: `Requesting approval for ${tokenSymbol}...`,
          })
        },
        onApprovalDone: () => {
          toast.update(approvingId, {
            type: 'success',
            title: 'Token Approved',
            message: `${tokenSymbol} approved`,
            duration: 2000,
          })
          setStep('depositing')
        },
        onDepositSent: (txHash) => {
          toast.dismiss(approvingId)
          if (isCrossChain) {
            toast.tx('Cross-Chain Deposit Sent', txHash, { title: 'Bridge + Deposit In Progress' })
          } else {
            toast.tx('Deposit Submitted', txHash, { title: 'Transaction Sent' })
          }
          setStep('depositing')
        },
        onCrossChainPending: (txHash) => {
          setCrossChainTxHash(txHash)
          setStep('crosschain')
        },
      })

      if (!result.isCrossChain) {
        setStep('done')
        toast.success(
          'Deposit Successful! 🎉',
          `${amount} ${tokenSymbol} deposited into ${vault.name}`,
          { duration: 8000 }
        )
        onSuccess?.({ vault, amount, txHash: result?.txHash })
      } else {
        setStep('crosschain')
        setCrossChainTxHash(result.txHash)
      }
    } catch (err) {
      const msg = err?.message ?? ''
      const isRejected = msg.toLowerCase().includes('user rejected') ||
        msg.toLowerCase().includes('user denied') ||
        msg.toLowerCase().includes('rejected')

      setStep('input')

      if (isRejected) {
        toast.error('Transaction Rejected', 'You cancelled the transaction.')
        setError('Transaction was rejected.')
      } else if (msg.includes('No routes found') || msg.includes('no routes')) {
        toast.error('No Route Found', 'This vault may not support deposits from your current token/chain.')
        setError('No deposit route found. Try switching to the vault\'s native chain.')
      } else if (msg.includes('insufficient')) {
        toast.error('Insufficient Balance', 'Not enough tokens for this deposit.')
        setError('Insufficient balance.')
      } else {
        toast.error('Deposit Failed', msg.slice(0, 120))
        setError(msg.slice(0, 120))
      }
    }
  }

  const isBusy = step === 'approving' || step === 'depositing'

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={!isBusy ? onClose : undefined}
      />

      <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-surface-container">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-headline font-extrabold text-xl text-on-surface">Deposit</h2>
              <p className="text-xs text-on-surface-variant mt-0.5 font-medium">{vault?.name}</p>
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

          {/* Composer cross-chain badge */}
          {isCrossChain && step !== 'done' && step !== 'crosschain' && (
            <div className="flex items-center gap-3 p-3 bg-on-tertiary-container/5 border border-on-tertiary-container/20 rounded-xl">
              <span className="material-symbols-outlined text-on-tertiary-container text-[18px] shrink-0">bolt</span>
              <div>
                <p className="font-bold text-sm text-on-surface">Cross-Chain via Composer</p>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  Depositing from {getChainName(walletChainId)} → {getChainName(vaultChainId)}. Composer handles bridge + deposit in one transaction.
                </p>
              </div>
            </div>
          )}

          {/* Amount input */}
          {step !== 'done' && step !== 'crosschain' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">
                  Amount ({balanceData?.symbol ?? tokenSymbol})
                </label>
                <span className="text-xs text-on-surface-variant font-medium">
                  Balance: {balanceFormatted}
                </span>
              </div>

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
                  onChange={e => { setError(null); setAmount(e.target.value) }}
                  placeholder="0.00"
                  disabled={isBusy}
                  className="flex-1 px-4 py-3.5 bg-transparent text-xl font-headline font-black text-on-surface outline-none placeholder:text-on-surface-variant/40 disabled:opacity-50"
                />
                <div className="flex items-center gap-1 pr-3">
                  <button onClick={setHalf} disabled={isBusy || !balanceData}
                    className="px-2 py-1 text-[10px] font-black uppercase tracking-wider text-on-surface-variant bg-surface-container rounded-lg hover:bg-surface-container-high transition-colors disabled:opacity-40">
                    50%
                  </button>
                  <button onClick={setMax} disabled={isBusy || !balanceData}
                    className="px-2 py-1 text-[10px] font-black uppercase tracking-wider text-on-tertiary-container bg-on-tertiary-container/10 rounded-lg hover:bg-on-tertiary-container/20 transition-colors disabled:opacity-40">
                    MAX
                  </button>
                </div>
              </div>

              {hasInsufficientBalance && (
                <div className="flex items-center gap-2 text-red-600">
                  <span className="material-symbols-outlined text-[14px]">error</span>
                  <p className="text-xs font-bold">
                    Insufficient balance. You have {balanceData ? Number(balanceData.formatted).toFixed(4) : '0'} {balanceData?.symbol ?? tokenSymbol}.
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

          {/* Busy status */}
          {isBusy && (
            <div className="space-y-2">
              <StepIndicator label="Build Composer Route" status={step === 'approving' ? 'active' : 'done'} />
              <StepIndicator label="Approve Token" status={step === 'approving' ? 'active' : step === 'depositing' ? 'done' : 'pending'} />
              <StepIndicator label="Submit Deposit" status={step === 'depositing' ? 'active' : 'pending'} />
            </div>
          )}

          {/* Cross-chain pending */}
          {step === 'crosschain' && (
            <div className="text-center space-y-4 py-4">
              <div className="w-16 h-16 bg-on-tertiary-container/10 rounded-full flex items-center justify-center mx-auto">
                <span className="material-symbols-outlined text-on-tertiary-container text-3xl animate-spin">autorenew</span>
              </div>
              <h3 className="font-headline font-extrabold text-xl text-on-surface">Cross-Chain In Progress</h3>
              <p className="text-sm text-on-surface-variant">
                Your deposit is bridging from {getChainName(walletChainId)} to {getChainName(vaultChainId)}. This takes 1–5 minutes.
              </p>
              {crossChainTxHash && (
                <a
                  href={`https://explorer.li.fi/?txHash=${crossChainTxHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-on-tertiary-container font-bold hover:underline"
                >
                  <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                  Track on LI.FI Explorer
                </a>
              )}
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
          {step !== 'done' && step !== 'crosschain' ? (
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
                  {step === 'approving' && 'Preparing...'}
                  {step === 'depositing' && 'Depositing...'}
                </>
              ) : isCrossChain ? (
                <>
                  <span className="material-symbols-outlined text-[18px]">bolt</span>
                  Deposit {amount ? `${amount} ${balanceData?.symbol ?? tokenSymbol}` : ''} via Composer
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[18px]">add_circle</span>
                  Deposit {amount ? `${amount} ${tokenSymbol}` : ''}
                </>
              )}
            </button>
          ) : step === 'crosschain' ? (
            <button
              onClick={() => { onSuccess?.({ vault, amount }); onClose() }}
              className="w-full py-4 rounded-2xl font-headline font-black text-base bg-surface-container text-on-surface-variant hover:bg-surface-container-high transition-all"
            >
              Close (Bridge Continuing)
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