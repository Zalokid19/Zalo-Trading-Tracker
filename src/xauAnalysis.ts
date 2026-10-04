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
  bos: DetectionResult;
  fvg: DetectionResult;
  entry: DetectionResult;
  orderBlock: DetectionResult;
}

export interface SwingPoint {
  index: number;
  price: number;
  type: "high" | "low";
}

export function findSwingPoints(candles: Candle[], strength = 2): SwingPoint[] {
  const swings: SwingPoint[] = [];
  for (let i = strength; i < candles.length - strength; i++) {
    const window = candles.slice(i - strength, i + strength + 1);
    const c = candles[i];
    if (c.high === Math.max(...window.map((w) => w.high))) swings.push({ index: i, price: c.high, type: "high" });
    if (c.low === Math.min(...window.map((w) => w.low))) swings.push({ index: i, price: c.low, type: "low" });
  }
  return swings;
}

export function getTrend(swings: SwingPoint[]): "up" | "down" | "range" {
  const highs = swings.filter((s) => s.type === "high").slice(-2);
  const lows = swings.filter((s) => s.type === "low").slice(-2);
  if (highs.length < 2 || lows.length < 2) return "range";
  const higherHighs = highs[1].price > highs[0].price;
  const higherLows = lows[1].price > lows[0].price;
  if (higherHighs && higherLows) return "up";
  if (!higherHighs && !higherLows) return "down";
  return "range";
}

export function findDisplacementIndex(candles: Candle[]): number | null {
  if (candles.length < 15) return null;
  for (let i = candles.length - 1; i >= 10; i--) {
    const lookback = candles.slice(Math.max(0, i - 10), i);
    if (lookback.length === 0) continue;
    const avgRange = lookback.reduce((sum, c) => sum + (c.high - c.low), 0) / lookback.length;
    const c = candles[i];
    const body = Math.abs(c.close - c.open);
    const range = c.high - c.low;
    if (range > avgRange * 1.8 && body > avgRange) return i;
  }
  return null;
}

function detectLiquiditySweep(candles: Candle[]): DetectionResult {
  const swings = findSwingPoints(candles, 2);
  const last = candles[candles.length - 1];
  const lastHigh = [...swings].reverse().find((s) => s.type === "high");
  const lastLow = [...swings].reverse().find((s) => s.type === "low");

  if (lastHigh && last.high > lastHigh.price && last.close < lastHigh.price) {
    return {
      detected: true,
      reason: `Swept the liquidity above the swing high at $${lastHigh.price.toFixed(2)}, closed back below it at $${last.close.toFixed(2)} — stop-hunt before a possible move down.`,
      zoneHigh: lastHigh.price,
    };
  }
  if (lastLow && last.low < lastLow.price && last.close > lastLow.price) {
    return {
      detected: true,
      reason: `Swept the liquidity below the swing low at $${lastLow.price.toFixed(2)}, closed back above it at $${last.close.toFixed(2)} — stop-hunt before a possible move up.`,
      zoneLow: lastLow.price,
    };
  }
  return { detected: false, reason: "No sweep of a real swing high or low yet — price hasn't reached resting liquidity." };
}

function detectDisplacement(candles: Candle[]): DetectionResult {
  const idx = findDisplacementIndex(candles);
  if (idx === null) return { detected: false, reason: "No displacement candle yet — price is moving in normal-sized candles, no real momentum." };
  const c = candles[idx];
  const dir = c.close > c.open ? "up" : "down";
  return { detected: true, reason: `Displacement candle moved ${dir} from $${c.open.toFixed(2)} to $${c.close.toFixed(2)} — real momentum, not chop.` };
}

