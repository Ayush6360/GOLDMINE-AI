import { db } from "@/lib/data/db";
import { convertGoldPrice, formatPrice, viewFor, type Currency } from "@/lib/currency";

/**
 * Alerts engine (ADR-0007). Create/list/delete alerts and evaluate them against
 * fresh data. Evaluation is idempotent: an alert fires once when crossed, then must
 * reset (cross back) before firing again — no spam.
 */

export type AlertType = "price_above" | "price_below" | "direction_flip";
export type AlertState = "armed" | "triggered";

export interface Alert {
  id: number;
  asset: string;
  type: AlertType;
  threshold: number | null;
  currency: Currency;
  state: AlertState;
  createdAt: string;
  lastValue: number | null;
}

export interface TriggeredAlert {
  id: number;
  alertId: number;
  triggeredAt: string;
  message: string;
  value: number;
}

export function createAlert(input: {
  type: AlertType;
  threshold?: number;
  currency?: Currency;
  asset?: string;
}): Alert {
  const createdAt = new Date().toISOString();
  const res = db()
    .prepare(
      `INSERT INTO alerts (asset, type, threshold, currency, state, created_at)
       VALUES (?, ?, ?, ?, 'armed', ?)`,
    )
    .run(
      input.asset ?? "gold",
      input.type,
      input.threshold ?? null,
      input.currency ?? "USD",
      createdAt,
    );
  return getAlert(Number(res.lastInsertRowid))!;
}

export function getAlert(id: number): Alert | null {
  const row = db().prepare(`SELECT * FROM alerts WHERE id = ?`).get(id) as AlertRow | undefined;
  return row ? mapAlert(row) : null;
}

export function listAlerts(): Alert[] {
  const rows = db().prepare(`SELECT * FROM alerts ORDER BY created_at DESC`).all() as AlertRow[];
  return rows.map(mapAlert);
}

export function deleteAlert(id: number): boolean {
  const res = db().prepare(`DELETE FROM alerts WHERE id = ?`).run(id);
  return res.changes > 0;
}

export function listTriggered(limit = 20): TriggeredAlert[] {
  const rows = db()
    .prepare(`SELECT * FROM triggered_alerts ORDER BY triggered_at DESC LIMIT ?`)
    .all(limit) as Array<{ id: number; alert_id: number; triggered_at: string; message: string; value: number }>;
  return rows.map((r) => ({
    id: r.id,
    alertId: r.alert_id,
    triggeredAt: r.triggered_at,
    message: r.message,
    value: r.value,
  }));
}

/**
 * Evaluate all armed alerts against the latest gold price + direction. Returns the
 * newly-triggered alerts. Called after ingestion (ADR-0007).
 *
 * @param usdSpot   latest gold price, USD per oz
 * @param usdInr    current USD/INR rate (for INR-denominated alerts)
 * @param probUp    latest next-day P(up), for direction_flip alerts
 */
export function evaluateAlerts(usdSpot: number, usdInr: number, probUp: number): TriggeredAlert[] {
  const database = db();
  const alerts = listAlerts();
  const fired: TriggeredAlert[] = [];
  const now = new Date().toISOString();

  for (const a of alerts) {
    const priceInCcy = convertGoldPrice(usdSpot, a.currency, usdInr);
    let shouldFire = false;
    let message = "";

    if (a.type === "price_above" && a.threshold !== null) {
      const crossedUp = priceInCcy >= a.threshold && (a.lastValue === null || a.lastValue < a.threshold);
      if (a.state === "armed" && crossedUp) {
        shouldFire = true;
        message = `Gold crossed ABOVE ${formatPrice(a.threshold, viewFor(a.currency))} — now ${formatPrice(priceInCcy, viewFor(a.currency))}.`;
      }
      if (priceInCcy < a.threshold && a.state === "triggered") reArm(database, a.id); // reset
    } else if (a.type === "price_below" && a.threshold !== null) {
      const crossedDown = priceInCcy <= a.threshold && (a.lastValue === null || a.lastValue > a.threshold);
      if (a.state === "armed" && crossedDown) {
        shouldFire = true;
        message = `Gold fell BELOW ${formatPrice(a.threshold, viewFor(a.currency))} — now ${formatPrice(priceInCcy, viewFor(a.currency))}.`;
      }
      if (priceInCcy > a.threshold && a.state === "triggered") reArm(database, a.id);
    } else if (a.type === "direction_flip") {
      // Fire when the next-day lean flips relative to last recorded value.
      const leanUp = probUp >= 0.5 ? 1 : 0;
      if (a.lastValue !== null && a.lastValue !== leanUp && a.state === "armed") {
        shouldFire = true;
        message = `Next-day outlook flipped to ${leanUp ? "LEAN UP ▲" : "LEAN DOWN ▼"} (P(up) ${(probUp * 100).toFixed(0)}%).`;
      }
      database.prepare(`UPDATE alerts SET last_value = ? WHERE id = ?`).run(leanUp, a.id);
    }

    if (shouldFire) {
      const res = database
        .prepare(`INSERT INTO triggered_alerts (alert_id, triggered_at, message, value) VALUES (?, ?, ?, ?)`)
        .run(a.id, now, message, priceInCcy);
      database.prepare(`UPDATE alerts SET state = 'triggered', last_value = ? WHERE id = ?`).run(priceInCcy, a.id);
      fired.push({ id: Number(res.lastInsertRowid), alertId: a.id, triggeredAt: now, message, value: priceInCcy });
    } else if (a.type !== "direction_flip") {
      // Keep last_value fresh for crossing detection next time.
      database.prepare(`UPDATE alerts SET last_value = ? WHERE id = ?`).run(priceInCcy, a.id);
    }
  }
  return fired;
}

function reArm(database: ReturnType<typeof db>, id: number): void {
  database.prepare(`UPDATE alerts SET state = 'armed' WHERE id = ?`).run(id);
}

interface AlertRow {
  id: number;
  asset: string;
  type: string;
  threshold: number | null;
  currency: string;
  state: string;
  created_at: string;
  last_value: number | null;
}

function mapAlert(r: AlertRow): Alert {
  return {
    id: r.id,
    asset: r.asset,
    type: r.type as AlertType,
    threshold: r.threshold,
    currency: (r.currency as Currency) ?? "USD",
    state: r.state as AlertState,
    createdAt: r.created_at,
    lastValue: r.last_value,
  };
}
