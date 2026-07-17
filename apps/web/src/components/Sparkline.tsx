import type { PricePoint } from "@/lib/domain/types";

/** Dependency-free SVG sparkline. Avoids pulling a charting lib for v0.1. */
export function Sparkline({
  series,
  width = 640,
  height = 160,
}: {
  series: PricePoint[];
  width?: number;
  height?: number;
}) {
  if (series.length < 2) return null;
  const values = series.map((p) => p.close);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = 8;

  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (width - 2 * pad);
    const y = pad + (1 - (v - min) / span) * (height - 2 * pad);
    return [x, y] as const;
  });

  const path = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${path} L${pts[pts.length - 1][0].toFixed(1)},${height - pad} L${pts[0][0].toFixed(1)},${height - pad} Z`;
  const rising = values[values.length - 1] >= values[0];
  const stroke = rising ? "#d4a017" : "#e2571e";

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Price history sparkline">
      <defs>
        <linearGradient id="spark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.25" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#spark)" />
      <path d={path} fill="none" stroke={stroke} strokeWidth={2} strokeLinejoin="round" />
    </svg>
  );
}