// A structure break AGAINST the prior trend is a genuine MSS (reversal).
function detectMSS(candles: Candle[], direction: "buy" | "sell"): DetectionResult {
  if (candles.length < 15) return { detected: false, reason: "Not enough candles." };
  const swings = findSwingPoints(candles, 2);
  const trend = getTrend(swings);
  const displacementIdx = findDisplacementIndex(candles);

  if (displacementIdx === null) {
    return { detected: false, reason: "No structure shift yet — needs a displacement move to break the prior swing point." };
  }

  const relevantSwing =
    direction === "buy"
      ? [...swings].reverse().find((s) => s.type === "high" && s.index < displacementIdx)
      : [...swings].reverse().find((s) => s.type === "low" && s.index < displacementIdx);

  if (!relevantSwing) {
    return { detected: false, reason: "No prior swing point to measure a break against yet." };
  }

  const broke =
    direction === "buy"
      ? candles.slice(displacementIdx).some((c) => c.close > relevantSwing.price)
      : candles.slice(displacementIdx).some((c) => c.close < relevantSwing.price);

  if (!broke) {
    return {
      detected: false,
      reason: `Displacement found, but price hasn't closed past the swing ${direction === "buy" ? "high" : "low"} at $${relevantSwing.price.toFixed(2)} yet.`,
    };
  }

  const isReversal = (direction === "buy" && trend !== "up") || (direction === "sell" && trend !== "down");
  if (isReversal) {
    return {
      detected: true,
      reason: `Genuine shift: prior structure was ${trend === "range" ? "sideways" : trend}, and price broke the swing ${direction === "buy" ? "high" : "low"} at $${relevantSwing.price.toFixed(2)} — a real change of character.`,
      zoneHigh: direction === "buy" ? relevantSwing.price : undefined,
      zoneLow: direction === "sell" ? relevantSwing.price : undefined,
    };
  }
  return {
    detected: false,
    reason: `Price broke the swing ${direction === "buy" ? "high" : "low"} at $${relevantSwing.price.toFixed(2)}, but that continues the existing ${trend} trend — that's a Break of Structure, not a fresh MSS.`,
  };
}

// A structure break WITH the prior trend is a Break of Structure (continuation).
function detectBOS(candles: Candle[], direction: "buy" | "sell"): DetectionResult {
  if (candles.length < 15) return { detected: false, reason: "Not enough candles." };
  const swings = findSwingPoints(candles, 2);
  const trend = getTrend(swings);
  const displacementIdx = findDisplacementIndex(candles);

  if (displacementIdx === null) {
    return { detected: false, reason: "No displacement move yet to confirm a break of structure." };
  }

  const relevantSwing =
    direction === "buy"
      ? [...swings].reverse().find((s) => s.type === "high" && s.index < displacementIdx)
      : [...swings].reverse().find((s) => s.type === "low" && s.index < displacementIdx);

  if (!relevantSwing) return { detected: false, reason: "No prior swing point to measure a break against yet." };

  const broke =
    direction === "buy"
      ? candles.slice(displacementIdx).some((c) => c.close > relevantSwing.price)
      : candles.slice(displacementIdx).some((c) => c.close < relevantSwing.price);

  if (!broke) return { detected: false, reason: "No break yet." };

  const isContinuation = (direction === "buy" && trend === "up") || (direction === "sell" && trend === "down");
  if (isContinuation) {
    return {
      detected: true,
      reason: `Break of Structure: the existing ${trend} trend continued, closing past $${relevantSwing.price.toFixed(2)}.`,
      zoneHigh: direction === "buy" ? relevantSwing.price : undefined,
      zoneLow: direction === "sell" ? relevantSwing.price : undefined,
    };
  }
  return { detected: false, reason: "This break reverses the trend — that's an MSS, not a BOS." };
}

function combineMSS(set1: Candle[], set2: Candle[], set3: Candle[], direction: "buy" | "sell"): DetectionResult {
  const m1 = detectMSS(set1, direction);
  const m2 = detectMSS(set2, direction);
  const m3 = detectMSS(set3, direction);
  const confirmedCount = [m1.detected, m2.detected, m3.detected].filter(Boolean).length;
  const which = [m1.detected && "fast", m2.detected && "mid", m3.detected && "slow"].filter(Boolean).join(", ");

  if (confirmedCount >= 2) {
    return {
      detected: true,
      reason: `Change of character confirmed on ${confirmedCount} of 3 timeframes (${which}) — real structure break, same direction.`,
      zoneHigh: m1.zoneHigh ?? m2.zoneHigh ?? m3.zoneHigh,
      zoneLow: m1.zoneLow ?? m2.zoneLow ?? m3.zoneLow,
    };
  }
  return {
    detected: false,
    reason: which ? `MSS only confirmed on the ${which} timeframe — needs at least 2 of 3 aligned before it counts.` : "No genuine change of character on any of the three timeframes yet.",
  };
}

