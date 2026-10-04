import type { Candle } from "./xauApi";
import { findSwingPoints } from "./xauAnalysis";

export interface SequentialSetup {
  state: "idle" | "waiting" | "fired";
  direction: "buy" | "sell";
  sweepBar?: number;
  sweptLevel?: number;
  sweepExtreme?: number;
  mssBar?: number;
  mssLevel?: number;
  fvgHigh?: number;
  fvgLow?: number;
  entry?: number;
  stopLoss?: number;
  tp1?: number;
  tp2?: number;
  tp3?: number;
  quality: number;
  barsWaited: number;
}

const idleResult = (direction: "buy" | "sell"): SequentialSetup => ({
  state: "idle",
  direction,
  quality: 0,
  barsWaited: 0,
});

function atrSeries(candles: Candle[], period = 14): number[] {
  const tr: number[] = candles.map((c, i) =>
    i === 0
      ? c.high - c.low
      : Math.max(c.high - c.low, Math.abs(c.high - candles[i - 1].close), Math.abs(c.low - candles[i - 1].close))
  );
  return tr.map((_, i) => {
    const start = Math.max(0, i - period + 1);
    const window = tr.slice(start, i + 1);
    return window.reduce((a, b) => a + b, 0) / window.length;
  });
}

// Faithful port of the LunqFX ICT Entry Model: sweep -> MSS (within maxWait bars,
// only valid if the internal level was still unbroken at the sweep) -> FVG search
// on the displacement leg -> entry at the FVG's near edge -> stop at the sweep's
// exact extreme -> target as an R-multiple of that real risk.
export function detectSequentialSetup(
  candles: Candle[],
  direction: "buy" | "sell",
  opts: { pivLen?: number; intLen?: number; maxWait?: number; rrMult?: number; minRiskATRMult?: number } = {}
): SequentialSetup {
  const pivLen = opts.pivLen ?? 8;
  const intLen = opts.intLen ?? 3;
  const maxWait = opts.maxWait ?? 20;
  const rrMult = opts.rrMult ?? 2;
  const minRiskATRMult = opts.minRiskATRMult ?? 0.2;

  if (candles.length < pivLen * 2 + 5) return idleResult(direction);

  const majorSwings = findSwingPoints(candles, pivLen).filter((s) => s.type === (direction === "buy" ? "low" : "high"));
  const minorSwings = findSwingPoints(candles, intLen);
  const atr = atrSeries(candles);

  for (let si = majorSwings.length - 1; si >= 0; si--) {
    const swing = majorSwings[si];
    let sweepIdx = -1;

    for (let i = swing.index + 1; i < candles.length; i++) {
      const c = candles[i];
      if (direction === "buy" && c.low < swing.price && c.close > swing.price) { sweepIdx = i; break; }
      if (direction === "sell" && c.high > swing.price && c.close < swing.price) { sweepIdx = i; break; }
      if (direction === "buy" && c.close < swing.price) break;
      if (direction === "sell" && c.close > swing.price) break;
    }
    if (sweepIdx === -1) continue;

    const priorMinor = direction === "buy"
      ? [...minorSwings].reverse().find((s) => s.type === "high" && s.index < sweepIdx)
      : [...minorSwings].reverse().find((s) => s.type === "low" && s.index < sweepIdx);
    if (!priorMinor) continue;

    const sweepClose = candles[sweepIdx].close;
    const alreadyBroken = direction === "buy" ? sweepClose > priorMinor.price : sweepClose < priorMinor.price;
    if (alreadyBroken) continue; // would "confirm" on the sweep bar itself — invalid

    const sweepExtreme = direction === "buy" ? candles[sweepIdx].low : candles[sweepIdx].high;

    let mssIdx = -1;
    const searchEnd = Math.min(candles.length - 1, sweepIdx + maxWait);
    for (let i = sweepIdx + 1; i <= searchEnd; i++) {
      const c = candles[i];
      if (direction === "buy" && c.close > priorMinor.price) { mssIdx = i; break; }
      if (direction === "sell" && c.close < priorMinor.price) { mssIdx = i; break; }
    }

    const isNewest = si === majorSwings.length - 1;
    const barsSinceSweep = candles.length - 1 - sweepIdx;

    if (mssIdx === -1) {
      if (isNewest && barsSinceSweep <= maxWait) {
        return {
          state: "waiting", direction, sweepBar: sweepIdx, sweptLevel: swing.price,
          sweepExtreme, mssLevel: priorMinor.price, quality: 0, barsWaited: barsSinceSweep,
        };
      }
      continue;
    }

    const barsWaited = mssIdx - sweepIdx;
    const span = Math.min(barsWaited + 4, 18);
    let fvgHigh: number | undefined;
    let fvgLow: number | undefined;
    for (let j = 0; j <= span; j++) {
      const idx = mssIdx - j;
      if (idx - 2 < 0) break;
      const c1 = candles[idx - 2];
      const c3 = candles[idx];
      if (direction === "buy" && c3.low > c1.high) { fvgHigh = c3.low; fvgLow = c1.high; break; }
      if (direction === "sell" && c3.high < c1.low) { fvgHigh = c1.low; fvgLow = c3.high; break; }
    }

    const entry = fvgHigh !== undefined && fvgLow !== undefined
      ? (direction === "buy" ? fvgLow : fvgHigh)
      : priorMinor.price;
    const stopLoss = sweepExtreme;
    const risk = Math.abs(entry - stopLoss);
    const a = Math.max(atr[mssIdx] ?? 1, 0.01);

    if (risk < a * minRiskATRMult) continue;
    if (direction === "buy" && entry <= stopLoss) continue;
    if (direction === "sell" && entry >= stopLoss) continue;
    if (!isNewest && mssIdx < candles.length - 1 - maxWait) continue;

    const tp1 = direction === "buy" ? entry + risk * rrMult : entry - risk * rrMult;
    const tp2 = direction === "buy" ? entry + risk * (rrMult + 1) : entry - risk * (rrMult + 1);
    const tp3 = direction === "buy" ? entry + risk * (rrMult + 2) : entry - risk * (rrMult + 2);

    const depth = Math.abs(sweepExtreme - swing.price) / a;
    const disp = Math.abs(candles[mssIdx].close - priorMinor.price) / a;
    const fSize = fvgHigh !== undefined ? Math.abs(fvgHigh - (fvgLow ?? 0)) / a : 0;
    const qSweep = Math.min(1, depth / 0.45) * 100;
    const qDisp = Math.min(1, disp / 1.2) * 100;
    const qFvg = Math.min(1, fSize / 0.4) * 100;
    const qSpeed = Math.max(0, 1 - barsWaited / maxWait) * 100;
    const quality = Math.round(0.3 * qSweep + 0.3 * qDisp + 0.25 * qFvg + 0.15 * qSpeed);

    return {
      state: "fired", direction, sweepBar: sweepIdx, sweptLevel: swing.price, sweepExtreme,
      mssBar: mssIdx, mssLevel: priorMinor.price, fvgHigh, fvgLow, entry, stopLoss, tp1, tp2, tp3,
      quality, barsWaited,
    };
  }

  return idleResult(direction);
}