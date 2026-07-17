/**
 * Currency + unit conversion for gold display.
 *
 * Phoenix stores gold as USD per troy ounce (Yahoo GC=F). Indian users think in
 * ₹ per 10 grams (the standard local quote), so the INR view needs TWO conversions:
 *   1. currency:  USD → INR  (× fx rate)
 *   2. unit:      troy ounce → 10 grams
 *
 * Constants are exact; getting these wrong would misprice every INR number, so they
 * live in one place with the math spelled out.
 */

export type Currency = "USD" | "INR";

/** 1 troy ounce = 31.1034768 grams (exact, by definition). */
export const GRAMS_PER_TROY_OZ = 31.1034768;

export interface CurrencyView {
  currency: Currency;
  /** Display unit label, e.g. "per oz" or "per 10g". */
  unitLabel: string;
  /** Currency symbol for formatting. */
  symbol: string;
}

export const USD_VIEW: CurrencyView = { currency: "USD", unitLabel: "per oz", symbol: "$" };
export const INR_VIEW: CurrencyView = { currency: "INR", unitLabel: "per 10g", symbol: "₹" };

/**
 * Convert a USD/oz price to the requested view.
 * - USD view: unchanged (USD per troy ounce).
 * - INR view: USD/oz → INR/oz → INR/10g.
 */
export function convertGoldPrice(usdPerOz: number, currency: Currency, usdInr: number): number {
  if (currency === "USD") return usdPerOz;
  const inrPerOz = usdPerOz * usdInr;
  const inrPerGram = inrPerOz / GRAMS_PER_TROY_OZ;
  return inrPerGram * 10; // per 10 grams
}

/** Format a converted value with the right symbol and sensible precision. */
export function formatPrice(value: number, view: CurrencyView): string {
  const opts: Intl.NumberFormatOptions =
    view.currency === "INR"
      ? { maximumFractionDigits: 0 } // ₹ per 10g: whole rupees are enough
      : { minimumFractionDigits: 2, maximumFractionDigits: 2 };
  return `${view.symbol}${value.toLocaleString("en-IN", opts)}`;
}

export function viewFor(currency: Currency): CurrencyView {
  return currency === "INR" ? INR_VIEW : USD_VIEW;
}