function detectFVG(candles: Candle[], direction: "buy" | "sell"): DetectionResult {
  if (candles.length < 3) return { detected: false, reason: "Not enough candles to check." };
  const recent = candles.slice(-10);
  for (let i = recent.length - 3; i >= 0; i--) {
    const c1 = recent[i];
    const c3 = recent[i + 2];
    if (direction === "buy" && c3.low > c1.high) {
      return { detected: true, reason: `Bullish imbalance between $${c1.high.toFixed(2)} and $${c3.low.toFixed(2)} — candle 1 and candle 3 don't overlap, left unfilled.`, zoneHigh: c3.low, zoneLow: c1.high };
    }
    if (direction === "sell" && c3.high < c1.low) {
      return { detected: true, reason: `Bearish imbalance between $${c3.high.toFixed(2)} and $${c1.low.toFixed(2)} — candle 1 and candle 3 don't overlap, left unfilled.`, zoneHigh: c1.low, zoneLow: c3.high };
    }
  }
  return {
    detected: false,
    reason: direction === "buy"
      ? "No unfilled bullish gap spotted for a BUY — an opposite-direction gap doesn't count toward this setup."
      : "No unfilled bearish gap spotted for a SELL — an opposite-direction gap doesn't count toward this setup.",
  };
}

function detectEntry(fvg: DetectionResult, lastCandle: Candle): DetectionResult {
  if (!fvg.detected || fvg.zoneHigh === undefined || fvg.zoneLow === undefined) {
    return { detected: false, reason: "No FVG found yet to retrace into." };
  }
  const inZone = lastCandle.close <= fvg.zoneHigh && lastCandle.close >= fvg.zoneLow;
  if (inZone) {
    return { detected: true, reason: `Price has retraced back into the most recent FVG ($${fvg.zoneLow.toFixed(2)}–$${fvg.zoneHigh.toFixed(2)}) — valid entry trigger.` };
  }
  return { detected: false, reason: `Most recent FVG is at $${fvg.zoneLow.toFixed(2)}–$${fvg.zoneHigh.toFixed(2)}, but price hasn't retraced into it yet.` };
}

// Order block: the single candle immediately before the displacement leg.
function detectOrderBlock(candles: Candle[], direction: "buy" | "sell"): DetectionResult {
  const displacementIdx = findDisplacementIndex(candles);
  if (displacementIdx === null || displacementIdx < 1) {
    return { detected: false, reason: "No displacement leg yet to anchor an order block to." };
  }
  const c = candles[displacementIdx - 1];
  const isBearish = c.close < c.open;
  const isBullish = c.close > c.open;

  if (direction === "buy" && isBearish) {
    return { detected: true, reason: `Bullish order block: the single down-candle from $${c.open.toFixed(2)} to $${c.close.toFixed(2)}, immediately before the displacement leg up.`, zoneHigh: c.high, zoneLow: c.low };
  }
  if (direction === "sell" && isBullish) {
    return { detected: true, reason: `Bearish order block: the single up-candle from $${c.open.toFixed(2)} to $${c.close.toFixed(2)}, immediately before the displacement leg down.`, zoneHigh: c.high, zoneLow: c.low };
  }
  return { detected: false, reason: "The candle right before the displacement leg doesn't match the order block colour needed for this direction." };
}

export function analyzeXau(
  fastCandles: Candle[],
  midCandles: Candle[],
  slowCandles: Candle[],
  fvgCandles: Candle[],
  direction: "buy" | "sell"
): AutoDetection {
  const fvg = detectFVG(fvgCandles, direction);
  const lastFvgCandle = fvgCandles[fvgCandles.length - 1];

  return {
    liquiditySweep: detectLiquiditySweep(fastCandles),
    displacement: detectDisplacement(fastCandles),
    mss: combineMSS(fastCandles, midCandles, slowCandles, direction),
    bos: detectBOS(fastCandles, direction),
    fvg,
    entry: detectEntry(fvg, lastFvgCandle),
    orderBlock: detectOrderBlock(fastCandles, direction),
  };
}

export function analyzeSingleTimeframe(candles: Candle[], direction: "buy" | "sell"): AutoDetection {
  return analyzeXau(candles, candles, candles, candles, direction);
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
    return `Following your rules step by step: nothing confirmed yet for a ${direction.toUpperCase()}. Not there yet — keep waiting.`;
  }
  return `Here's what's lined up so far for a ${direction.toUpperCase()}, in your rule order: ` + points.join(" ");
}

// ---- Chart-only helpers: higher-timeframe liquidity and previous-day levels ----

export interface LiquidityLevel {
  price: number;
  type: "high" | "low";
  label: string;
}

