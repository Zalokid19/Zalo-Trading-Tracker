import type { Candle } from "./xauApi";

export interface TradeLevels {
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
}

const INTRADAY_TP_PIPS = [250, 275, 300];
const SWING_TP_PIPS = [1000, 1500, 2000];

export function calculateTradeLevels(
  candles: Candle[],
  direction: "buy" | "sell",
  strategy: "intraday" | "swing"
): TradeLevels | null {
  if (candles.length < 10) return null;
  const last = candles[candles.length - 1];
  const recent = candles.slice(-10, -1);
  const entry = last.close;

  const tpPips = strategy === "intraday" ? INTRADAY_TP_PIPS : SWING_TP_PIPS;
  const tpDollars = tpPips.map((p) => p * 0.1);

  if (direction === "buy") {
    const stopLoss = Math.min(...recent.map((c) => c.low), last.low) - 0.5;
    return {
      entry,
      stopLoss,
      tp1: entry + tpDollars[0],
      tp2: entry + tpDollars[1],
      tp3: entry + tpDollars[2],
    };
  } else {
    const stopLoss = Math.max(...recent.map((c) => c.high), last.high) + 0.5;
    return {
      entry,
      stopLoss,
      tp1: entry - tpDollars[0],
      tp2: entry - tpDollars[1],
      tp3: entry - tpDollars[2],
    };
  }
}