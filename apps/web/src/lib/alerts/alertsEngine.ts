import { dbGet, dbAll, dbRun } from "@/lib/data/db";
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

export async function createAlert(input: {
  type: AlertType;
  threshold?: number;
  currency?: Currency;
  asset?: string;
}): Promise<Alert> {
  const createdAt = new Date().toISOString();
  const res = await dbRun(
    `INSERT INTO alerts (asset, type, threshold, currency, state, created_at)
     VALUES (?, ?, ?, ?, 'armed', ?)`,
    [
      input.asset ?? "gold",
      input.type,
      input.threshold ?? null,
      input.currency ?? "USD",
      createdAt,
    ],
  );
  return (await getAlert(Number(res.lastInsertRowid)))!;
}

export async function getAlert(id: number): Promise<Alert | null> {
  const row = await dbGet<AlertRow>(`SELECT * FROM alerts WHERE id = ?`, [id]);
  return row ? mapAlert(row) : null;
}

export async function listAlerts(): Promise<Alert[]> {
  const rows = await dbAll<AlertRow>(`SELECT * FROM alerts ORDER BY created_at DESC`);
  return rows.map(mapAlert);
}

export async function deleteAlert(id: number): Promise<boolean> {
  const res = await dbRun(`DELETE FROM alerts WHERE id = ?`, [id]);
  return res.changes > 0;
}

export async function listTriggered(limit = 20): Promise<TriggeredAlert[]> {
  const rows = await dbAll<{ id: number; alert_id: number; triggered_at: string; message: string; value: number }>(
    `SELECT * FROM triggered_alerts ORDER BY triggered_at DESC LIMIT ?`,
    [limit],
  );
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
export async function evaluateAlerts(usdSpot: number, usdInr: number, probUp: number): Promise<TriggeredAlert[]> {
  const alerts = await listAlerts();
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
      if (priceInCcy < a.threshold && a.state === "triggered") await reArm(a.id); // reset
    } else if (a.type === "price_below" && a.threshold !== null) {
      const crossedDown = priceInCcy <= a.threshold && (a.lastValue === null || a.lastValue > a.threshold);
      if (a.state === "armed" && crossedDown) {
        shouldFire = true;
        message = `Gold fell BELOW ${formatPrice(a.threshold, viewFor(a.currency))} — now ${formatPrice(priceInCcy, viewFor(a.currency))}.`;
      }
      if (priceInCcy > a.threshold && a.state === "triggered") await reArm(a.id);
    } else if (a.type === "direction_flip") {
      // Fire when the next-day lean flips relative to last recorded value.
      const leanUp = probUp >= 0.5 ? 1 : 0;
      if (a.lastValue !== null && a.lastValue !== leanUp && a.state === "armed") {
        shouldFire = true;
        message = `Next-day outlook flipped to ${leanUp ? "LEAN UP ▲" : "LEAN DOWN ▼"} (P(up) ${(probUp * 100).toFixed(0)}%).`;
      }
      await dbRun(`UPDATE alerts SET last_value = ? WHERE id = ?`, [leanUp, a.id]);
    }

    if (shouldFire) {
      const res = await dbRun(
        `INSERT INTO triggered_alerts (alert_id, triggered_at, message, value) VALUES (?, ?, ?, ?)`,
        [a.id, now, message, priceInCcy],
      );
      await dbRun(`UPDATE alerts SET state = 'triggered', last_value = ? WHERE id = ?`, [priceInCcy, a.id]);
      fired.push({ id: Number(res.lastInsertRowid), alertId: a.id, triggeredAt: now, message, value: priceInCcy });
    } else if (a.type !== "direction_flip") {
      // Keep last_value fresh for crossing detection next time.
      await dbRun(`UPDATE alerts SET last_value = ? WHERE id = ?`, [priceInCcy, a.id]);
    }
  }
  return fired;
}

async function reArm(id: number): Promise<void> {
  await dbRun(`UPDATE alerts SET state = 'armed' WHERE id = ?`, [id]);
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
