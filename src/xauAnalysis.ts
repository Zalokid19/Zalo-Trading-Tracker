import type { Candle } from "./xauApi";

export interface DetectionResult {
  detected: boolean;
  reason: string;
  zoneHigh?: number;
  zoneLow?: number;
}

export interface AutoDetection {
  liquiditySweep: DetectionResult;
  displacement: DetectionResult;
  mss: DetectionResult;
  fvg: DetectionResult;
  entry: DetectionResult;
  orderBlock: DetectionResult;
}

function detectLiquiditySweep(candles: Candle[]): DetectionResult {
  if (candles.length < 10) return { detected: false, reason: "Not enough recent candles to check." };
  const recent = candles.slice(-10);
  const last = recent[recent.length - 1];
  const prior = recent.slice(0, -1);
  const priorHigh = Math.max(...prior.map((c) => c.high));
  const priorLow = Math.min(...prior.map((c) => c.low));

  if (last.high > priorHigh && last.close < priorHigh) {
    return {
      detected: true,
      reason: `Price wicked above the recent high of $${priorHigh.toFixed(2)} then closed back below it at $${last.close.toFixed(2)} — looks like a stop-hunt before a possible move down.`,
      zoneHigh: priorHigh,
    };
  }
  if (last.low < priorLow && last.close > priorLow) {
    return {
      detected: true,
      reason: `Price wicked below the recent low of $${priorLow.toFixed(2)} then closed back above it at $${last.close.toFixed(2)} — looks like a stop-hunt before a possible move up.`,
      zoneLow: priorLow,
    };
  }
  return { detected: false, reason: `No sweep — price stayed within the recent range ($${priorLow.toFixed(2)}–$${priorHigh.toFixed(2)}).` };
}

// Price displacement: a strong, fast candle (or run of candles) moving well beyond normal range
function detectDisplacement(candles: Candle[]): DetectionResult {
  if (candles.length < 15) return { detected: false, reason: "Not enough candles." };
  const recent = candles.slice(-15);
  const ranges = recent.map((c) => c.high - c.low);
  const avgRange = ranges.slice(0, -1).reduce((a, b) => a + b, 0) / (ranges.length - 1);
  const last = recent[recent.length - 1];
  const lastRange = last.high - last.low;
  const lastMove = Math.abs(last.close - last.open);

  if (lastRange > avgRange * 1.8 && lastMove > avgRange) {
    const dir = last.close > last.open ? "up" : "down";
    return { detected: true, reason: `Last candle moved ${dir} $${lastMove.toFixed(2)}, well beyond the average range of $${avgRange.toFixed(2)} — real displacement, not chop.` };
  }
  return { detected: false, reason: "No strong displacement candle yet — price is moving in normal-sized candles." };
}

// MSS: break of a recent swing point in the direction of the move, on the 1-3min timeframe
function checkMSSOnTimeframe(candles: Candle[], direction: "buy" | "sell"): boolean {
  if (candles.length < 12) return false;
  const recent = candles.slice(-12);
  const swingPoints = recent.slice(0, -3);
  const last3 = recent.slice(-3);

  if (direction === "buy") {
    const swingHigh = Math.max(...swingPoints.map((c) => c.high));
    return last3.some((c) => c.close > swingHigh);
  } else {
    const swingLow = Math.min(...swingPoints.map((c) => c.low));
    return last3.some((c) => c.close < swingLow);
  }
}

function detectMSS(oneMin: Candle[], threeMin: Candle[], fiveMin: Candle[], direction: "buy" | "sell"): DetectionResult {
  const mss1 = checkMSSOnTimeframe(oneMin, direction);
  const mss3 = checkMSSOnTimeframe(threeMin, direction);
  const mss5 = checkMSSOnTimeframe(fiveMin, direction);

  const confirmedCount = [mss1, mss3, mss5].filter(Boolean).length;

  if (mss1 && mss3 && mss5) {
    return { detected: true, reason: `MSS confirmed on all three timeframes (1min, 3min, 5min) — strong same-direction structure break.` };
  }
  if (confirmedCount > 0) {
    const which = [mss1 && "1min", mss3 && "3min", mss5 && "5min"].filter(Boolean).join(", ");
    return { detected: false, reason: `MSS only confirmed on ${which} — needs all three timeframes aligned, not there yet.` };
  }
  return { detected: false, reason: "No structure shift confirmed on any of the 1min/3min/5min timeframes." };
}

