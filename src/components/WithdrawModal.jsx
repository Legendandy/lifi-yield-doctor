// src/components/WithdrawModal.jsx
// Fixed: no chain warning banner, auto network switch, zero balance guard

import { useState, useEffect, useRef } from 'react'
import { useAccount, useSwitchChain } from 'wagmi'
import { useToast } from './ToastNotifications'
import { executeWithdraw } from '../services/executeWithdraw'

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

function getTokenSymbol(vault) {
  return vault?.underlyingTokens?.[0]?.symbol ?? 'tokens'
}

function getTokenDecimals(vault) {
  return vault?.underlyingTokens?.[0]?.decimals ?? 18
}

export default function WithdrawModal({ vault, position, onClose, onSuccess }) {
  const { address, chainId: walletChainId } = useAccount()
  const { switchChainAsync } = useSwitchChain()
  const toast = useToast()

  const vaultChainId = vault?.chainId ?? position?.chainId
  const tokenSymbol = getTokenSymbol(vault)
  const needsChainSwitch = walletChainId !== vaultChainId

  const positionBalanceUsd = position?.balanceUsd ?? vault?._positionBalanceUsd ?? 0
  const positionBalance = position?.balance ?? vault?._positionBalance ?? null
  const positionBalanceFormatted = positionBalance
    ? Number(positionBalance).toFixed(4)
    : positionBalanceUsd > 0
    ? `~$${Number(positionBalanceUsd).toLocaleString()}`
    : '0'

  const maxBalance = positionBalance ? parseFloat(positionBalance) : 0
  const hasZeroBalance = maxBalance === 0 && (!positionBalanceUsd || positionBalanceUsd <= 0)

  const [amount, setAmount] = useState('')
  const [withdrawType, setWithdrawType] = useState('partial')
  const [step, setStep] = useState('input')
  const [error, setError] = useState(null)
  const inputRef = useRef(null)

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100)
  }, [])

  const amountNum = parseFloat(amount) || 0
  const hasInsufficientBalance = maxBalance > 0 && amountNum > 0 && amountNum > maxBalance
  const hasEnteredZero = amountNum <= 0 && amount.trim() !== ''

  // Validation: partial requires positive amount within balance
  // full requires non-zero balance
  const isValidPartial = withdrawType === 'partial' && amountNum > 0 && !hasInsufficientBalance && amount.trim() !== '' && maxBalance > 0
  const isValidFull = withdrawType === 'full' && !hasZeroBalance
  const isValid = isValidPartial || isValidFull

  const isBusy = step === 'switching' || step === 'withdrawing'
  const apy = vault?.analytics?.apy?.total
  const apyDisplay = apy != null ? `${(apy * 100).toFixed(2)}%` : 'N/A'

  function setMax() {
    if (maxBalance > 0) setAmount(maxBalance.toFixed(6))
  }

  function setHalf() {
    if (maxBalance > 0) setAmount((maxBalance / 2).toFixed(6))
  }

  function toRawAmount(humanAmount, decimals) {
    if (!humanAmount || isNaN(parseFloat(humanAmount))) return '0'
    const [whole, frac = ''] = humanAmount.toString().split('.')
    const fracPadded = frac.padEnd(decimals, '0').slice(0, decimals)
    return (BigInt(whole) * BigInt(10 ** decimals) + BigInt(fracPadded || '0')).toString()
  }

  async function handleWithdraw() {
    if (!isValid) return
    setError(null)

    try {
      // Step 1: Auto-switch chain if needed (silent, no warning banner)
      if (needsChainSwitch) {
        setStep('switching')
        try {
          await switchChainAsync({ chainId: vaultChainId })
        } catch (switchErr) {
          setStep('input')
          const rejected = switchErr?.message?.toLowerCase().includes('user rejected')
          setError(rejected
            ? 'Please approve the network switch in your wallet.'
            : `Could not switch to ${getChainName(vaultChainId)}.`)
          toast.error('Network Switch Failed',
            rejected ? 'You rejected the network switch.' : `Failed to switch to ${getChainName(vaultChainId)}.`)
          return
        }
      }

      setStep('withdrawing')
      const decimals = getTokenDecimals(vault)
      const isFullWithdraw = withdrawType === 'full'
      const rawAmount = isFullWithdraw
        ? (positionBalance ? toRawAmount(positionBalance, decimals) : '0')
        : toRawAmount(amount, decimals)

      const withdrawId = toast.loading(
        'Processing Withdrawal',
        isFullWithdraw ? 'Withdrawing all funds...' : `Withdrawing ${amount} ${tokenSymbol}...`
      )

      let result
      try {
        result = await executeWithdraw({
          vault,
          userAddress: address,
          amount: rawAmount,
          isFullWithdraw,
          onTxSent: (txHash) => {
            toast.dismiss(withdrawId)
            toast.tx('Withdrawal Submitted', txHash, { title: 'Transaction Sent' })
          },
        })
      } catch (withdrawErr) {
        toast.dismiss(withdrawId)
        const msg = withdrawErr?.message ?? ''
        const isRejected = msg.toLowerCase().includes('user rejected') ||
          msg.toLowerCase().includes('user denied') ||
          msg.toLowerCase().includes('rejected')
        if (isRejected) {
          toast.error('Transaction Rejected', 'You cancelled the withdrawal.')
        } else {
          toast.error('Withdrawal Failed', msg.slice(0, 120))
        }
        setStep('input')
        setError(isRejected ? 'Transaction was rejected.' : 'Withdrawal failed. ' + msg.slice(0, 100))
        return
      }

      setStep('done')
      toast.success(
        'Withdrawal Successful! 🎉',
        isFullWithdraw
          ? `All funds withdrawn from ${vault?.name}`
          : `${amount} ${tokenSymbol} withdrawn from ${vault?.name}`,
        { duration: 8000 }
      )
      onSuccess?.({ vault, amount, txHash: result?.txHash })
    } catch (err) {
      setStep('input')
      setError(err?.message ?? 'Unknown error')
      toast.error('Error', err?.message ?? 'Something went wrong')
    }
  }

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
              <h2 className="font-headline font-extrabold text-xl text-on-surface">Withdraw</h2>
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
              <p className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant mb-1">Deposited</p>
              <p className="font-bold text-sm text-on-surface truncate">
                {positionBalance ? `${Number(positionBalance).toFixed(4)} ${tokenSymbol}` : `$${Number(positionBalanceUsd).toLocaleString()}`}
              </p>
            </div>
            <div className="bg-surface-container rounded-xl p-3 text-center">
              <p className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant mb-1">Network</p>
              <p className="font-bold text-sm text-on-surface truncate">{getChainName(vaultChainId)}</p>
            </div>
          </div>

          {/* Zero balance warning */}
          {hasZeroBalance && step !== 'done' && (
            <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
              <span className="material-symbols-outlined text-amber-500 text-[18px] shrink-0 mt-0.5">info</span>
              <div>
                <p className="font-bold text-sm text-amber-800">No Balance to Withdraw</p>
                <p className="text-xs text-amber-700 mt-0.5">
                  You don't have any funds in this vault position.
                </p>
              </div>
            </div>
          )}

          {/* Withdraw type selector */}
          {step !== 'done' && !hasZeroBalance && (
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setWithdrawType('partial')}
                className={`py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all border-2 ${
                  withdrawType === 'partial'
                    ? 'bg-primary-container text-white border-primary-container'
                    : 'border-surface-container-high text-on-surface-variant hover:border-primary-container'
                }`}
              >
                Partial
              </button>
              <button
                onClick={() => setWithdrawType('full')}
                className={`py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all border-2 ${
                  withdrawType === 'full'
                    ? 'bg-error text-white border-error'
                    : 'border-surface-container-high text-on-surface-variant hover:border-error'
                }`}
              >
                Withdraw All
              </button>
            </div>
          )}

          {/* Partial amount input */}
          {step !== 'done' && withdrawType === 'partial' && !hasZeroBalance && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">
                  Amount ({tokenSymbol})
                </label>
                <span className="text-xs text-on-surface-variant font-medium">
                  Available: {positionBalanceFormatted} {maxBalance > 0 ? tokenSymbol : ''}
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
                  disabled={isBusy || maxBalance === 0}
                  className="flex-1 px-4 py-3.5 bg-transparent text-xl font-headline font-black text-on-surface outline-none placeholder:text-on-surface-variant/40 disabled:opacity-50"
                />
                <div className="flex items-center gap-1 pr-3">
                  <button onClick={setHalf} disabled={isBusy || maxBalance === 0}
                    className="px-2 py-1 text-[10px] font-black uppercase tracking-wider text-on-surface-variant bg-surface-container rounded-lg hover:bg-surface-container-high transition-colors disabled:opacity-40">
                    50%
                  </button>
                  <button onClick={setMax} disabled={isBusy || maxBalance === 0}
                    className="px-2 py-1 text-[10px] font-black uppercase tracking-wider text-error bg-error/10 rounded-lg hover:bg-error/20 transition-colors disabled:opacity-40">
                    MAX
                  </button>
                </div>
              </div>

              {hasInsufficientBalance && (
                <div className="flex items-center gap-2 text-red-600">
                  <span className="material-symbols-outlined text-[14px]">error</span>
                  <p className="text-xs font-bold">
                    Exceeds deposited balance of {maxBalance.toFixed(4)} {tokenSymbol}.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Full withdraw summary */}
          {step !== 'done' && withdrawType === 'full' && !hasZeroBalance && (
            <div className="p-4 bg-error/5 border border-error/20 rounded-xl space-y-2">
              <p className="font-bold text-sm text-on-surface">Withdraw everything</p>
              <p className="text-xs text-on-surface-variant">
                This will withdraw your entire position of{' '}
                <span className="font-bold text-on-surface">
                  {positionBalance ? `${Number(positionBalance).toFixed(4)} ${tokenSymbol}` : `$${Number(positionBalanceUsd).toLocaleString()}`}
                </span>{' '}
                from the vault.
              </p>
            </div>
          )}

          {/* Error */}
          {error && step !== 'done' && (
            <div className="flex items-start gap-2 p-3 bg-error-container/20 border border-error-container rounded-xl">
              <span className="material-symbols-outlined text-error text-[16px] shrink-0 mt-0.5">error</span>
              <p className="text-xs font-medium text-on-error-container">{error}</p>
            </div>
          )}

          {/* Busy status */}
          {isBusy && (
            <div className="space-y-2">
              {needsChainSwitch && (
                <StepIndicator label="Switch Network" status={step === 'switching' ? 'active' : 'done'} />
              )}
              <StepIndicator label="Submit Withdrawal" status={step === 'withdrawing' ? 'active' : 'pending'} />
            </div>
          )}

          {/* Done state */}
          {step === 'done' && (
            <div className="text-center space-y-3 py-4">
              <div className="w-16 h-16 bg-on-tertiary-container/10 rounded-full flex items-center justify-center mx-auto">
                <span className="material-symbols-outlined text-on-tertiary-container text-3xl">check_circle</span>
              </div>
              <h3 className="font-headline font-extrabold text-xl text-on-surface">Withdrawal Complete!</h3>
              <p className="text-sm text-on-surface-variant">Your funds have been returned to your wallet.</p>
            </div>
          )}

          {/* Action button */}
          {step !== 'done' ? (
            <button
              onClick={handleWithdraw}
              disabled={!isValid || isBusy}
              className={`w-full py-4 rounded-2xl font-headline font-black text-base transition-all flex items-center justify-center gap-2
                ${isValid && !isBusy
                  ? withdrawType === 'full'
                    ? 'bg-error text-white hover:opacity-90 shadow-md'
                    : 'bg-primary-container text-white hover:opacity-90 shadow-md'
                  : 'bg-surface-container text-on-surface-variant cursor-not-allowed'
                }
              `}
            >
              {isBusy ? (
                <>
                  <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
                  {step === 'switching' && 'Switching Network...'}
                  {step === 'withdrawing' && 'Withdrawing...'}
                </>
              ) : needsChainSwitch && isValid ? (
                <>
                  <span className="material-symbols-outlined text-[18px]">swap_horiz</span>
                  Switch & Withdraw
                </>
              ) : withdrawType === 'full' ? (
                <>
                  <span className="material-symbols-outlined text-[18px]">logout</span>
                  Withdraw All
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[18px]">remove_circle</span>
                  Withdraw {amount ? `${amount} ${tokenSymbol}` : ''}
                </>
              )}
            </button>
          ) : (
            <button onClick={onClose}
              className="w-full py-4 rounded-2xl font-headline font-black text-base bg-on-tertiary-container text-white hover:opacity-90 transition-all">
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
      <p className={`text-sm font-bold ${status === 'active' ? 'text-on-surface' : 'text-on-surface-variant'}`}>{label}</p>
    </div>
  )
}