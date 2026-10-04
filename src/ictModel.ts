// Sequential ICT entry model: liquidity sweep -> market structure shift -> FVG entry -> SL/TP.
// Each step only counts if the previous one happened first, in order.
// Candles must be ordered oldest -> newest and should be CLOSED candles only.

export interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
}

export type Direction = "buy" | "sell";

export interface IctOptions {
  pivLen?: number; // swing length that holds the liquidity being swept
  intLen?: number; // short-term swing whose break confirms the shift
  maxWait?: number; // max bars between sweep and MSS
  rr?: number; // reward multiple for TP1
  minRisk?: number; // min stop distance as a multiple of ATR
  maxAgeBars?: number; // how long a confirmed setup stays "fresh"
}

export interface IctLevels {
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
}

// Where everything sits, as bar indexes into the candle array that was analysed.
// The chart draws straight from this, so it always matches the scorer.
export interface IctGeometry {
  swingIdx: number; // bar where the swept swing formed
  sweepIdx: number; // bar that took the liquidity
  sweptLevel: number; // the swing level that was taken
  sweepExtreme: number; // wick extreme (the stop sits here)
  mssLevel: number; // level whose break confirms the shift
  mssLevelIdx: number; // bar where that short-term swing formed
  mssIdx: number | null; // bar that closed through it (null while still waiting)
  fvg: { top: number; bottom: number; fromIdx: number } | null;
  ob: { top: number; bottom: number; idx: number } | null;
}

export interface IctResult {
  stage: "none" | "swept" | "confirmed";
  direction: Direction | null;
  sweep: boolean;
  displacement: boolean;
  mss: boolean;
  fvg: boolean;
  quality: number; // 0-100, only meaningful when confirmed
  ageBars: number; // bars since the sweep/setup
  entryPassed: boolean; // price already traded through the entry, order can no longer be placed as a limit
  levels: IctLevels | null;
  geometry: IctGeometry | null;
  reasons: { sweep: string; displacement: string; mss: string; fvg: string; entry: string };
}

const NONE: IctResult = {
  stage: "none",
  direction: null,
  sweep: false,
  displacement: false,
  mss: false,
  fvg: false,
  quality: 0,
  ageBars: 0,
  entryPassed: false,
  levels: null,
  geometry: null,
  reasons: {
    sweep: "No swing high or low has been swept and rejected yet.",
    displacement: "No displacement yet.",
    mss: "No market structure shift yet.",
    fvg: "No fair value gap yet.",
    entry: "No entry until the sweep, MSS and FVG are all in place.",
  },
};

interface Fired {
  i: number;
  dir: 1 | -1;
  entry: number;
  sl: number;
  quality: number;
  dispOk: boolean;
  age0: number;
  geo: IctGeometry;
  reasons: IctResult["reasons"];
}

function atrSeries(c: Candle[], len = 14): number[] {
  const out: number[] = new Array(c.length).fill(NaN);
  const tr = c.map((k, i) =>
    i === 0
      ? k.high - k.low
      : Math.max(k.high - k.low, Math.abs(k.high - c[i - 1].close), Math.abs(k.low - c[i - 1].close))
  );
  let sum = 0;
  for (let i = 0; i < c.length; i++) {
    sum += tr[i];
    if (i >= len) sum -= tr[i - len];
    if (i >= len - 1) out[i] = sum / len;
  }
  return out;
}

// A pivot high is confirmed `len` bars after it prints, so there is no repainting.
function pivotHigh(c: Candle[], i: number, len: number): number | null {
  const p = i - len;
  if (p - len < 0) return null;
  const v = c[p].high;
  for (let k = p - len; k <= p + len; k++) {
    if (k === p) continue;
    if (k < p ? c[k].high > v : c[k].high >= v) return null;
  }
  return v;
}

function pivotLow(c: Candle[], i: number, len: number): number | null {
  const p = i - len;
  if (p - len < 0) return null;
  const v = c[p].low;
  for (let k = p - len; k <= p + len; k++) {
    if (k === p) continue;
    if (k < p ? c[k].low < v : c[k].low <= v) return null;
  }
  return v;
}

const f2 = (n: number) => n.toFixed(2);