function detectFVG(candles: Candle[]): DetectionResult {
  if (candles.length < 3) return { detected: false, reason: "Not enough candles to check." };
  const recent = candles.slice(-10);

  for (let i = recent.length - 3; i >= 0; i--) {
    const c1 = recent[i];
    const c3 = recent[i + 2];
    if (c3.low > c1.high) {
      return {
        detected: true,
        reason: `Bullish gap between $${c1.high.toFixed(2)} and $${c3.low.toFixed(2)} left unfilled — price may return to fill it before continuing up.`,
        zoneHigh: c3.low,
        zoneLow: c1.high,
      };
    }
    if (c3.high < c1.low) {
      return {
        detected: true,
        reason: `Bearish gap between $${c3.high.toFixed(2)} and $${c1.low.toFixed(2)} left unfilled — price may return to fill it before continuing down.`,
        zoneHigh: c1.low,
        zoneLow: c3.high,
      };
    }
  }
  return { detected: false, reason: "No unfilled gap spotted in the recent candles." };
}

// Order block: the last opposite-colored candle before the displacement move that created the MSS
function detectOrderBlock(candles: Candle[], direction: "buy" | "sell"): DetectionResult {
  if (candles.length < 15) return { detected: false, reason: "Not enough candles." };
  const recent = candles.slice(-15);

  for (let i = recent.length - 2; i >= 1; i--) {
    const c = recent[i];
    const isBearish = c.close < c.open;
    const isBullish = c.close > c.open;
    if (direction === "buy" && isBearish) {
      return {
        detected: true,
        reason: `Bullish order block at the down-candle from $${c.open.toFixed(2)} to $${c.close.toFixed(2)}, formed right before the move up.`,
        zoneHigh: c.open,
        zoneLow: c.close,
      };
    }
    if (direction === "sell" && isBullish) {
      return {
        detected: true,
        reason: `Bearish order block at the up-candle from $${c.open.toFixed(2)} to $${c.close.toFixed(2)}, formed right before the move down.`,
        zoneHigh: c.close,
        zoneLow: c.open,
      };
    }
  }
  return { detected: false, reason: "No clear order block candle identified yet." };
}

// Entry trigger: current price has retraced back into the FVG zone found on the 5min
function detectEntry(candles: Candle[], direction: "buy" | "sell"): DetectionResult {
  if (candles.length < 3) return { detected: false, reason: "Not enough candles." };
  const recent = candles.slice(-8);
  const last = recent[recent.length - 1];

  for (let i = recent.length - 3; i >= 0; i--) {
    const c1 = recent[i];
    const c3 = recent[i + 2];

    if (direction === "buy" && c3.low > c1.high) {
      const inZone = last.close <= c3.low && last.close >= c1.high;
      return inZone
        ? { detected: true, reason: `Price has retraced back into the FVG zone ($${c1.high.toFixed(2)}–$${c3.low.toFixed(2)}) — valid entry trigger.` }
        : { detected: false, reason: `FVG found ($${c1.high.toFixed(2)}–$${c3.low.toFixed(2)}) but price hasn't retraced into it yet.` };
    }
    if (direction === "sell" && c3.high < c1.low) {
      const inZone = last.close >= c3.high && last.close <= c1.low;
      return inZone
        ? { detected: true, reason: `Price has retraced back into the FVG zone ($${c3.high.toFixed(2)}–$${c1.low.toFixed(2)}) — valid entry trigger.` }
        : { detected: false, reason: `FVG found ($${c3.high.toFixed(2)}–$${c1.low.toFixed(2)}) but price hasn't retraced into it yet.` };
    }
  }
  return { detected: false, reason: "No FVG found yet to retrace into." };
}

export function analyzeXau(
  oneMinCandles: Candle[],
  threeMinCandles: Candle[],
  fiveMinCandles: Candle[],
  direction: "buy" | "sell"
): AutoDetection {
  return {
    liquiditySweep: detectLiquiditySweep(oneMinCandles),
    displacement: detectDisplacement(oneMinCandles),
    mss: detectMSS(oneMinCandles, threeMinCandles, fiveMinCandles, direction),
    fvg: detectFVG(fiveMinCandles),
    entry: detectEntry(fiveMinCandles, direction),
    orderBlock: detectOrderBlock(oneMinCandles, direction),
  };
}

export function buildPerspective(d: AutoDetection, direction: "buy" | "sell"): string {
  const points: string[] = [];
  if (d.liquiditySweep.detected) points.push(d.liquiditySweep.reason);
  if (d.displacement.detected) points.push(d.displacement.reason);
  if (d.mss.detected) points.push(d.mss.reason);
  if (d.fvg.detected) points.push(d.fvg.reason);
  if (d.entry.detected) points.push(d.entry.reason);
  if (d.orderBlock.detected) points.push(d.orderBlock.reason);

  if (points.length === 0) {
    return `Following your rules step by step: no sweep, no displacement, no MSS confirmed yet for a ${direction.toUpperCase()}. Not there yet — keep waiting.`;
  }
  return `Here's what's lined up so far for a ${direction.toUpperCase()}, in your rule order: ` + points.join(" ");
}