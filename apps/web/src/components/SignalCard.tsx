import type { Signal } from "@/lib/domain/types";

const DIR_STYLE: Record<Signal["direction"], { label: string; cls: string }> = {
  up: { label: "▲ Bullish", cls: "text-emerald-400" },
  down: { label: "▼ Bearish", cls: "text-rose-400" },
  neutral: { label: "● Neutral", cls: "text-phoenix-muted" },
};

/** Every signal renders its drivers — explainability is not optional (ADR-0002). */
export function SignalCard({ signal }: { signal: Signal }) {
  const dir = DIR_STYLE[signal.direction];
  return (
    <div className="rounded-xl bg-phoenix-panel/70 p-4 ring-1 ring-white/5">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-medium text-slate-100">{signal.title}</h4>
        <span className={`text-xs font-semibold ${dir.cls}`}>{dir.label}</span>
      </div>

      <div className="mt-2 h-1.5 w-full rounded-full bg-black/30">
        <div
          className="h-1.5 rounded-full bg-phoenix-gold"
          style={{ width: `${Math.round(signal.strength * 100)}%` }}
        />
      </div>
      <p className="mt-1 text-xs text-phoenix-muted">
        Strength {(signal.strength * 100).toFixed(0)}%
      </p>

      <ul className="mt-3 space-y-2">
        {signal.drivers.map((d, i) => (
          <li key={i} className="text-xs">
            <span className="font-medium text-slate-200">{d.label}: </span>
            <span className="text-phoenix-muted">{d.detail}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
