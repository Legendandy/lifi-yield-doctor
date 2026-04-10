// src/components/AppShell.jsx
import { useNavigate, useLocation } from 'react-router-dom'
import { useAccount, useDisconnect } from 'wagmi'
import ChainSelector from './ChainSelector'

export default function AppShell({ children }) {
  const { address } = useAccount()
  const { disconnect } = useDisconnect()
  const navigate = useNavigate()
  const location = useLocation()

  const shortAddr = address
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : ''

  const navItems = [
    { path: '/dashboard', icon: 'dashboard',        label: 'Dashboard'   },
    { path: '/vaults',    icon: 'account_balance',  label: 'Vaults'      },
    { path: '/compare',   icon: 'compare_arrows',   label: 'Compare APY' },
  ]

  return (
    <div className="bg-background text-on-surface font-body min-h-screen">
      {/* TOP HEADER */}
      <nav className="fixed top-0 w-full z-50 flex justify-between items-center px-8 h-16 bg-white/80 backdrop-blur-md shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary-container flex items-center justify-center text-white">
            <span className="material-symbols-outlined text-sm">health_and_safety</span>
          </div>
          <span className="text-xl font-black tracking-tight text-on-surface font-headline">
            Yield Doctor
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Network switcher */}
          <ChainSelector />
          {/* Wallet address */}
          <span className="text-sm font-mono text-on-surface-variant bg-surface-container px-3 py-1.5 rounded-full">
            {shortAddr}
          </span>
          <button
            onClick={() => disconnect()}
            className="text-xs text-on-surface-variant hover:text-on-surface transition-colors"
          >
            Disconnect
          </button>
        </div>
      </nav>

      {/* SIDEBAR */}
      <aside className="h-screen w-64 fixed left-0 top-0 bg-slate-50 flex flex-col p-4 space-y-6 pt-20">
        <div className="flex items-center gap-3 px-2 mb-2">
          <div className="w-10 h-10 rounded-xl bg-primary-container flex items-center justify-center text-white">
            <span className="material-symbols-outlined">health_and_safety</span>
          </div>
          <div>
            <h2 className="text-base font-black text-on-surface leading-tight font-headline">Yield Doctor</h2>
            <p className="text-[10px] uppercase tracking-widest text-on-primary-container font-bold">Clinical AI Analysis</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1">
          {navItems.map(({ path, icon, label }) => {
            const active = location.pathname === path
            return (
              <button
                key={path}
                onClick={() => navigate(path)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all text-left font-medium
                  ${active
                    ? 'bg-white text-on-surface font-bold shadow-sm clinical-shadow'
                    : 'text-on-surface-variant hover:bg-surface-container-low hover:translate-x-0.5'
                  }`}
              >
                <span className="material-symbols-outlined text-[20px]">{icon}</span>
                {label}
              </button>
            )
          })}
        </nav>
      </aside>

      {/* MAIN CONTENT */}
      <main className="pl-64 pt-16 min-h-screen">
        <div className="p-8 max-w-[1600px] mx-auto">
          {children}
        </div>
      </main>
    </div>
  )
}