import type { Candle } from "./xauApi";
import type { AutoDetection } from "./xauAnalysis";

export interface TradeLevels {
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
}

const INTRADAY_TP_PIPS = [250, 275, 300];
const SWING_TP_PIPS = [1000, 1500, 2000];
const ZONE_BUFFER = 0.5;

export function calculateTradeLevels(
  candles: Candle[],
  direction: "buy" | "sell",
  strategy: "intraday" | "swing",
  detection?: AutoDetection
): TradeLevels | null {
  if (candles.length < 10) return null;
  const last = candles[candles.length - 1];
  const recent = candles.slice(-10, -1);

  const zone = detection?.orderBlock.detected
    ? detection.orderBlock
    : detection?.fvg.detected
    ? detection.fvg
    : null;

  let entry = last.close;
  let stopLoss: number;

  if (zone && zone.zoneHigh !== undefined && zone.zoneLow !== undefined) {
    entry = (zone.zoneHigh + zone.zoneLow) / 2;
    // Stop sits just beyond the SAME zone entry is anchored to, guaranteeing
    // it's always on the correct side — below entry for a buy, above for a
    // sell — instead of drifting independently off "recent" candles.
    stopLoss = direction === "buy" ? zone.zoneLow - ZONE_BUFFER : zone.zoneHigh + ZONE_BUFFER;
  } else {
    stopLoss =
      direction === "buy"
        ? Math.min(...recent.map((c) => c.low), last.low) - ZONE_BUFFER
        : Math.max(...recent.map((c) => c.high), last.high) + ZONE_BUFFER;
  }

  const tpPips = strategy === "intraday" ? INTRADAY_TP_PIPS : SWING_TP_PIPS;
  const tpDollars = tpPips.map((p) => p * 0.1);

  if (direction === "buy") {
    return { entry, stopLoss, tp1: entry + tpDollars[0], tp2: entry + tpDollars[1], tp3: entry + tpDollars[2] };
  }
  return { entry, stopLoss, tp1: entry - tpDollars[0], tp2: entry - tpDollars[1], tp3: entry - tpDollars[2] };
}