export function detectIct(candles: Candle[], opts: IctOptions = {}): IctResult {
  const { pivLen = 8, intLen = 3, maxWait = 20, rr = 2, minRisk = 0.2, maxAgeBars = 8 } = opts;
  const n = candles.length;
  if (n < pivLen * 2 + 6) return NONE;

  const atr = atrSeries(candles);

  let swHigh = NaN;
  let swLow = NaN;
  let hiTaken = false;
  let loTaken = false;
  let intHigh = NaN;
  let intLow = NaN;
  let swHighIdx = -1;
  let swLowIdx = -1;
  let intHighIdx = -1;
  let intLowIdx = -1;
  let sweepIdx = -1;
  let swingIdx = -1;
  let mssLevelIdx = -1;

  let state: 0 | 1 = 0;
  let dir: 1 | -1 = 1;
  let sweepExt = NaN;
  let sweptLvl = NaN;
  let mssLevel = NaN;
  let waited = 0;
  let last: Fired | null = null;

  for (let i = 0; i < n; i++) {
    const k = candles[i];

    const ph = pivotHigh(candles, i, pivLen);
    if (ph !== null) {
      swHigh = ph;
      swHighIdx = i - pivLen;
      hiTaken = false;
    }
    const pl = pivotLow(candles, i, pivLen);
    if (pl !== null) {
      swLow = pl;
      swLowIdx = i - pivLen;
      loTaken = false;
    }
    const iph = pivotHigh(candles, i, intLen);
    if (iph !== null) {
      intHigh = iph;
      intHighIdx = i - intLen;
    }
    const ipl = pivotLow(candles, i, intLen);
    if (ipl !== null) {
      intLow = ipl;
      intLowIdx = i - intLen;
    }

    // Stage 1: wick through a swing, close back inside, and the shift level is still unbroken.
    if (state === 0) {
      if (!isNaN(swLow) && !loTaken && k.low < swLow && k.close > swLow && !isNaN(intHigh) && intHigh > k.close) {
        loTaken = true;
        state = 1;
        dir = 1;
        sweepExt = k.low;
        sweptLvl = swLow;
        mssLevel = intHigh;
        sweepIdx = i;
        swingIdx = swLowIdx;
        mssLevelIdx = intHighIdx;
        waited = 0;
      } else if (!isNaN(swHigh) && !hiTaken && k.high > swHigh && k.close < swHigh && !isNaN(intLow) && intLow < k.close) {
        hiTaken = true;
        state = 1;
        dir = -1;
        sweepExt = k.high;
        sweptLvl = swHigh;
        mssLevel = intLow;
        sweepIdx = i;
        swingIdx = swHighIdx;
        mssLevelIdx = intLowIdx;
        waited = 0;
      }
    }

    // Stage 2: a close beyond the internal swing confirms the shift.
    if (state === 1) {
      waited += 1;
      if (waited > maxWait) {
        state = 0;
      } else if ((dir === 1 && k.close > mssLevel) || (dir === -1 && k.close < mssLevel)) {
        // Stage 3: the fair value gap left by the displacement leg.
        let fvgT = NaN;
        let fvgB = NaN;
        let hasFvg = false;
        let fvgFrom = -1;
        const span = Math.min(waited + 4, 18);
        for (let j = 0; j <= span; j++) {
          const a0 = i - j;
          const a2 = i - j - 2;
          if (a2 < 0) break;
          if (dir === 1 && candles[a0].low > candles[a2].high) {
            fvgT = candles[a0].low;
            fvgB = candles[a2].high;
            fvgFrom = a2;
            hasFvg = true;
            break;
          }
          if (dir === -1 && candles[a0].high < candles[a2].low) {
            fvgT = candles[a2].low;
            fvgB = candles[a0].high;
            fvgFrom = a2;
            hasFvg = true;
            break;
          }
        }

        if (hasFvg) {
          const a = Math.max(isNaN(atr[i]) ? 0 : atr[i], 0.01);
          const entry = dir === 1 ? fvgT : fvgB; // near edge of the gap
          const sl = sweepExt;
          const risk = Math.abs(entry - sl);
          const valid = risk > a * minRisk && (dir === 1 ? entry > sl : entry < sl);

          if (valid) {
            const depth = Math.abs(sweepExt - sweptLvl) / a;
            const disp = Math.abs(k.close - mssLevel) / a;
            const fSize = Math.abs(fvgT - fvgB) / a;
            const qSweep = Math.min(1, depth / 0.45) * 100;
            const qDisp = Math.min(1, disp / 1.2) * 100;
            const qFvg = Math.min(1, fSize / 0.4) * 100;
            const qSpeed = Math.max(0, 1 - waited / maxWait) * 100;
            const quality = Math.round(0.3 * qSweep + 0.3 * qDisp + 0.25 * qFvg + 0.15 * qSpeed);
            const buy = dir === 1;
            const tp1 = buy ? entry + risk * rr : entry - risk * rr;

            // Order block: the last opposite-coloured candle before the displacement leg.
            let obIdx = -1;
            for (let q = fvgFrom; q >= sweepIdx && q >= 0; q--) {
              const c = candles[q];
              if (buy ? c.close < c.open : c.close > c.open) {
                obIdx = q;
                break;
              }
            }
            if (obIdx < 0) obIdx = Math.max(sweepIdx, 0);

            last = {
              i,
              dir,
              entry,
              sl,
              quality,
              dispOk: qDisp >= 50,
              age0: waited,
              geo: {
                swingIdx,
                sweepIdx,
                sweptLevel: sweptLvl,
                sweepExtreme: sweepExt,
                mssLevel,
                mssLevelIdx,
                mssIdx: i,
                fvg: { top: Math.max(fvgT, fvgB), bottom: Math.min(fvgT, fvgB), fromIdx: fvgFrom },
                ob: { top: candles[obIdx].high, bottom: candles[obIdx].low, idx: obIdx },
              },
              reasons: {
                sweep: `Price swept the ${buy ? "low" : "high"} at ${f2(sweptLvl)} (wick to ${f2(sweepExt)}) and closed back inside.`,
                displacement: `The shift closed ${disp.toFixed(1)}x ATR beyond the broken level.`,
                mss: `Closed ${buy ? "above" : "below"} the internal ${buy ? "high" : "low"} at ${f2(mssLevel)}, ${waited} bars after the sweep.`,
                fvg: `Fair value gap ${f2(Math.min(fvgT, fvgB))} to ${f2(Math.max(fvgT, fvgB))}.`,
                entry: `Entry ${f2(entry)}, stop ${f2(sl)}, target ${f2(tp1)} (${rr}R).`,
              },
            };
          }
        }
        state = 0;
      }
    }
  }

  // A fresh, still-alive confirmed setup wins over everything else.
  if (last) {
    const age = n - 1 - last.i;
    if (age <= maxAgeBars) {
      const buy = last.dir === 1;
      const risk = Math.abs(last.entry - last.sl);
      const mult = (m: number) => (buy ? last!.entry + risk * m : last!.entry - risk * m);
      const tp1 = mult(rr);
      let dead = false;
      let touched = false;
      for (let j = last.i + 1; j < n; j++) {
        const k = candles[j];
        if (buy) {
          if (k.low <= last.sl || k.high >= tp1) dead = true;
          if (k.low <= last.entry) touched = true;
        } else {
          if (k.high >= last.sl || k.low <= tp1) dead = true;
          if (k.high >= last.entry) touched = true;
        }
      }
      if (!dead) {
        const close = candles[n - 1].close;
        const entryPassed = touched || (buy ? close <= last.entry : close >= last.entry);
        return {
          stage: "confirmed",
          direction: buy ? "buy" : "sell",
          sweep: true,
          displacement: last.dispOk,
          mss: true,
          fvg: true,
          quality: last.quality,
          ageBars: age,
          entryPassed,
          levels: { entry: last.entry, stopLoss: last.sl, tp1, tp2: mult(rr + 1), tp3: mult(rr + 2) },
          geometry: last.geo,
          reasons: last.reasons,
        };
      }
    }
  }

  // Otherwise: a sweep happened and we are waiting for the shift.
  if (state === 1) {
    const buy = dir === 1;
    return {
      ...NONE,
      stage: "swept",
      direction: buy ? "buy" : "sell",
      sweep: true,
      ageBars: waited,
      geometry: {
        swingIdx,
        sweepIdx,
        sweptLevel: sweptLvl,
        sweepExtreme: sweepExt,
        mssLevel,
        mssLevelIdx,
        mssIdx: null,
        fvg: null,
        ob: null,
      },
      reasons: {
        ...NONE.reasons,
        sweep: `Price swept the ${buy ? "low" : "high"} at ${f2(sweptLvl)} (wick to ${f2(sweepExt)}) and closed back inside.`,
        mss: `Waiting for a close ${buy ? "above" : "below"} ${f2(mssLevel)} (bar ${waited} of ${maxWait}).`,
      },
    };
  }

  return NONE;
}