export function findRecentSweptLevels(candles: Candle[], timeframeLabel: string): LiquidityLevel[] {
  const swings = findSwingPoints(candles, 2);
  const last = candles[candles.length - 1];
  const results: LiquidityLevel[] = [];
  const lastHigh = [...swings].reverse().find((s) => s.type === "high");
  const lastLow = [...swings].reverse().find((s) => s.type === "low");

  if (lastHigh && last.high > lastHigh.price && last.close < lastHigh.price) {
    results.push({ price: lastHigh.price, type: "high", label: `${timeframeLabel} High Swept` });
  }
  if (lastLow && last.low < lastLow.price && last.close > lastLow.price) {
    results.push({ price: lastLow.price, type: "low", label: `${timeframeLabel} Low Swept` });
  }
  return results;
}

export function getPreviousDayLevels(dailyCandles: Candle[]): { high: number; low: number } | null {
  if (dailyCandles.length < 2) return null;
  const yesterday = dailyCandles[dailyCandles.length - 2];
  return { high: yesterday.high, low: yesterday.low };
}

// ---- Support & Resistance zones ----

export interface SRZone {
  type: "support" | "resistance";
  high: number;
  low: number;
}

// Clusters nearby swing lows into a support zone, and swing highs into a resistance zone,
// using the most recent, most-touched cluster rather than just the single latest swing point.
export function findSRZones(candles: Candle[]): { support: SRZone | null; resistance: SRZone | null } {
  const swings = findSwingPoints(candles, 2);
  const lows = swings.filter((s) => s.type === "low");
  const highs = swings.filter((s) => s.type === "high");

  function clusterZone(points: SwingPoint[]): SRZone | null {
    if (points.length === 0) return null;
    const recent = points.slice(-4);
    const anchor = recent[recent.length - 1].price;
    const tolerance = Math.max(anchor * 0.0015, 0.5); // ~0.15% band, or $0.50 minimum
    const cluster = recent.filter((p) => Math.abs(p.price - anchor) <= tolerance);
    const prices = cluster.map((p) => p.price);
    return { type: "low" in points[0] ? "support" : "support", high: Math.max(...prices), low: Math.min(...prices) };
  }

  const supportCluster = clusterZone(lows);
  const resistanceCluster = clusterZone(highs);

  return {
    support: supportCluster ? { type: "support", high: supportCluster.high, low: supportCluster.low } : null,
    resistance: resistanceCluster ? { type: "resistance", high: resistanceCluster.high, low: resistanceCluster.low } : null,
  };
}

export function isNearZone(price: number, zone: SRZone | null, bufferPct = 0.002): boolean {
  if (!zone) return false;
  const buffer = Math.max((zone.high - zone.low) * 0.5, zone.high * bufferPct);
  return price >= zone.low - buffer && price <= zone.high + buffer;
}

// High-confluence check: does this setup's sweep/order-block sit at a real S/R zone?
export function checkSRConfluence(
  candles: Candle[],
  detection: AutoDetection,
  direction: "buy" | "sell"
): { atZone: boolean; zone: SRZone | null; reason: string } {
  const { support, resistance } = findSRZones(candles);
  const relevantZone = direction === "buy" ? support : resistance;
  const referencePrice = detection.orderBlock.zoneLow ?? detection.liquiditySweep.zoneLow ?? detection.liquiditySweep.zoneHigh;

  if (referencePrice === undefined || !isNearZone(referencePrice, relevantZone)) {
    return { atZone: false, zone: relevantZone, reason: "" };
  }

  if (direction === "buy" && detection.mss.detected && (detection.fvg.detected || detection.orderBlock.detected)) {
    return {
      atZone: true,
      zone: relevantZone,
      reason: `High-confluence BUY: price swept into Support ($${relevantZone!.low.toFixed(2)}–$${relevantZone!.high.toFixed(2)}) and formed a bullish MSS with ${detection.fvg.detected ? "an FVG" : "an order block"}.`,
    };
  }
  if (direction === "sell" && detection.mss.detected && (detection.fvg.detected || detection.orderBlock.detected)) {
    return {
      atZone: true,
      zone: relevantZone,
      reason: `High-confluence SELL: price reached Resistance ($${relevantZone!.low.toFixed(2)}–$${relevantZone!.high.toFixed(2)}) and formed a bearish MSS with ${detection.fvg.detected ? "an FVG" : "an order block"}.`,
    };
  }
  return { atZone: false, zone: relevantZone, reason: "" };
}