// src/pages/RiskIndexPage.jsx
export default function RiskIndexPage() {
  return (
    <div className="bg-surface text-on-surface min-h-screen">

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

      {/* Hero */}
      <section className="pt-32 pb-16 px-6 max-w-5xl mx-auto">
        <div className="mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 text-[10px] font-bold tracking-widest uppercase mb-6">
            <span className="material-symbols-outlined text-sm">verified_user</span>
            Transparent Methodology
          </div>
          <h1 className="text-5xl md:text-6xl font-extrabold tracking-tighter leading-[1.05] text-on-surface mb-4">
            The Risk Index
          </h1>
          <p className="text-xl text-on-surface-variant font-medium leading-relaxed max-w-2xl">
            Every score, every grade, every recommendation — explained in full. No black boxes.
            Here's exactly how Yield Doctor evaluates yield vaults and makes its picks.
          </p>
        </div>

        {/* Quick nav pills */}
        <div className="flex flex-wrap gap-2">
          {['Risk Grade', 'Risk Score', 'APP', "Doctor's Pick"].map(label => (
            <a
              key={label}
              href={`#${label.toLowerCase().replace(/[^a-z]/g, '-').replace(/--+/g, '-')}`}
              className="px-4 py-1.5 bg-surface-container-lowest border border-surface-container-high rounded-full text-xs font-bold text-on-surface-variant hover:border-primary-container hover:text-on-surface transition-all"
            >
              {label}
            </a>
          ))}
        </div>
      </section>

      {/* ── Risk Grade ── */}
      <section id="risk-grade" className="px-6 py-16 max-w-5xl mx-auto border-t border-surface-container">
        <div className="grid md:grid-cols-2 gap-12 items-start">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <span className="material-symbols-outlined text-on-tertiary-container text-2xl">grade</span>
              <h2 className="text-3xl font-extrabold tracking-tight text-on-surface">Risk Grade</h2>
            </div>
            <p className="text-on-surface-variant leading-relaxed mb-6">
              The Risk Grade is a single letter (A–D) that summarises how safe a vault is to deploy capital into.
              It is derived directly from the <strong className="text-on-surface">Risk Score</strong> (explained below)
              and is designed to be the fastest possible signal for decision-making.
            </p>
            <p className="text-on-surface-variant leading-relaxed mb-6">
              Grades are powered by data from <strong className="text-on-surface">DeFiLlama</strong> — specifically
              the statistical volatility (σ), historical APY mean (μ), and pool-level flags like outlier detection
              and impermanent loss risk. All data is refreshed every hour.
            </p>
            <div className="p-4 bg-surface-container rounded-2xl border border-surface-container-high text-sm text-on-surface-variant">
              <span className="material-symbols-outlined text-[14px] align-middle mr-1 text-on-tertiary-container">info</span>
              Vaults without a DeFiLlama match show <strong className="text-on-surface">—</strong>. This does not
              mean they are safe or unsafe — it means we simply lack the data to score them. Use extra caution.
            </div>
          </div>

          <div className="space-y-3">
            {[
              { grade: 'A', score: '≥ 70', color: '#009844', bg: 'rgba(0,152,68,0.08)', border: 'rgba(0,152,68,0.25)', desc: 'Low risk. Strong protocol, stable APY history, deep liquidity. Suitable for conservative capital.' },
              { grade: 'B', score: '45–69', color: '#d97706', bg: 'rgba(217,119,6,0.08)', border: 'rgba(217,119,6,0.25)', desc: 'Moderate risk. Good fundamentals with some APY volatility or newer protocol history.' },
              { grade: 'C', score: '20–44', color: '#ea580c', bg: 'rgba(234,88,12,0.08)', border: 'rgba(234,88,12,0.25)', desc: 'Higher risk. Meaningful volatility, thinner TVL, or lower protocol trust tier.' },
              { grade: 'D', score: '< 20', color: '#ba1a1a', bg: 'rgba(186,26,26,0.08)', border: 'rgba(186,26,26,0.25)', desc: 'High risk. Significant statistical red flags. Only for risk-tolerant positions.' },
            ].map(({ grade, score, color, bg, border, desc }) => (
              <div key={grade} className="flex items-start gap-4 p-4 rounded-2xl border" style={{ background: bg, borderColor: border }}>
                <span
                  className="inline-flex items-center justify-center w-10 h-10 text-base font-black rounded-xl border shrink-0 mt-0.5"
                  style={{ color, background: 'white', borderColor: border }}
                >
                  {grade}
                </span>
                <div>
                  <p className="font-black text-sm" style={{ color }}>Score {score}</p>
                  <p className="text-sm text-on-surface-variant mt-0.5">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Risk Score ── */}
      <section id="risk-score" className="px-6 py-16 max-w-5xl mx-auto border-t border-surface-container">
        <div className="flex items-center gap-3 mb-4">
          <span className="material-symbols-outlined text-on-tertiary-container text-2xl">analytics</span>
          <h2 className="text-3xl font-extrabold tracking-tight text-on-surface">Risk Score (0–100)</h2>
        </div>
        <p className="text-on-surface-variant leading-relaxed mb-10 max-w-2xl">
          The Risk Score is a composite number built from five independent dimensions. Each dimension
          is scored separately and summed to a maximum of 100. Higher is safer.
        </p>

        <div className="space-y-6">
          {[
            {
              icon: 'show_chart',
              title: 'APY Volatility (σ)',
              max: 40,
              color: 'text-on-tertiary-container',
              rows: [
                { label: 'σ < 0.05', pts: 40, desc: 'Extremely stable — almost no APY movement' },
                { label: '0.05 ≤ σ < 0.10', pts: 30, desc: 'Very stable' },
                { label: '0.10 ≤ σ < 0.20', pts: 18, desc: 'Moderate fluctuation' },
                { label: '0.20 ≤ σ < 0.50', pts: 8, desc: 'High fluctuation' },
                { label: 'σ ≥ 0.50', pts: 0, desc: 'Extremely volatile' },
                { label: 'No σ data', pts: 5, desc: 'Default score when DeFiLlama lacks data' },
              ],
              note: 'σ (sigma) is the standard deviation of a pool\'s historical APY from DeFiLlama. This is the single most important signal — APY stability predicts how likely a vault is to maintain its advertised yield.'
            },
            {
              icon: 'history',
              title: 'APY vs Historical Mean (μ drift)',
              max: 20,
              color: 'text-primary-container',
              rows: [
                { label: 'Current < μ', pts: 20, desc: 'APY is below its historical average — conservative signal' },
                { label: 'Drift ≤ 20%', pts: 20, desc: 'Current APY within 20% of historical mean' },
                { label: 'Drift ≤ 50%', pts: 14, desc: 'Moderately above historical mean' },
                { label: 'Drift ≤ 100%', pts: 7, desc: 'Significantly above mean — may revert' },
                { label: 'Drift > 100%', pts: 0, desc: 'APY more than 2× its historical average — high reversion risk' },
                { label: 'No μ data', pts: 5, desc: 'Default when history unavailable' },
              ],
              note: 'μ (mu) is the historical mean APY from DeFiLlama. If a vault\'s current APY is wildly above its own history, it\'s likely unsustainable. We penalise upward outliers.'
            },
            {
              icon: 'hub',
              title: 'Protocol Trust Tier',
              max: 20,
              color: 'text-amber-600',
              rows: [
                { label: 'Tier A protocols', pts: 20, desc: 'Morpho, Aave, Compound, Spark, Euler, Yearn, Beefy, Sky, Maker' },
                { label: 'Tier B protocols', pts: 13, desc: 'Pendle, Ethena, Fluid, Maple, Convex, Curve, Balancer' },
                { label: 'Tier C / Unknown', pts: 6, desc: 'All other protocols without an established track record' },
              ],
              note: 'Protocol tiers are based on audit history, time-in-market, and total historical TVL. This is a static heuristic updated manually as the DeFi ecosystem matures.'
            },
            {
              icon: 'savings',
              title: 'TVL Depth',
              max: 15,
              color: 'text-on-tertiary-container',
              rows: [
                { label: 'TVL ≥ $200M', pts: 15, desc: 'Institutional-grade depth' },
                { label: '$50M–$200M', pts: 12, desc: 'High liquidity' },
                { label: '$10M–$50M', pts: 9, desc: 'Good liquidity' },
                { label: '$1M–$10M', pts: 5, desc: 'Minimum viable depth' },
                { label: '< $1M', pts: 0, desc: 'Not shown — filtered out before display' },
              ],
              note: 'Deeper TVL means your entry and exit moves the price less. It also signals genuine user trust in the protocol. All vaults displayed on Yield Doctor have a minimum $1M TVL floor.'
            },
            {
              icon: 'flag',
              title: 'Pool Flags',
              max: 5,
              color: 'text-error',
              rows: [
                { label: 'No flags', pts: 5, desc: 'Clean pool' },
                { label: 'Outlier detected', pts: '-4', desc: 'DeFiLlama flags this pool as a statistical outlier' },
                { label: 'IL risk = yes', pts: '-1', desc: 'Pool has known impermanent loss exposure (LP positions)' },
              ],
              note: 'Flags come directly from DeFiLlama\'s pool metadata. Outlier pools are ones where the APY or TVL deviates so far from peers that the data may be unreliable. IL risk applies to AMM liquidity positions.'
            },
          ].map(({ icon, title, max, color, rows, note }) => (
            <div key={title} className="bg-surface-container-lowest rounded-2xl border border-surface-container overflow-hidden">
              <div className="px-6 py-4 border-b border-surface-container flex items-center justify-between bg-surface-container-low">
                <div className="flex items-center gap-3">
                  <span className={`material-symbols-outlined text-xl ${color}`}>{icon}</span>
                  <h3 className="font-headline font-bold text-lg text-on-surface">{title}</h3>
                </div>
                <span className="text-xs font-black text-on-surface-variant bg-surface-container px-3 py-1 rounded-full">
                  Max {max} pts
                </span>
              </div>
              <div className="divide-y divide-surface-container">
                {rows.map(({ label, pts, desc }) => (
                  <div key={label} className="grid grid-cols-[180px_50px_1fr] gap-4 items-center px-6 py-3">
                    <span className="font-mono text-xs font-bold text-on-surface">{label}</span>
                    <span className={`font-black text-sm text-center ${Number(pts) > 0 ? 'text-on-tertiary-container' : Number(pts) < 0 ? 'text-error' : 'text-on-surface-variant'}`}>
                      {typeof pts === 'number' && pts > 0 ? `+${pts}` : pts}
                    </span>
                    <span className="text-sm text-on-surface-variant">{desc}</span>
                  </div>
                ))}
              </div>
              {note && (
                <div className="px-6 py-3 bg-surface-container/50 border-t border-surface-container">
                  <p className="text-xs text-on-surface-variant italic">{note}</p>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Score formula */}
        <div className="mt-8 p-6 bg-primary-container text-white rounded-2xl">
          <p className="text-xs font-black uppercase tracking-widest opacity-60 mb-2">Final Formula</p>
          <p className="font-mono text-sm leading-relaxed">
            Risk Score = σ Score (0–40) + μ Drift Score (0–20) + Protocol Trust (0–20) + TVL Depth (0–15) + Flags (0–5)
          </p>
          <p className="text-xs opacity-60 mt-2">Maximum possible score: 100 · Minimum possible score: 0</p>
        </div>
      </section>

      {/* ── APP ── */}
      <section id="app" className="px-6 py-16 max-w-5xl mx-auto border-t border-surface-container">
        <div className="grid md:grid-cols-2 gap-12 items-start">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <span className="material-symbols-outlined text-on-tertiary-container text-2xl">psychology</span>
              <h2 className="text-3xl font-extrabold tracking-tight text-on-surface">APP</h2>
            </div>
            <p className="text-sm font-black uppercase tracking-widest text-on-surface-variant mb-4">
              APY Prediction Probability
            </p>
            <p className="text-on-surface-variant leading-relaxed mb-4">
              APP is a <strong className="text-on-surface">predictive model estimate</strong> sourced directly
              from DeFiLlama. It uses machine learning to predict the likely direction a vault's APY will
              move in the near term, alongside a confidence score.
            </p>
            <p className="text-on-surface-variant leading-relaxed mb-6">
              Yield Doctor displays APP wherever DeFiLlama provides it. We do not modify or recalibrate
              the underlying model outputs.
            </p>
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-sm text-amber-800">
              <strong>Important:</strong> APP is a probabilistic estimate, not a guarantee.
              A 72% up-prediction means the model is 72% confident APY will rise — not that it will
              definitely rise. Always do your own research.
            </div>
          </div>

          <div className="space-y-4">
            {[
              { arrow: '↑', label: 'Up', color: '#009844', bg: 'rgba(0,152,68,0.08)', border: 'rgba(0,152,68,0.2)', desc: 'Model predicts APY is likely to increase. The percentage shown is the model\'s confidence in this direction.' },
              { arrow: '↓', label: 'Down', color: '#ba1a1a', bg: 'rgba(186,26,26,0.08)', border: 'rgba(186,26,26,0.2)', desc: 'Model predicts APY is likely to decrease. Consider whether the current APY is still attractive after a potential drop.' },
              { arrow: '→', label: 'Stable', color: '#76777d', bg: 'rgba(118,119,125,0.08)', border: 'rgba(118,119,125,0.2)', desc: 'Model predicts APY will remain roughly flat. Neutral signal — focus on the Risk Grade and absolute APY level.' },
            ].map(({ arrow, label, color, bg, border, desc }) => (
              <div key={label} className="p-4 rounded-2xl border" style={{ background: bg, borderColor: border }}>
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-2xl font-black" style={{ color }}>{arrow}</span>
                  <span className="font-black text-sm" style={{ color }}>{label}</span>
                </div>
                <p className="text-sm text-on-surface-variant">{desc}</p>
              </div>
            ))}

            <div className="p-4 bg-surface-container rounded-2xl border border-surface-container-high">
              <p className="text-xs font-black uppercase tracking-widest text-on-surface-variant mb-3">Confidence Labels</p>
              <div className="space-y-2">
                {[
                  { label: 'High conf.', color: '#009844', desc: 'Model has high conviction in its prediction' },
                  { label: 'Med conf.', color: '#d97706', desc: 'Moderate conviction — treat with some caution' },
                  { label: 'Low conf.', color: '#ea580c', desc: 'Model is uncertain — treat as a weak signal only' },
                ].map(({ label, color, desc }) => (
                  <div key={label} className="flex items-center gap-3">
                    <span className="text-xs font-bold w-20 shrink-0" style={{ color }}>{label}</span>
                    <span className="text-xs text-on-surface-variant">{desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Doctor's Pick ── */}
      <section id="doctors-pick" className="px-6 py-16 max-w-5xl mx-auto border-t border-surface-container">
        <div className="flex items-center gap-3 mb-4">
          <span className="material-symbols-outlined text-on-tertiary-container text-2xl">verified</span>
          <h2 className="text-3xl font-extrabold tracking-tight text-on-surface">Doctor's Pick</h2>
        </div>
        <p className="text-on-surface-variant leading-relaxed mb-8 max-w-2xl">
          The Doctor's Pick (also shown as "Doctor's Choice") is the single vault on a given chain that
          we recommend as the best balance of <strong className="text-on-surface">yield and safety</strong>.
          One pick per chain, updated whenever vault data refreshes.
        </p>

        <div className="grid md:grid-cols-2 gap-8">
          <div className="space-y-4">
            <h3 className="font-headline font-bold text-lg text-on-surface">Selection Algorithm</h3>
            <div className="space-y-3">
              {[
                { step: '1', title: 'Grade filtering', desc: 'We only consider vaults with the highest available Risk Grade on that chain. We try A first, then B, then C, then D.' },
                { step: '2', title: 'Composite scoring', desc: 'Within the best available grade tier, each vault is scored using a weighted formula: APY Score × 55% + TVL Score × 45%.' },
                { step: '3', title: 'APY Score', desc: 'sqrt(APY / 50), capped at 1. This rewards high APY but with diminishing returns — a vault at 100% APY does not score twice as high as one at 50%.' },
                { step: '4', title: 'TVL Score', desc: 'log10(TVL / $10,000) / 4, capped at 1. This rewards depth but also with diminishing returns — $1B TVL is not 10× better than $100M TVL.' },
                { step: '5', title: 'Tiebreaker', desc: 'If no risk data is available for any vault on the chain, we fall back to highest TVL as the safest proxy signal.' },
              ].map(({ step, title, desc }) => (
                <div key={step} className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-full bg-primary-container text-white flex items-center justify-center text-xs font-black shrink-0 mt-0.5">
                    {step}
                  </div>
                  <div>
                    <p className="font-bold text-sm text-on-surface">{title}</p>
                    <p className="text-sm text-on-surface-variant mt-0.5">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="font-headline font-bold text-lg text-on-surface mb-4">What it is (and isn't)</h3>
            <div className="space-y-3">
              {[
                { icon: 'check_circle', color: 'text-on-tertiary-container', text: 'The best risk-adjusted yield on that chain based on current data' },
                { icon: 'check_circle', color: 'text-on-tertiary-container', text: 'Updated whenever the vault cache refreshes (every 30 minutes)' },
                { icon: 'check_circle', color: 'text-on-tertiary-container', text: 'A data-driven shortcut — not a replacement for your own research' },
                { icon: 'close', color: 'text-error', text: 'Not financial advice or a guarantee of returns' },
                { icon: 'close', color: 'text-error', text: 'Not a prediction of future performance' },
                { icon: 'close', color: 'text-error', text: 'Not aware of smart contract risks or audit findings' },
              ].map(({ icon, color, text }) => (
                <div key={text} className="flex items-start gap-2">
                  <span className={`material-symbols-outlined text-[18px] shrink-0 mt-0.5 ${color}`}>{icon}</span>
                  <p className="text-sm text-on-surface-variant">{text}</p>
                </div>
              ))}
            </div>

            <div className="mt-6 p-4 bg-on-tertiary-container/5 border border-on-tertiary-container/20 rounded-2xl">
              <p className="text-xs font-black uppercase tracking-widest text-on-tertiary-container mb-2">Formula</p>
              <p className="font-mono text-xs text-on-surface leading-relaxed">
                score = sqrt(APY / 50) × 0.55 + log10(TVL / 10,000) / 4 × 0.45
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Data sources */}
      <section className="px-6 py-16 max-w-5xl mx-auto border-t border-surface-container">
        <h2 className="text-2xl font-extrabold tracking-tight text-on-surface mb-6">Data Sources</h2>
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
          {[
            { name: 'DeFiLlama Yields', desc: 'Pool σ, μ, predictions, outlier flags, IL risk', icon: 'database' },
            { name: 'LI.FI Earn API', desc: 'Vault metadata, APY, TVL, underlying tokens, LP tokens', icon: 'api' },
            { name: 'LI.FI Composer', desc: 'Cross-chain deposit and withdrawal routing', icon: 'bolt' },
          ].map(({ name, desc, icon }) => (
            <div key={name} className="p-5 bg-surface-container-lowest border border-surface-container rounded-2xl">
              <span className="material-symbols-outlined text-on-surface-variant text-xl mb-3 block">{icon}</span>
              <p className="font-bold text-sm text-on-surface">{name}</p>
              <p className="text-xs text-on-surface-variant mt-1">{desc}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-on-surface-variant mt-6">
          All data is fetched live and cached for up to 30 minutes for vault data and 1 hour for DeFiLlama pool data.
          Risk scores are recomputed on every cache refresh.
        </p>
      </section>

      {/* Footer */}
      <footer className="border-t border-surface-container py-8 px-6 text-center">
        <p className="text-xs text-on-surface-variant">
          © 2024 Yield Doctor · Risk methodology subject to change. Not financial advice.
        </p>
      </footer>
    </div>
  )
}