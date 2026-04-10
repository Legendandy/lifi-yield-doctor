// src/components/ChainSelector.jsx
// Chain switcher in the nav header — switches wallet chain directly
import { useState, useRef, useEffect } from 'react'
import { useAccount, useSwitchChain } from 'wagmi'
import { SUPPORTED_CHAINS } from '../services/tokenBalances'

export default function ChainSelector() {
  const { chainId: currentChainId, isConnected } = useAccount()
  const { switchChainAsync } = useSwitchChain()
  const [open, setOpen] = useState(false)
  const [switching, setSwitching] = useState(false)
  const ref = useRef(null)

  const currentChain = SUPPORTED_CHAINS.find(c => c.id === currentChainId)
  const chainLabel = currentChain?.name ?? (currentChainId ? `Chain ${currentChainId}` : 'Unknown')

  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  if (!isConnected) return null

  async function handleSwitch(chainId) {
    if (chainId === currentChainId) { setOpen(false); return }
    setSwitching(true)
    try {
      await switchChainAsync({ chainId })
    } catch {
      // user rejected or unsupported
    } finally {
      setSwitching(false)
      setOpen(false)
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        disabled={switching}
        className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-container border border-surface-container-high hover:border-primary-container/40 transition-all text-sm font-bold text-on-surface disabled:opacity-60 min-w-[120px] justify-between"
      >
        <span className="truncate">{chainLabel}</span>
        {switching ? (
          <span className="material-symbols-outlined text-[14px] animate-spin text-on-surface-variant shrink-0">progress_activity</span>
        ) : (
          <span className="material-symbols-outlined text-[14px] text-on-surface-variant shrink-0">expand_more</span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-2xl shadow-2xl border border-surface-container z-[200] overflow-hidden">
          <div className="px-4 py-2.5 border-b border-surface-container">
            <p className="text-[10px] uppercase tracking-widest font-black text-on-surface-variant">Switch Network</p>
          </div>
          <div className="py-1 max-h-72 overflow-y-auto">
            {SUPPORTED_CHAINS.map(chain => {
              const active = chain.id === currentChainId
              return (
                <button
                  key={chain.id}
                  onClick={() => handleSwitch(chain.id)}
                  className={`w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors hover:bg-surface-container-low
                    ${active ? 'bg-surface-container' : ''}`}
                >
                  <span className={`text-sm font-bold ${active ? 'text-on-tertiary-container' : 'text-on-surface'}`}>
                    {chain.name}
                  </span>
                  {active && (
                    <span className="material-symbols-outlined text-on-tertiary-container text-[16px]">check_circle</span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}