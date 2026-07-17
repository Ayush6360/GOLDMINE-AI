import type { ForecastResult } from "@/lib/domain/types";

/**
 * Visualizes the probabilistic band so the UNCERTAINTY is the hero, not the point.
 * `fmt` converts a raw USD/oz value into the currently-selected currency view for
 * display, so all forecast numbers respect the USD/INR toggle.
 */
export function ForecastBand({
  forecast,
  spot,
  fmt,
}: {
  forecast: ForecastResult;
  spot: number;
  fmt: (usdPerOz: number) => string;
}) {
  const { lower, central, upper, intervalCoverage, confidence, probUp, horizonDays } = forecast;

  // Map lower..upper onto 0..100%, place spot + central markers (positioning uses
  // raw USD values — conversion is monotonic, so the geometry is identical).
  const range = upper - lower || 1;
  const pos = (v: number) => ((v - lower) / range) * 100;

  return (
    <div className="rounded-xl bg-phoenix-panel/70 p-5 ring-1 ring-white/5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-phoenix-muted">
          {horizonDays}-day probabilistic outlook
        </h3>
        <span className="rounded-full bg-white/5 px-2 py-0.5 text-xs text-phoenix-muted">
          {(intervalCoverage * 100).toFixed(0)}% band
        </span>
      </div>

      <div className="mt-6">
        <div className="relative h-3 rounded-full bg-gradient-to-r from-phoenix-ember/40 via-phoenix-gold/40 to-phoenix-ember/40">
          <div
            className="absolute -top-1 h-5 w-0.5 bg-phoenix-gold"
            style={{ left: `${pos(central)}%` }}
            title={`Central estimate ${fmt(central)}`}
          />
          <div
            className="absolute -top-2 flex flex-col items-center"
            style={{ left: `${pos(spot)}%`, transform: "translateX(-50%)" }}
            title={`Spot ${fmt(spot)}`}
          >
            <div className="h-7 w-0.5 bg-white/70" />
          </div>
        </div>
        <div className="mt-2 flex justify-between text-xs text-phoenix-muted">
          <span>{fmt(lower)}</span>
          <span>{fmt(upper)}</span>
        </div>
      </div>

      <dl className="mt-6 grid grid-cols-3 gap-3 text-center">
        <Stat label="Central" value={fmt(central)} accent />
        <Stat label="P(higher)" value={`${(probUp * 100).toFixed(0)}%`} />
        <Stat label="Confidence" value={`${(confidence * 100).toFixed(0)}%`} />
      </dl>

      <p className="mt-4 text-xs leading-relaxed text-phoenix-muted">
        The band — not the central line — is the forecast. Confidence is deliberately
        conservative; a wide band with modest confidence is the honest read of an
        uncertain market.
      </p>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg bg-black/20 p-3">
      <dt className="text-xs text-phoenix-muted">{label}</dt>
      <dd className={`mt-1 text-lg font-semibold ${accent ? "text-phoenix-gold" : "text-slate-100"}`}>
        {value}
      </dd>
    </div>
  );
}
