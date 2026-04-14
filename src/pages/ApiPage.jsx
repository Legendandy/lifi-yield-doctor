// src/pages/ApiPage.jsx
export default function ApiPage() {
  return (
    <div className="bg-surface text-on-surface min-h-screen flex flex-col">

      {/* Sticky Nav */}
      <nav className="fixed top-0 w-full z-[100] glass border-b border-outline-variant/50 h-16 flex items-center px-6 md:px-12 justify-between">
        <a href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary-container rounded-lg flex items-center justify-center text-white">
            <span className="material-symbols-outlined text-sm">health_and_safety</span>
          </div>
          <span className="text-xl font-extrabold tracking-tighter">Yield Doctor</span>
        </a>
        <div className="hidden md:flex items-center space-x-8 text-sm font-semibold text-on-surface-variant">
          <Link to="/risk-index"className="hover:text-on-tertiary-container transition-colors">Risk Index</Link>
            <Link to="/api"className="hover:text-on-tertiary-container transition-colors">API</Link>
        </div>
        <a
          href="/"
          className="px-5 py-2 bg-primary-container text-white text-sm font-bold rounded-full hover:bg-slate-800 transition-all active:scale-95"
        >
          Launch App
        </a>
      </nav>

      {/* Coming Soon */}
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="text-center max-w-lg space-y-8">
          <div className="w-24 h-24 bg-primary-container rounded-3xl flex items-center justify-center mx-auto shadow-xl">
            <span className="material-symbols-outlined text-white text-4xl">api</span>
          </div>

          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-on-tertiary-container/10 border border-on-tertiary-container/20 text-on-tertiary-container text-[10px] font-bold tracking-widest uppercase mb-5">
              <span className="w-1.5 h-1.5 rounded-full bg-on-tertiary-container animate-pulse" />
              In Development
            </div>
            <h1 className="text-5xl font-extrabold tracking-tighter text-on-surface mb-4">
              API Docs
            </h1>
            <p className="text-xl text-on-surface-variant font-medium leading-relaxed">
              The Yield Doctor public API is coming soon. Access vault risk scores, APY data,
              Doctor's Picks, and more — programmatically.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-left">
            {[
              { icon: 'bolt', label: 'REST API', desc: 'Simple HTTP endpoints' },
              { icon: 'verified_user', label: 'Risk Scores', desc: 'Computed in real-time' },
              { icon: 'hub', label: 'All Chains', desc: '17 networks supported' },
            ].map(({ icon, label, desc }) => (
              <div key={label} className="p-4 bg-surface-container-lowest border border-surface-container rounded-2xl">
                <span className="material-symbols-outlined text-on-surface-variant text-lg mb-2 block">{icon}</span>
                <p className="font-bold text-sm text-on-surface">{label}</p>
                <p className="text-xs text-on-surface-variant mt-0.5">{desc}</p>
              </div>
            ))}
          </div>

          <a
            href="/"
            className="inline-flex items-center gap-2 px-6 py-3 border-2 border-surface-container-high text-sm font-bold text-on-surface-variant rounded-full hover:border-primary-container hover:text-on-surface transition-all"
          >
            <span className="material-symbols-outlined text-[16px]">arrow_back</span>
            Back to Home
          </a>
        </div>
      </div>
    </div>
  )
}