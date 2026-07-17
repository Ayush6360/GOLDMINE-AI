import Link from "next/link";
import type { Currency } from "@/lib/currency";

/**
 * Currency toggle. Uses URL search param (?ccy=) so the choice is shareable and the
 * page stays a server component — no client JS needed for this.
 */
export function CurrencyToggle({ current }: { current: Currency }) {
  const opts: Array<{ ccy: Currency; label: string }> = [
    { ccy: "USD", label: "USD /oz" },
    { ccy: "INR", label: "INR /10g" },
  ];
  return (
    <div className="inline-flex rounded-lg border border-white/10 bg-black/30 p-0.5">
      {opts.map((o) => {
        const active = o.ccy === current;
        return (
          <Link
            key={o.ccy}
            href={`/?ccy=${o.ccy}`}
            className={`rounded-md px-3 py-1 text-xs font-medium transition ${
              active ? "bg-phoenix-gold text-black" : "text-phoenix-muted hover:text-slate-200"
            }`}
          >
            {o.label}
          </Link>
        );
      })}
    </div>
  );
}
