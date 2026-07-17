import { ForecastBand } from "@/components/ForecastBand";
import { SignalCard } from "@/components/SignalCard";
import { Sparkline } from "@/components/Sparkline";
import { engine, macroRepo, priceRepo } from "@/lib/container";
import { priceProvenance } from "@/lib/data/cachedRepository";
import { getLiveSentiment } from "@/lib/data/sentimentProvider";

export const dynamic = "force-dynamic";

export default async function Page() {
  const [series, macro] = await Promise.all([
    priceRepo.getSeries("gold", 120),
    macroRepo.getLatest(),
  ]);
  const full = await priceRepo.getSeries("gold", 200);
  const { result: sentiment } = await getLiveSentiment();
  const analysis = await engine.analyze({ asset: "gold", series: full, macro, horizonDays: 30, sentiment });
  const prov = priceProvenance("gold");

  // Next-day directional read for the headline (honest: probability, not a promise).
  const nextDay = await engine.analyze({ asset: "gold", series: full, macro, horizonDays: 1, sentiment });

  const spot = analysis.spot;
  const first = series[0].close;
  const chg = (spot - first) / first;

  return (
    <main className="mx-auto max-w-5xl px-5 py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-2xl">🔥</span>
            <h1 className="text-2xl font-semibold tracking-tight">
              Phoenix <span className="text-phoenix-gold">Gold Intelligence</span>
            </h1>
          </div>
          <p className="mt-1 text-sm text-phoenix-muted">
            Explainable, probabilistic analysis · engine{" "}
            <code className="text-slate-300">
              {analysis.meta.engine}@{analysis.meta.engineVersion}
            </code>
          </p>
        </div>
        <div className="text-right">
          <div className="text-3xl font-semibold text-phoenix-gold">
            ${spot.toLocaleString()}
          </div>
          <div className={`text-sm ${chg >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
            {chg >= 0 ? "▲" : "▼"} {(chg * 100).toFixed(2)}% · 120d
          </div>
        </div>
      </header>

      {prov.live ? (
        <div className="mt-5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-xs text-emerald-200">
          <strong>Live data.</strong> Gold from{" "}
          <code className="text-emerald-100">{prov.source}</code>, as of {prov.asOf}. Macro
          from Yahoo/FRED. Real market data — still probabilistic, never a guarantee.
        </div>
      ) : (
        <div className="mt-5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-200">
          <strong>Sample data.</strong> No live data ingested yet — showing
          deterministic fallback. Run <code>POST /api/ingest</code> to pull real prices.
        </div>
      )}

      <section className="mt-6 rounded-xl border border-phoenix-gold/20 bg-gradient-to-br from-phoenix-panel/90 to-black/30 p-5 ring-1 ring-white/5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-phoenix-muted">Tomorrow — probabilistic read</h2>
          <span className="rounded-full bg-white/5 px-2 py-0.5 text-xs text-phoenix-muted">
            backtested ~56% directional
          </span>
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-x-8 gap-y-2">
          <div>
            <div className="text-xs text-phoenix-muted">Direction</div>
            <div className={`text-2xl font-semibold ${nextDay.forecast.probUp >= 0.5 ? "text-emerald-400" : "text-rose-400"}`}>
              {nextDay.forecast.probUp >= 0.5 ? "▲ Lean up" : "▼ Lean down"}
            </div>
          </div>
          <div>
            <div className="text-xs text-phoenix-muted">P(higher tomorrow)</div>
            <div className="text-2xl font-semibold text-slate-100">
              {(nextDay.forecast.probUp * 100).toFixed(0)}%
            </div>
          </div>
          <div>
            <div className="text-xs text-phoenix-muted">Likely range (80%)</div>
            <div className="text-lg font-semibold text-phoenix-gold">
              ${nextDay.forecast.lower.toLocaleString()} – ${nextDay.forecast.upper.toLocaleString()}
            </div>
          </div>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-phoenix-muted">
          This is a <strong>probability, not a promise</strong>. Next-day gold is near
          a random walk; backtesting shows ~56% directional accuracy — a modest, honest
          edge. The range is the real forecast. {sentiment.scoredCount > 0 && (
            <>News sentiment ({sentiment.scoredCount} headlines, net {sentiment.net.toFixed(2)}) is factored in below.</>
          )}
        </p>
      </section>

      <section className="mt-6 rounded-xl bg-phoenix-panel/70 p-5 ring-1 ring-white/5">
        <h2 className="mb-3 text-sm font-medium text-phoenix-muted">Price context (120 days)</h2>
        <Sparkline series={series} />
      </section>

      <section className="mt-6 grid gap-6 md:grid-cols-2">
        <ForecastBand forecast={analysis.forecast} spot={spot} />
        <div className="rounded-xl bg-phoenix-panel/70 p-5 ring-1 ring-white/5">
          <h3 className="text-sm font-medium text-phoenix-muted">Macro snapshot</h3>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <MacroStat label="DXY (US dollar)" value={macro.dxy.toString()} />
            <MacroStat label="10y real yield" value={`${macro.realYield10y}%`} />
            <MacroStat label="CPI YoY" value={`${macro.cpiYoY}%`} />
            <MacroStat label="Policy rate" value={`${macro.policyRate}%`} />
          </dl>
          <p className="mt-4 text-xs text-phoenix-muted">
            These are the classic gold drivers. The engine encodes their historical
            directional relationships — see the macro signal below for how each
            pushes the outlook.
          </p>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-medium">Why — explainable signals</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {analysis.signals.map((s) => (
            <SignalCard key={s.key} signal={s} />
          ))}
        </div>
      </section>

      <footer className="mt-10 rounded-lg border border-white/10 bg-black/30 p-4 text-xs leading-relaxed text-phoenix-muted">
        <strong className="text-slate-300">Disclaimer. </strong>
        {analysis.disclaimer}
      </footer>
    </main>
  );
}

function MacroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-black/20 p-3">
      <dt className="text-xs text-phoenix-muted">{label}</dt>
      <dd className="mt-1 text-base font-semibold text-slate-100">{value}</dd>
    </div>
  );
}
