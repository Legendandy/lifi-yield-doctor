// src/components/ToastNotifications.jsx
import { useState, useEffect, createContext, useContext, useCallback } from 'react'

// ─── Context ──────────────────────────────────────────────────────────────────
const ToastContext = createContext(null)

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside ToastProvider')
  return ctx
}

// ─── Toast types ──────────────────────────────────────────────────────────────
const ICONS = {
  success: { icon: 'check_circle', bg: 'bg-[#009844]', text: 'text-white', bar: 'bg-white/30' },
  error: { icon: 'error', bg: 'bg-[#ba1a1a]', text: 'text-white', bar: 'bg-white/30' },
  warning: { icon: 'warning', bg: 'bg-amber-500', text: 'text-white', bar: 'bg-white/30' },
  info: { icon: 'info', bg: 'bg-[#131b2e]', text: 'text-white', bar: 'bg-white/30' },
  loading: { icon: 'hourglass_top', bg: 'bg-[#131b2e]', text: 'text-white', bar: 'bg-white/30' },
  tx: { icon: 'receipt_long', bg: 'bg-on-tertiary-container', text: 'text-white', bar: 'bg-white/30' },
}

// ─── Single Toast ─────────────────────────────────────────────────────────────
function Toast({ toast, onDismiss }) {
  const [visible, setVisible] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const style = ICONS[toast.type] || ICONS.info
  const duration = toast.duration ?? (toast.type === 'loading' ? 0 : 5000)

  useEffect(() => {
    // Mount animation
    const t = setTimeout(() => setVisible(true), 10)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    if (!duration) return
    const t = setTimeout(() => handleDismiss(), duration)
    return () => clearTimeout(t)
  }, [duration])

  function handleDismiss() {
    setLeaving(true)
    setTimeout(() => onDismiss(toast.id), 300)
  }

  return (
    <div
      className={`relative flex items-start gap-3 min-w-[320px] max-w-[420px] p-4 rounded-2xl shadow-2xl border border-white/10 overflow-hidden transition-all duration-300
        ${style.bg} ${style.text}
        ${visible && !leaving ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-8'}
      `}
    >
      {/* Icon */}
      <span className={`material-symbols-outlined text-[22px] shrink-0 mt-0.5 ${toast.type === 'loading' ? 'animate-spin' : ''}`}>
        {style.icon}
      </span>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {toast.title && (
          <p className="font-bold text-sm leading-tight">{toast.title}</p>
        )}
        {toast.message && (
          <p className="text-sm opacity-90 mt-0.5 leading-snug break-words">{toast.message}</p>
        )}
        {toast.txHash && (
          <a
            href={`https://etherscan.io/tx/${toast.txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs opacity-70 hover:opacity-100 underline mt-1 block font-mono"
          >
            {toast.txHash.slice(0, 10)}...{toast.txHash.slice(-8)} ↗
          </a>
        )}
      </div>

      {/* Close */}
      {toast.type !== 'loading' && (
        <button
          onClick={handleDismiss}
          className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
        >
          <span className="material-symbols-outlined text-[16px]">close</span>
        </button>
      )}

      {/* Progress bar */}
      {duration > 0 && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/10">
          <div
            className={`h-full ${style.bar} origin-left`}
            style={{
              animation: `shrink ${duration}ms linear forwards`,
            }}
          />
        </div>
      )}

      <style>{`
        @keyframes shrink {
          from { transform: scaleX(1); }
          to { transform: scaleX(0); }
        }
      `}</style>
    </div>
  )
}

// ─── Provider ─────────────────────────────────────────────────────────────────
let _idCounter = 0

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const dismiss = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const show = useCallback((opts) => {
    const id = ++_idCounter
    const toast = { id, type: 'info', ...opts }
    setToasts(prev => [...prev.slice(-4), toast]) // max 5 toasts
    return id
  }, [])

  const update = useCallback((id, opts) => {
    setToasts(prev => prev.map(t => t.id === id ? { ...t, ...opts } : t))
  }, [])

  // Convenience helpers
  const toast = {
    show,
    update,
    dismiss,
    success: (title, message, extra) => show({ type: 'success', title, message, ...extra }),
    error: (title, message, extra) => show({ type: 'error', title, message, duration: 8000, ...extra }),
    warning: (title, message, extra) => show({ type: 'warning', title, message, ...extra }),
    info: (title, message, extra) => show({ type: 'info', title, message, ...extra }),
    loading: (title, message, extra) => show({ type: 'loading', title, message, duration: 0, ...extra }),
    tx: (title, txHash, extra) => show({ type: 'tx', title, txHash, duration: 10000, ...extra }),
  }

  return (
    <ToastContext.Provider value={toast}>
      {children}
      {/* Toast container — bottom-right */}
      <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-3 items-end pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} className="pointer-events-auto">
            <Toast toast={t} onDismiss={dismiss} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}