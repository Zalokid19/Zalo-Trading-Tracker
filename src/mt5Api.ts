const BRIDGE_URL = "http://localhost:5001";

export interface MT5Account {
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  profit: number;
  currency: string;
}

export interface PlaceOrderResult {
  status: "ok" | "error";
  ticket?: number;
  pending?: boolean;
  fill_price?: number;
  message?: string;
}

// With `entry`, the bridge places a pending LIMIT order at that price (expiring after
// `expiresInMinutes`). Without it, it places a market order at the current price.
// Pass `null` for `lot` and the bridge picks the size from balance, equity and free margin.
export async function placeMT5Order(
  direction: "buy" | "sell",
  lot: number | null,
  sl: number,
  tp: number,
  comment: string,
  entry?: number,
  expiresInMinutes?: number
): Promise<PlaceOrderResult> {
  const res = await fetch(`${BRIDGE_URL}/order`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ direction, lot, sl, tp, comment, entry, expires_minutes: expiresInMinutes }),
  });
  return res.json();
}

export interface LotSizing {
  lots: number;
  riskAmount: number; // what the risk rule allows
  riskAtLots: number; // what the chosen lot actually risks if the stop is hit
  riskPct: number;
  marginRequired: number;
  balance: number;
  equity: number;
  freeMargin: number;
  currency: string;
  limitedBy: "risk" | "margin" | "min";
}

// Asks the bridge for the lot size it would use, from the live account. Nothing to type in.
export async function fetchLotSize(
  direction: "buy" | "sell",
  entry: number,
  sl: number
): Promise<{ sizing: LotSizing | null; error: string | null }> {
  try {
    const res = await fetch(`${BRIDGE_URL}/size?direction=${direction}&entry=${entry}&sl=${sl}`);
    const d = await res.json();
    if (d.status !== "ok") return { sizing: null, error: d.message ?? "Could not size this trade." };
    return {
      sizing: {
        lots: d.lots,
        riskAmount: d.risk_amount,
        riskAtLots: d.risk_at_lots,
        riskPct: d.risk_pct,
        marginRequired: d.margin_required,
        balance: d.balance,
        equity: d.equity,
        freeMargin: d.free_margin,
        currency: d.currency,
        limitedBy: d.limited_by,
      },
      error: null,
    };
  } catch {
    return { sizing: null, error: "MT5 bridge isn't running, so the lot size can't be read." };
  }
}

// status: "pending" (limit order waiting) | "open" (filled, running) | "closed" (has profit) | "cancelled"
export async function getMT5DealResult(ticket: number) {
  const res = await fetch(`${BRIDGE_URL}/deal-result?ticket=${ticket}`);
  return res.json();
}

export async function fetchMT5Account(): Promise<MT5Account | null> {
  try {
    const res = await fetch(`${BRIDGE_URL}/account`);
    const data = await res.json();
    if (data.status !== "ok") return null;
    return {
      balance: data.balance,
      equity: data.equity,
      margin: data.margin,
      freeMargin: data.free_margin,
      profit: data.profit,
      currency: data.currency,
    };
  } catch {
    return null; // bridge not running — caller falls back to manual data
  }
}
