// src/pages/HomePage.jsx
import { useConnectModal } from '@rainbow-me/rainbowkit'
import { useAccount } from 'wagmi'
import { Link } from "react-router-dom"

function XLogo({ className = '' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.911-5.622Zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}

function DiscordLogo({ className = '' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M20.317 4.492c-1.53-.69-3.17-1.2-4.885-1.49a.075.075 0 0 0-.079.036c-.21.369-.444.85-.608 1.23a18.566 18.566 0 0 0-5.487 0 12.36 12.36 0 0 0-.617-1.23A.077.077 0 0 0 8.562 3c-1.714.29-3.354.8-4.885 1.491a.07.07 0 0 0-.032.027C.533 9.093-.32 13.555.099 17.961a.08.08 0 0 0 .031.055 20.03 20.03 0 0 0 5.993 2.98.078.078 0 0 0 .084-.026c.462-.62.874-1.275 1.226-1.963.021-.04.001-.088-.041-.104a13.201 13.201 0 0 1-1.872-.878.075.075 0 0 1-.008-.125c.126-.093.252-.19.372-.287a.075.075 0 0 1 .078-.01c3.927 1.764 8.18 1.764 12.061 0a.075.075 0 0 1 .079.009c.12.098.245.195.372.288a.075.075 0 0 1-.006.125c-.598.344-1.22.635-1.873.877a.075.075 0 0 0-.041.105c.36.687.772 1.341 1.225 1.962a.077.077 0 0 0 .084.028 19.963 19.963 0 0 0 6.002-2.981.076.076 0 0 0 .032-.054c.5-5.094-.838-9.52-3.549-13.442a.06.06 0 0 0-.031-.028zM8.02 15.278c-1.182 0-2.157-1.069-2.157-2.38 0-1.312.956-2.38 2.157-2.38 1.21 0 2.176 1.077 2.157 2.38 0 1.312-.956 2.38-2.157 2.38zm7.975 0c-1.183 0-2.157-1.069-2.157-2.38 0-1.312.955-2.38 2.157-2.38 1.21 0 2.176 1.077 2.157 2.38 0 1.312-.946 2.38-2.157 2.38z" />
    </svg>
  )
}

export default function HomePage() {
  const { openConnectModal } = useConnectModal()
  const { isConnected } = useAccount()

  function handleConnect() {
    if (!isConnected) openConnectModal()
  }

  return (
    <div className="bg-surface text-on-surface">

      {/* Sticky Nav */}
      <nav className="fixed top-0 w-full z-[100] glass border-b border-outline-variant/50 h-16 flex items-center px-6 md:px-12 justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary-container rounded-lg flex items-center justify-center text-white">
            <span className="material-symbols-outlined text-sm">health_and_safety</span>
          </div>
          <span className="text-xl font-extrabold tracking-tighter">Yield Doctor</span>
        </div>
        <div className="hidden md:flex items-center space-x-8 text-sm font-semibold text-on-surface-variant">
          <Link to="risk-index"className="hover:text-on-tertiary-container transition-colors">Risk Index</Link>
            <Link to="api"className="hover:text-on-tertiary-container transition-colors">API</Link>
        </div>
        <button
          onClick={handleConnect}
          className="px-5 py-2 bg-primary-container text-white text-sm font-bold rounded-full hover:bg-slate-800 transition-all active:scale-95"
        >
          Connect Wallet
        </button>
      </nav>

      {/* Hero */}
      <section className="relative pt-32 pb-20 px-6 overflow-hidden">
        <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-16 items-center">
          <div className="space-y-8">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 text-[10px] font-bold tracking-widest uppercase">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Live across 17 chains · 600+ vaults
            </div>
            <h1 className="text-5xl md:text-7xl font-extrabold tracking-tighter leading-[1.05] text-on-surface">
              The smarter way to <span className="text-on-tertiary-container">deploy DeFi yield.</span>
            </h1>
            <p className="text-xl text-on-surface-variant font-medium leading-relaxed max-w-xl">
              Browse, compare, and deposit into the best yield vaults across 17 chains — with live risk grading and one-click cross-chain deposits via LI.FI Composer.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={handleConnect}
                className="bg-primary-container text-white px-8 py-4 rounded-xl font-bold hover:shadow-lg transition-all active:scale-95"
              >
                Connect Wallet
              </button>
              <Link to="/risk-index"
                className="flex items-center justify-center gap-2 px-8 py-4 rounded-xl font-bold border-2 border-surface-container-high text-on-surface-variant hover:border-primary-container hover:text-on-surface transition-all"
              >
                <span className="material-symbols-outlined text-[18px]">verified_user</span>
                How risk is scored
              </Link>
            </div>
          </div>

          {/* Hero card mockup */}
          <div className="relative">
            <div className="absolute -inset-4 bg-emerald-200 blur-[100px] rounded-full opacity-30"></div>
            <div className="relative glass rounded-3xl p-6 shadow-2xl border border-white/50 space-y-5">
              <div className="flex justify-between items-center pb-4 border-b border-outline-variant/50">
                <div className="flex gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-400/30"></div>
                  <div className="w-3 h-3 rounded-full bg-amber-400/30"></div>
                  <div className="w-3 h-3 rounded-full bg-green-400/30"></div>
                </div>
                <span className="text-[10px] font-bold text-outline uppercase tracking-widest">Vault Explorer Preview</span>
              </div>

              {/* Simulated vault rows */}
              {[
                { name: 'Morpho USDC Vault', protocol: 'Morpho', chain: 'Base', apy: '8.41%', grade: 'A', gradeColor: '#009844', gradeBg: 'rgba(0,152,68,0.10)' },
                { name: 'Euler WETH Prime', protocol: 'Euler', chain: 'Ethereum', apy: '5.22%', grade: 'A', gradeColor: '#009844', gradeBg: 'rgba(0,152,68,0.10)' },
                { name: 'Pendle PT-USDe', protocol: 'Pendle', chain: 'Arbitrum', apy: '14.87%', grade: 'B', gradeColor: '#d97706', gradeBg: 'rgba(217,119,6,0.10)' },
              ].map((v, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-surface-container rounded-xl border border-surface-container-high">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 bg-surface-container-high rounded-lg flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-on-surface-variant text-[14px]">account_balance</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-on-surface truncate">{v.name}</p>
                      <p className="text-[10px] text-on-surface-variant">{v.protocol} · {v.chain}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-black text-sm text-on-tertiary-container">{v.apy}</span>
                    <span
                      className="inline-flex items-center justify-center w-6 h-6 text-xs font-black rounded-lg border"
                      style={{ color: v.gradeColor, background: v.gradeBg, borderColor: v.gradeColor + '55' }}
                    >{v.grade}</span>
                  </div>
                </div>
              ))}

              <div className="flex items-center justify-between pt-1">
                <p className="text-[10px] text-on-surface-variant font-medium">Risk grades powered by DeFiLlama</p>
                <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest bg-on-tertiary-container/10 text-on-tertiary-container px-2 py-1 rounded-full">
                  <span className="material-symbols-outlined text-[10px]">bolt</span>Cross-chain
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats bar */}
      <div className="py-10 border-y border-surface-container bg-surface-container-low/50">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {[
              { value: '17', label: 'Chains supported' },
              { value: '600+', label: 'Vaults indexed' },
              { value: '$1M+', label: 'Min TVL threshold' },
              { value: 'A–D', label: 'Live risk grading' },
            ].map(({ value, label }) => (
              <div key={label}>
                <p className="text-3xl font-black text-on-surface tracking-tighter">{value}</p>
                <p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant mt-1">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* How it works */}
      <section className="py-24 max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-extrabold tracking-tight mb-4">How Yield Doctor works</h2>
          <p className="text-on-surface-variant max-w-xl mx-auto">Connect your wallet, browse vaults with live risk data, and deposit cross-chain in one transaction.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-12 relative">
          <div className="hidden md:block absolute top-12 left-1/2 -translate-x-1/2 w-[70%] h-px bg-outline-variant -z-10"></div>
          <div className="text-center space-y-4">
            <div className="w-24 h-24 bg-surface-container-lowest rounded-3xl border border-surface-container shadow-sm mx-auto flex items-center justify-center text-primary-container relative">
              <span className="material-symbols-outlined text-4xl">account_balance_wallet</span>
              <span className="absolute -top-3 -right-3 w-8 h-8 bg-surface-container rounded-full flex items-center justify-center text-xs font-bold text-on-surface-variant">01</span>
            </div>
            <h3 className="text-xl font-bold">Connect Wallet</h3>
            <p className="text-sm text-on-surface-variant px-6">Non-custodial, read-your-positions, and deposit-ready. Supports all major wallets via RainbowKit.</p>
          </div>
          <div className="text-center space-y-4">
            <div className="w-24 h-24 bg-primary-container rounded-3xl shadow-xl mx-auto flex items-center justify-center text-white relative">
              <span className="material-symbols-outlined text-4xl">verified_user</span>
              <span className="absolute -top-3 -right-3 w-8 h-8 bg-on-tertiary-container rounded-full flex items-center justify-center text-xs font-bold text-white">02</span>
            </div>
            <h3 className="text-xl font-bold">Browse & Compare</h3>
            <p className="text-sm text-on-surface-variant px-6">Explore 600+ vaults with live APY, TVL, risk grades (A–D), and APY trend predictions from DeFiLlama.</p>
          </div>
          <div className="text-center space-y-4">
            <div className="w-24 h-24 bg-surface-container-lowest rounded-3xl border border-surface-container shadow-sm mx-auto flex items-center justify-center text-on-tertiary-container relative">
              <span className="material-symbols-outlined text-4xl">bolt</span>
              <span className="absolute -top-3 -right-3 w-8 h-8 bg-surface-container rounded-full flex items-center justify-center text-xs font-bold text-on-surface-variant">03</span>
            </div>
            <h3 className="text-xl font-bold">Deposit Cross-Chain</h3>
            <p className="text-sm text-on-surface-variant px-6">Deposit from any supported chain into any vault in one transaction, powered by LI.FI Composer — no manual bridging.</p>
          </div>
        </div>
      </section>

      {/* Feature bento */}
      <section className="py-24 bg-surface-container-low">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">

            {/* Big feature: Vault Explorer */}
            <div className="md:col-span-8 bg-surface-container-lowest p-10 rounded-[2.5rem] flex flex-col justify-between overflow-hidden border border-surface-container">
              <div className="space-y-4">
                <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center text-on-tertiary-container">
                  <span className="material-symbols-outlined">manage_search</span>
                </div>
                <h3 className="text-3xl font-extrabold tracking-tighter">Vault Explorer</h3>
                <p className="text-on-surface-variant max-w-md">Browse every vault across 17 chains with live APY, 30-day averages, TVL depth, risk grades, and APY prediction trends — all in one filterable table.</p>
              </div>
              <div className="mt-8 bg-surface-container rounded-2xl border border-surface-container-high p-4 space-y-2">
                <div className="grid grid-cols-5 gap-3 text-[9px] font-black uppercase tracking-widest text-on-surface-variant px-2">
                  <span className="col-span-2">Vault</span><span className="text-right">APY</span><span className="text-right">TVL</span><span className="text-center">Risk</span>
                </div>
                {[
                  { name: 'Morpho USDC', apy: '8.41%', tvl: '$2.1B', grade: 'A', c: '#009844', bg: 'rgba(0,152,68,0.10)' },
                  { name: 'Euler WETH Prime', apy: '5.22%', tvl: '$890M', grade: 'A', c: '#009844', bg: 'rgba(0,152,68,0.10)' },
                  { name: 'Yearn USDC v3', apy: '6.80%', tvl: '$340M', grade: 'A', c: '#009844', bg: 'rgba(0,152,68,0.10)' },
                ].map((v, i) => (
                  <div key={i} className="grid grid-cols-5 gap-3 items-center px-2 py-2 rounded-xl hover:bg-surface-container transition-colors">
                    <span className="col-span-2 text-xs font-bold text-on-surface truncate">{v.name}</span>
                    <span className="text-xs font-black text-on-tertiary-container text-right">{v.apy}</span>
                    <span className="text-xs font-medium text-on-surface-variant text-right">{v.tvl}</span>
                    <div className="flex justify-center">
                      <span className="inline-flex items-center justify-center w-6 h-6 text-[10px] font-black rounded-lg border"
                        style={{ color: v.c, background: v.bg, borderColor: v.c + '55' }}>{v.grade}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Risk grading */}
            <div className="md:col-span-4 bg-primary-container p-10 rounded-[2.5rem] text-white flex flex-col justify-between">
              <div className="space-y-4">
                <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center">
                  <span className="material-symbols-outlined">verified</span>
                </div>
                <h3 className="text-3xl font-extrabold tracking-tighter">Risk Grades</h3>
                <p className="text-on-primary-container text-sm">Every vault gets a live A–D risk grade based on APY volatility, TVL depth, protocol trust, and DeFiLlama pool flags.</p>
              </div>
              <div className="mt-8 space-y-2">
                {[
                  { grade: 'A', label: 'Low risk', score: '≥ 70 pts', c: '#4ae176' },
                  { grade: 'B', label: 'Moderate', score: '45–69 pts', c: '#fbbf24' },
                  { grade: 'C', label: 'Higher risk', score: '20–44 pts', c: '#f97316' },
                  { grade: 'D', label: 'High risk', score: '< 20 pts', c: '#f87171' },
                ].map(({ grade, label, score, c }) => (
                  <div key={grade} className="flex items-center justify-between px-3 py-2 bg-white/5 rounded-xl">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center justify-center w-6 h-6 text-xs font-black rounded-lg border border-white/20" style={{ color: c }}>{grade}</span>
                      <span className="text-sm font-bold">{label}</span>
                    </div>
                    <span className="text-[10px] font-bold opacity-60">{score}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Compare */}
            <div className="md:col-span-4 bg-surface-container-lowest p-8 rounded-3xl space-y-4 border border-surface-container">
              <span className="material-symbols-outlined text-outline">compare_arrows</span>
              <h4 className="font-extrabold text-xl">Head-to-Head Compare</h4>
              <p className="text-on-surface-variant text-sm">Pick any two vaults from any chain and get a side-by-side breakdown of APY, TVL, risk grade, and a Doctor's Recommendation on which to deposit into.</p>
            </div>

            {/* Cross-chain deposits */}
            <div className="md:col-span-4 bg-surface-container-lowest p-8 rounded-3xl space-y-4 border border-surface-container">
              <span className="material-symbols-outlined text-outline">bolt</span>
              <h4 className="font-extrabold text-xl">Cross-Chain Deposits</h4>
              <p className="text-on-surface-variant text-sm">Use any token on any supported chain. LI.FI Composer bridges and deposits in a single transaction — no need to manually bridge first.</p>
            </div>

            {/* Withdraw */}
            <div className="md:col-span-4 bg-surface-container-lowest p-8 rounded-3xl space-y-4 border border-surface-container">
              <span className="material-symbols-outlined text-outline">logout</span>
              <h4 className="font-extrabold text-xl">Cross-Chain Withdrawals</h4>
              <p className="text-on-surface-variant text-sm">Withdraw vault shares and receive any token on any destination chain. Full cross-chain exit powered by Composer, with live route quotes.</p>
            </div>

            {/* Portfolio positions */}
            <div className="md:col-span-6 bg-surface-container-lowest p-8 rounded-3xl flex items-center justify-between border border-surface-container">
              <div className="space-y-2">
                <h4 className="font-extrabold text-xl">Portfolio Dashboard</h4>
                <p className="text-on-surface-variant text-sm">See all your active positions across chains in one place. USD balances, underlying assets, and protocol details — always in sync.</p>
              </div>
              <div className="w-12 h-12 bg-surface-container rounded-xl flex items-center justify-center shrink-0 ml-4">
                <span className="material-symbols-outlined text-on-surface-variant">dashboard</span>
              </div>
            </div>

            {/* APY predictions */}
            <div className="md:col-span-6 bg-surface-container-lowest p-8 rounded-3xl flex items-center justify-between border border-surface-container">
              <div className="space-y-2">
                <h4 className="font-extrabold text-xl">APY Trend Predictions</h4>
                <p className="text-on-surface-variant text-sm">Each vault shows an APP (APY Prediction Probability) signal from DeFiLlama's ML model — indicating whether APY is likely to go up, down, or stay flat.</p>
              </div>
              <div className="flex flex-col gap-1 shrink-0 ml-4">
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-black" style={{ color: '#009844', background: 'rgba(0,152,68,0.10)' }}>↑ 72%</span>
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-black" style={{ color: '#76777d', background: 'rgba(118,119,125,0.10)' }}>→ 51%</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Risk methodology CTA */}
      <section className="py-24 max-w-7xl mx-auto px-6">
        <div className="bg-primary-container text-white rounded-[3rem] p-12 md:p-20 relative overflow-hidden">
          <div className="grid md:grid-cols-2 gap-16 relative z-10">
            <div className="space-y-6">
              <h2 className="text-4xl md:text-5xl font-extrabold tracking-tighter">Transparent risk scoring. No black boxes.</h2>
              <p className="text-on-primary-container leading-relaxed">
                Every risk grade is built from five independently scored dimensions — APY volatility (σ), historical APY drift, protocol trust tier, TVL depth, and pool-level flags from DeFiLlama. We publish the full methodology.
              </p>
              <div className="space-y-3">
                {[
                  { label: 'APY Volatility (σ)', pts: '0–40 pts' },
                  { label: 'APY vs History (μ drift)', pts: '0–20 pts' },
                  { label: 'Protocol Trust Tier', pts: '0–20 pts' },
                  { label: 'TVL Depth', pts: '0–15 pts' },
                  { label: 'Pool Flags', pts: '0–5 pts' },
                ].map(({ label, pts }) => (
                  <div key={label} className="flex items-center justify-between px-4 py-2.5 bg-white/5 rounded-xl border border-white/10">
                    <span className="text-sm font-bold">{label}</span>
                    <span className="text-xs font-black opacity-60">{pts}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex flex-col justify-between">
              <div className="bg-white/5 border border-white/10 rounded-3xl p-8 space-y-6">
                <div>
                  <p className="text-[10px] uppercase font-black opacity-60 tracking-widest mb-2">Doctor's Pick algorithm</p>
                  <p className="font-mono text-xs leading-relaxed opacity-80">
                    score = sqrt(APY / 50) × 0.55<br />
                    &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;+ log10(TVL / 10,000) / 4 × 0.45
                  </p>
                </div>
                <p className="text-sm text-on-primary-container leading-relaxed">
                  Rewards high APY and deep TVL, both with diminishing returns — so a 200% APY vault doesn't automatically beat a rock-solid 8% one.
                </p>
                <Link to="/risk-index"
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-white text-primary-container rounded-xl font-bold text-sm hover:opacity-90 transition-all"
                >
                  <span className="material-symbols-outlined text-[16px]">open_in_new</span>
                  Read full methodology
                </Link>
              </div>
            </div>
          </div>
          <div className="absolute top-0 right-0 w-96 h-96 bg-on-tertiary-container/10 blur-[120px] rounded-full"></div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-24 px-6 text-center">
        <div className="max-w-3xl mx-auto space-y-8">
          <h2 className="text-4xl md:text-5xl font-extrabold tracking-tighter">Ready to find your best yield?</h2>
          <p className="text-xl text-on-surface-variant">Connect your wallet to see your positions and explore vaults across 17 chains.</p>
          <div className="flex justify-center pt-4">
            <button
              onClick={handleConnect}
              className="bg-primary-container text-white px-10 py-4 rounded-xl font-bold text-lg hover:shadow-xl transition-all active:scale-95"
            >
              Connect Wallet
            </button>
          </div>
          <p className="text-xs text-outline font-medium">Non-custodial · Read-only portfolio scan · No signup required</p>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-inverse-surface text-on-primary-container py-20 px-6">
        <div className="max-w-7xl mx-auto grid md:grid-cols-4 gap-12 border-b border-white/10 pb-12 mb-12">
          <div className="space-y-6">
            <div className="flex items-center gap-2 text-white">
              <div className="w-8 h-8 bg-on-tertiary-container rounded-lg flex items-center justify-center text-primary-container">
                <span className="material-symbols-outlined text-sm">health_and_safety</span>
              </div>
              <span className="text-xl font-extrabold tracking-tighter">Yield Doctor</span>
            </div>
            <p className="text-sm leading-relaxed">Live vault risk grading and cross-chain deposits for serious DeFi yield seekers.</p>
          </div>
          <div className="space-y-4">
            <h5 className="text-white text-xs font-black uppercase tracking-widest">Resources</h5>
            <ul className="space-y-2 text-sm">
              <li><a className="hover:text-white transition-colors" href="/">Explorer</a></li>
              <li><a className="hover:text-white transition-colors" href="https://docs.li.fi/earn/guides/api-integration">Earn API</a></li>
              <li><a className="hover:text-white transition-colors" href="https://yields.llama.fi/pools">Defillama Pool</a></li>
            </ul>
          </div>
          <div className="space-y-4">
            <h5 className="text-white text-xs font-black uppercase tracking-widest">Links</h5>
            <ul className="space-y-2 text-sm">
              <li></li><Link to="/risk-index"className="hover:text-on-tertiary-container transition-colors">Risk Index</Link><li/>
             <li></li><Link to="/api"className="hover:text-on-tertiary-container transition-colors">API</Link><li/>
            </ul>
          </div>
          <div className="space-y-4">
            <h5 className="text-white text-xs font-black uppercase tracking-widest">Community</h5>
            <div className="flex gap-4">
              <a
                href="https://x.com/_hadeleen"
                target="_blank"
                rel="noopener noreferrer"
                className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors text-white"
                aria-label="X (Twitter)"
              >
                <XLogo className="w-4 h-4" />
              </a>
              <a
                href="https://discord.org"
                target="_blank"
                rel="noopener noreferrer"
                className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors text-white"
                aria-label="Discord"
              >
                <DiscordLogo className="w-4 h-4" />
              </a>
            </div>
          </div>
        </div>
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center text-[10px] font-bold uppercase tracking-widest gap-4">
          <p>© 2026 Yield Doctor. Not financial advice.</p>
          <div className="flex gap-8">
            <a className="hover:text-white transition-colors" href="#">Privacy Policy</a>
            <a className="hover:text-white transition-colors" href="#">Terms of Service</a>
          </div>
        </div>
      </footer>
    </div>
  )
}