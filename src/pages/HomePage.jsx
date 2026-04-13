import { useConnectModal } from '@rainbow-me/rainbowkit'
import { useAccount } from 'wagmi'

// X (Twitter) SVG logo
function XLogo({ className = '' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.911-5.622Zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}

// Discord SVG logo
function DiscordLogo({ className = '' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M20.317 4.492c-1.53-.69-3.17-1.2-4.885-1.49a.075.075 0 0 0-.079.036c-.21.369-.444.85-.608 1.23a18.566 18.566 0 0 0-5.487 0 12.36 12.36 0 0 0-.617-1.23A.077.077 0 0 0 8.562 3c-1.714.29-3.354.8-4.885 1.491a.07.07 0 0 0-.032.027C.533 9.093-.32 13.555.099 17.961a.08.08 0 0 0 .031.055 20.03 20.03 0 0 0 5.993 2.98.078.078 0 0 0 .084-.026c.462-.62.874-1.275 1.226-1.963.021-.04.001-.088-.041-.104a13.201 13.201 0 0 1-1.872-.878.075.075 0 0 1-.008-.125c.126-.093.252-.19.372-.287a.075.075 0 0 1 .078-.01c3.927 1.764 8.18 1.764 12.061 0a.075.075 0 0 1 .079.009c.12.098.245.195.372.288a.075.075 0 0 1-.006.125c-.598.344-1.22.635-1.873.877a.075.075 0 0 0-.041.105c.36.687.772 1.341 1.225 1.962a.077.077 0 0 0 .084.028 19.963 19.963 0 0 0 6.002-2.981.076.076 0 0 0 .032-.054c.5-5.094-.838-9.52-3.549-13.442a.06.06 0 0 0-.031-.028zM8.02 15.278c-1.182 0-2.157-1.069-2.157-2.38 0-1.312.956-2.38 2.157-2.38 1.21 0 2.176 1.077 2.157 2.38 0 1.312-.956 2.38-2.157 2.38zm7.975 0c-1.183 0-2.157-1.069-2.157-2.38 0-1.312.955-2.38 2.157-2.38 1.21 0 2.176 1.077 2.157 2.38 0 1.312-.946 2.38-2.157 2.38z" />
    </svg>
  )
}

export default function HomePage({ onConnected }) {
  const { openConnectModal } = useConnectModal()
  const { isConnected } = useAccount()

  function handleRunDiagnosis() {
    if (isConnected) {
      onConnected?.()
    } else {
      openConnectModal()
    }
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
          <a
    href="#"
    onClick={(e) => {
      e.preventDefault()
      handleRunDiagnosis()
    }}
    className="hover:text-on-tertiary-container transition-colors"
  >
    Portfolio Scan
  </a>

          <a className="hover:text-on-tertiary-container transition-colors" href="/risk-index">Risk Index</a>
          <a className="hover:text-on-tertiary-container transition-colors" href="/api">API</a>
        </div>
        <button
          onClick={handleRunDiagnosis}
          className="px-5 py-2 bg-primary-container text-white text-sm font-bold rounded-full hover:bg-slate-800 transition-all active:scale-95"
        >
          Connect Wallet
        </button>
      </nav>

      {/* Hero */}
      <section className="relative pt-32 pb-20 px-6 hero-gradient overflow-hidden">
        <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-16 items-center">
          <div className="space-y-8">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 text-[10px] font-bold tracking-widest uppercase">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Now Analyzing 1,200+ Protocols
            </div>
            <h1 className="text-5xl md:text-7xl font-extrabold tracking-tighter leading-[1.05] text-on-surface">
              Diagnose. Fix. Profit. — Your DeFi Portfolio's{' '}
              <span className="text-on-tertiary-container">AI Doctor</span>
            </h1>
            <p className="text-xl text-on-surface-variant font-medium leading-relaxed max-w-xl">
              AI-powered analysis that scans your portfolio, detects hidden risks, and unlocks higher yield in seconds.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 max-w-lg">
              <button
                onClick={handleRunDiagnosis}
                className="bg-primary-container text-white px-8 py-4 rounded-xl font-bold hover:shadow-lg transition-all active:scale-95"
              >
                Run Diagnosis
              </button>
            </div>
            <div className="flex items-center gap-6">
              <button className="flex items-center gap-2 text-sm font-bold text-on-surface-variant hover:text-on-tertiary-container">
                <span className="material-symbols-outlined text-lg">play_circle</span>
                View Demo Report
              </button>
              <div className="h-4 w-px bg-outline-variant"></div>
              <div className="flex items-center -space-x-2">
                <div className="w-8 h-8 rounded-full border-2 border-white bg-surface-container flex items-center justify-center text-xs font-bold text-on-surface-variant">A</div>
                <div className="w-8 h-8 rounded-full border-2 border-white bg-surface-container-high flex items-center justify-center text-xs font-bold text-on-surface-variant">D</div>
                <div className="w-8 h-8 rounded-full border-2 border-white bg-surface-container-highest flex items-center justify-center text-xs font-bold text-on-surface">S</div>
                <span className="ml-4 text-xs font-bold text-on-surface-variant">Trusted by 12,000+ investors</span>
              </div>
            </div>
          </div>

          {/* Hero Mockup */}
          <div className="relative">
            <div className="absolute -inset-4 bg-emerald-200 blur-[100px] rounded-full opacity-30"></div>
            <div className="relative glass rounded-3xl p-6 shadow-2xl border border-white/50 space-y-6">
              <div className="flex justify-between items-center pb-4 border-b border-outline-variant/50">
                <div className="flex gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-400/30"></div>
                  <div className="w-3 h-3 rounded-full bg-amber-400/30"></div>
                  <div className="w-3 h-3 rounded-full bg-green-400/30"></div>
                </div>
                <span className="text-[10px] font-bold text-outline uppercase tracking-widest">Live Analysis Preview</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-surface-container-lowest p-5 rounded-2xl border border-surface-container shadow-sm">
                  <p className="text-[10px] font-bold text-on-surface-variant uppercase">Portfolio Health</p>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-3xl font-black text-on-surface">84%</span>
                    <span className="text-xs font-bold text-on-tertiary-container">↑ 12%</span>
                  </div>
                </div>
                <div className="bg-surface-container-lowest p-5 rounded-2xl border border-surface-container shadow-sm">
                  <p className="text-[10px] font-bold text-on-surface-variant uppercase">Current APY</p>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-3xl font-black text-on-surface">14.2%</span>
                    <span className="text-xs font-bold text-on-tertiary-container">Optimal</span>
                  </div>
                </div>
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-surface-container rounded-xl border border-surface-container-high">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-secondary-container rounded-lg flex items-center justify-center text-on-secondary-container">
                      <span className="material-symbols-outlined text-sm">water_drop</span>
                    </div>
                    <div>
                      <p className="text-xs font-bold">Lido Staked ETH</p>
                      <p className="text-[10px] text-on-surface-variant">No risks detected</p>
                    </div>
                  </div>
                  <span className="text-xs font-black text-on-tertiary-container">3.8% APY</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-error-container/30 rounded-xl border border-error-container/50">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-error-container rounded-lg flex items-center justify-center text-on-error-container">
                      <span className="material-symbols-outlined text-sm">warning</span>
                    </div>
                    <div>
                      <p className="text-xs font-bold">Curve Tricrypto</p>
                      <p className="text-[10px] text-error">Impermanent loss risk high</p>
                    </div>
                  </div>
                  <span className="text-xs font-black text-error">Migrate?</span>
                </div>
              </div>
              <div className="absolute -bottom-6 -right-6 bg-primary-container text-white p-4 rounded-2xl shadow-xl animate-bounce">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-on-tertiary-container rounded-full flex items-center justify-center">
                    <span className="material-symbols-outlined">auto_graph</span>
                  </div>
                  <div>
                    <p className="text-[10px] opacity-60 font-bold">Potential Gain</p>
                    <p className="text-sm font-bold">+$2,480 / Year</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Social Proof Bar */}
      <div className="py-12 border-y border-surface-container bg-surface-container-low/50">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-8 items-center opacity-50">
            <div className="flex justify-center text-lg font-black tracking-tighter text-on-surface">ETHEREUM</div>
            <div className="flex justify-center text-lg font-black tracking-tighter text-on-surface">ARBITRUM</div>
            <div className="flex justify-center text-lg font-black tracking-tighter text-on-surface">BASE</div>
            <div className="hidden lg:flex flex-col items-center">
              <span className="text-lg font-black text-on-surface leading-none">$120M+</span>
              <span className="text-[10px] uppercase font-bold text-on-surface-variant">Analyzed</span>
            </div>
            <div className="hidden lg:flex flex-col items-center">
              <span className="text-lg font-black text-on-surface leading-none">18%</span>
              <span className="text-[10px] uppercase font-bold text-on-surface-variant">Avg APY Boost</span>
            </div>
            <div className="hidden lg:flex flex-col items-center">
              <span className="text-lg font-black text-on-surface leading-none">400+</span>
              <span className="text-[10px] uppercase font-bold text-on-surface-variant">Protocols</span>
            </div>
          </div>
        </div>
      </div>

      {/* How It Works */}
      <section className="py-24 max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-extrabold tracking-tight mb-4">A Professional Diagnosis in 3 Steps</h2>
          <p className="text-on-surface-variant max-w-xl mx-auto">Skip the spreadsheets. Let our AI do the deep-tissue analysis of your smart contracts and pool health.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-12 relative">
          <div className="hidden md:block absolute top-12 left-1/2 -translate-x-1/2 w-[70%] h-px bg-outline-variant -z-10"></div>
          <div className="text-center space-y-4">
            <div className="w-24 h-24 bg-surface-container-lowest rounded-3xl border border-surface-container shadow-sm mx-auto flex items-center justify-center text-primary-container relative">
              <span className="material-symbols-outlined text-4xl">account_balance_wallet</span>
              <span className="absolute -top-3 -right-3 w-8 h-8 bg-surface-container rounded-full flex items-center justify-center text-xs font-bold text-on-surface-variant">01</span>
            </div>
            <h3 className="text-xl font-bold">Connect Wallet</h3>
            <p className="text-sm text-on-surface-variant px-6">Non-custodial and read-only. We never touch your private keys or assets.</p>
          </div>
          <div className="text-center space-y-4">
            <div className="w-24 h-24 bg-primary-container rounded-3xl shadow-xl mx-auto flex items-center justify-center text-white relative">
              <span className="material-symbols-outlined text-4xl animate-pulse">clinical_notes</span>
              <span className="absolute -top-3 -right-3 w-8 h-8 bg-on-tertiary-container rounded-full flex items-center justify-center text-xs font-bold text-white">02</span>
            </div>
            <h3 className="text-xl font-bold">AI Deep Scan</h3>
            <p className="text-sm text-on-surface-variant px-6">Our doctor engine scans 1,200+ yield pools, protocol safety, and contract vulnerabilities.</p>
          </div>
          <div className="text-center space-y-4">
            <div className="w-24 h-24 bg-surface-container-lowest rounded-3xl border border-surface-container shadow-sm mx-auto flex items-center justify-center text-on-tertiary-container relative">
              <span className="material-symbols-outlined text-4xl">verified</span>
              <span className="absolute -top-3 -right-3 w-8 h-8 bg-surface-container rounded-full flex items-center justify-center text-xs font-bold text-on-surface-variant">03</span>
            </div>
            <h3 className="text-xl font-bold">Get Diagnosis</h3>
            <p className="text-sm text-on-surface-variant px-6">Receive a custom prescription to fix risks and instantly upgrade your yield profile.</p>
          </div>
        </div>
      </section>

      {/* Bento Feature Grid */}
      <section className="py-24 bg-surface-container-low">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            <div className="md:col-span-8 bento-card bg-surface-container-lowest p-10 rounded-[2.5rem] flex flex-col justify-between overflow-hidden">
              <div className="space-y-4">
                <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center text-on-tertiary-container">
                  <span className="material-symbols-outlined">monitor_heart</span>
                </div>
                <h3 className="text-3xl font-extrabold tracking-tighter">Real-Time Health Monitoring</h3>
                <p className="text-on-surface-variant max-w-md">Continuous surveillance across 400+ liquidity pools. We alert you to decoupling, LP drain, or contract pauses before they hit your balance.</p>
              </div>
              <div className="mt-8 bg-surface-container rounded-2xl h-48 border border-surface-container-high flex items-center justify-center p-6">
                <div className="w-full flex items-end gap-1 h-24">
                  <div className="flex-grow bg-surface-container-high h-[60%] rounded-t-sm"></div>
                  <div className="flex-grow bg-surface-container-high h-[70%] rounded-t-sm"></div>
                  <div className="flex-grow bg-surface-container-high h-[65%] rounded-t-sm"></div>
                  <div className="flex-grow bg-on-tertiary-container h-[90%] rounded-t-sm animate-pulse"></div>
                  <div className="flex-grow bg-surface-container-high h-[55%] rounded-t-sm"></div>
                  <div className="flex-grow bg-surface-container-high h-[80%] rounded-t-sm"></div>
                </div>
              </div>
            </div>
            <div className="md:col-span-4 bento-card bg-primary-container p-10 rounded-[2.5rem] text-white flex flex-col justify-between">
              <div className="space-y-4">
                <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center text-tertiary-fixed-dim">
                  <span className="material-symbols-outlined">trending_up</span>
                </div>
                <h3 className="text-3xl font-extrabold tracking-tighter">Yield Optimizer</h3>
                <p className="text-on-primary-container text-sm">Smart rebalancing to capture the highest risk-adjusted APY in DeFi.</p>
              </div>
              <div className="mt-8 space-y-4">
                <div className="flex justify-between items-center text-xs font-bold opacity-60">
                  <span>CURRENT APY</span><span>4.2%</span>
                </div>
                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-on-tertiary-container w-[35%]"></div>
                </div>
                <div className="flex justify-between items-center text-xs font-bold text-tertiary-fixed-dim pt-2">
                  <span>OPTIMIZED</span><span>16.8%</span>
                </div>
                <div className="h-2 bg-tertiary-fixed-dim/20 rounded-full overflow-hidden">
                  <div className="h-full bg-tertiary-fixed-dim w-full"></div>
                </div>
              </div>
            </div>
            <div className="md:col-span-4 bento-card bg-surface-container-lowest p-8 rounded-3xl space-y-4">
              <span className="material-symbols-outlined text-outline">security</span>
              <h4 className="font-extrabold text-xl">Stability Index</h4>
              <p className="text-on-surface-variant text-sm">Quantifying protocol risk through stress-test simulations and auditing history.</p>
            </div>
            <div className="md:col-span-4 bento-card bg-surface-container-lowest p-8 rounded-3xl space-y-4">
              <span className="material-symbols-outlined text-outline">psychology</span>
              <h4 className="font-extrabold text-xl">AI Doctor Reports</h4>
              <p className="text-on-surface-variant text-sm">Human-readable analysis explaining exactly why your portfolio is underperforming.</p>
            </div>
            <div className="md:col-span-4 bento-card bg-surface-container-lowest p-8 rounded-3xl space-y-4">
              <span className="material-symbols-outlined text-outline">hub</span>
              <h4 className="font-extrabold text-xl">Multi-Chain Coverage</h4>
              <p className="text-on-surface-variant text-sm">Unified view across Ethereum, Arbitrum, Base, Polygon, and Optimism.</p>
            </div>
            <div className="md:col-span-3 bento-card bg-surface-container-lowest p-8 rounded-3xl space-y-4">
              <span className="material-symbols-outlined text-outline">notifications_active</span>
              <h4 className="font-extrabold text-lg">Risk Alerts</h4>
              <p className="text-on-surface-variant text-xs">Push notifications for de-pegging events and protocol exploits.</p>
            </div>
            <div className="md:col-span-6 bento-card bg-surface-container-lowest p-8 rounded-3xl flex items-center justify-between">
              <div className="space-y-2">
                <h4 className="font-extrabold text-xl">Historical Performance</h4>
                <p className="text-on-surface-variant text-sm">Track how our doctor's advice would have performed.</p>
              </div>
              <div className="w-32 h-16 bg-surface-container rounded-lg border border-surface-container-high flex items-end gap-1 p-2">
                <div className="w-2 h-[40%] bg-emerald-200 rounded-full"></div>
                <div className="w-2 h-[60%] bg-emerald-300 rounded-full"></div>
                <div className="w-2 h-[50%] bg-emerald-400 rounded-full"></div>
                <div className="w-2 h-[90%] bg-on-tertiary-container rounded-full"></div>
              </div>
            </div>
            <div className="md:col-span-3 bento-card bg-surface-container-lowest p-8 rounded-3xl space-y-4">
              <span className="material-symbols-outlined text-outline">auto_awesome</span>
              <h4 className="font-extrabold text-lg">Smart Rebalance</h4>
              <p className="text-on-surface-variant text-xs">One-click execution for AI recommended swaps.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Comparison */}
      <section className="py-24 max-w-7xl mx-auto px-6">
        <div className="bg-primary-container text-white rounded-[3rem] p-12 md:p-20 relative overflow-hidden">
          <div className="grid md:grid-cols-2 gap-16 relative z-10">
            <div className="space-y-12">
              <h2 className="text-4xl md:text-5xl font-extrabold tracking-tighter">Level Up Your DeFi Game</h2>
              <div className="space-y-6">
                <div className="flex items-start gap-4">
                  <div className="w-6 h-6 rounded-full bg-error/20 text-error flex items-center justify-center mt-1">
                    <span className="material-symbols-outlined text-sm">close</span>
                  </div>
                  <div>
                    <h4 className="font-bold text-on-primary-container">Without Yield Doctor</h4>
                    <p className="text-on-primary-container/70 text-sm">Guessing market moves, hidden protocol risks, and leaving 40% of potential yield on the table.</p>
                  </div>
                </div>
                <div className="h-px bg-white/10"></div>
                <div className="flex items-start gap-4">
                  <div className="w-6 h-6 rounded-full bg-tertiary-fixed-dim/20 text-tertiary-fixed-dim flex items-center justify-center mt-1">
                    <span className="material-symbols-outlined text-sm">check</span>
                  </div>
                  <div>
                    <h4 className="font-bold text-white">With Yield Doctor</h4>
                    <p className="text-on-primary-container text-sm">Real-time AI insights, optimized risk-adjusted returns, and automated safety monitoring.</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-3xl p-8 space-y-8">
              <div className="text-center">
                <p className="text-[10px] uppercase font-black text-tertiary-fixed-dim tracking-[0.2em] mb-2">Sample Improvement</p>
                <h4 className="text-2xl font-bold">Risk Score: 62 → 87</h4>
              </div>
              <div className="space-y-4">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-on-primary-container">Historical APY</span>
                  <span className="font-mono">8.4%</span>
                </div>
                <div className="flex justify-between items-center text-lg font-bold">
                  <span>Projected AI APY</span>
                  <span className="text-tertiary-fixed-dim">18.2%</span>
                </div>
              </div>
              <button className="w-full py-4 bg-white text-primary-container rounded-xl font-bold hover:bg-surface-container transition-colors">
                See Detailed Case Study
              </button>
            </div>
          </div>
          <div className="absolute top-0 right-0 w-96 h-96 bg-on-tertiary-container/10 blur-[120px] rounded-full"></div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-24 bg-surface-container-lowest">
        <div className="max-w-7xl mx-auto px-6">
          <h2 className="text-3xl font-extrabold text-center mb-16">Prescribed by the Pros</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { quote: '"Yield Doctor flagged a decoupling risk in a pool I\'ve been in for months. Saved me from a 15% loss before anyone even tweeted about it."', name: 'Alex R.', role: 'Yield Farmer', initials: 'AR' },
              { quote: '"The diagnostic report is surprisingly accurate. It found idle assets across 3 chains I\'d completely forgotten about."', name: 'DegenData', role: 'Whale Analyst', initials: 'DD' },
              { quote: '"Boosted my portfolio APY from 5.5% to 14.1% without significantly increasing my risk profile. The doctor is in."', name: 'Sarah K.', role: 'Full-time DeFi', initials: 'SK' },
            ].map((t, i) => (
              <div key={i} className="p-8 rounded-3xl bg-surface-container border border-surface-container-high space-y-4">
                <div className="flex gap-1 text-amber-400 text-sm">★★★★★</div>
                <p className="text-on-surface-variant italic">{t.quote}</p>
                <div className="flex items-center gap-3 pt-4">
                  <div className="w-10 h-10 rounded-full bg-surface-container-high flex items-center justify-center text-xs font-bold text-on-surface-variant">{t.initials}</div>
                  <div>
                    <p className="text-xs font-bold">{t.name}</p>
                    <p className="text-[10px] text-outline uppercase">{t.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Trust & Security */}
      <section className="py-16 border-t border-outline-variant bg-surface-container-low/50">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <h3 className="text-xs uppercase font-black tracking-[0.3em] text-outline mb-10">Institutional Grade Security</h3>
          <div className="flex flex-wrap justify-center gap-8 md:gap-16">
            {[['lock', 'Non-Custodial'], ['visibility', 'Read-Only Access'], ['verified_user', 'Audited Engine']].map(([icon, label]) => (
              <div key={icon} className="flex items-center gap-3 grayscale opacity-60">
                <span className="material-symbols-outlined text-3xl">{icon}</span>
                <span className="font-bold">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA — no textbox, just button */}
      <section className="py-24 px-6 text-center">
        <div className="max-w-3xl mx-auto space-y-8">
          <h2 className="text-4xl md:text-5xl font-extrabold tracking-tighter">Your Portfolio Is Already Losing Yield.</h2>
          <p className="text-xl text-on-surface-variant">Stop guessing. Run a diagnosis now and see exactly how to optimize your capital.</p>
          <div className="flex justify-center pt-6">
            <button
              onClick={handleRunDiagnosis}
              className="bg-primary-container text-white px-10 py-4 rounded-xl font-bold text-lg hover:shadow-xl transition-all active:scale-95"
            >
              Start Diagnosis
            </button>
          </div>
          <p className="text-xs text-outline font-medium">No signup required. Instant analysis.</p>
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
            <p className="text-sm leading-relaxed">Providing institutional-grade clinical diagnostics for the decentralized financial frontier.</p>
          </div>
          <div className="space-y-4">
            <h5 className="text-white text-xs font-black uppercase tracking-widest">Platform</h5>
            <ul className="space-y-2 text-sm">
              <li><a className="hover:text-white transition-colors" href="#">Portfolio Scan</a></li>
              <li><a className="hover:text-white transition-colors" href="#">Vault Explorer</a></li>
              <li><a className="hover:text-white transition-colors" href="/risk-index">Risk Metrics</a></li>
            </ul>
          </div>
          <div className="space-y-4">
            <h5 className="text-white text-xs font-black uppercase tracking-widest">Resources</h5>
            <ul className="space-y-2 text-sm">
              <li><a className="hover:text-white transition-colors" href="#">AI Whitepaper</a></li>
              <li><a className="hover:text-white transition-colors" href="#">Security Audit</a></li>
              <li><a className="hover:text-white transition-colors" href="/api">API Docs</a></li>
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
          <p>© 2024 Yield Doctor. ALL FINANCIAL ADVICE IS GENERATED BY AI MODELS.</p>
          <div className="flex gap-8">
            <a className="hover:text-white transition-colors" href="#">Privacy Policy</a>
            <a className="hover:text-white transition-colors" href="#">Terms of Care</a>
          </div>
        </div>
      </footer>

    </div>
  )
}