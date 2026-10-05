// ICT structure detectors ported from LuxAlgo "ICT Concepts" (Pine v5):
//   - Market structure: MSS / BOS
//   - Order blocks, and breaker blocks (an order block that price has closed through)
//   - Volume imbalances
// Candles must be ordered oldest -> newest and should be CLOSED candles only.
// Nothing here looks ahead: every event is stamped with the bar that confirmed it.

export interface Bar {
  open: number;
  high: number;
  low: number;
  close: number;
}

export type Dir = 1 | -1; // 1 = bullish, -1 = bearish

// ---------------------------------------------------------------------------
// MSS / BOS
// ---------------------------------------------------------------------------
// LuxAlgo builds a zigzag from pivots (left = len, right = 1 bar). A CLOSE through the last
// opposite swing is an MSS when the trend direction flips, and a BOS when it continues.

export interface StructureEvent {
  kind: "MSS" | "BOS";
  dir: Dir;
  level: number; // the swing price that was broken
  levelIdx: number; // bar where that swing formed
  brokeIdx: number; // bar that closed through it
}

interface ZzPoint {
  d: 0 | 1 | -1;
  x: number;
  y: number;
}

const SEED: ZzPoint = { d: 0, x: 0, y: NaN };

export function detectStructure(c: Bar[], len = 5): StructureEvent[] {
  const events: StructureEvent[] = [];
  const zz: ZzPoint[] = []; // zz[0] is the newest point, like Pine's unshift
  const get = (k: number) => zz[k] ?? SEED;

  let trend: 0 | 1 | -1 = 0;
  let lastMssBull = NaN;
  let lastMssBear = NaN;
  let lastBosBull = NaN;
  let lastBosBear = NaN;

  for (let i = 0; i < c.length; i++) {
    // Pivot sits on bar i-1: `len` bars to its left, 1 bar to its right (bar i).
    const p = i - 1;
    if (p - len >= 0) {
      const hv = c[p].high;
      let isHigh = c[i].high < hv;
      for (let k = p - len; isHigh && k < p; k++) if (c[k].high > hv) isHigh = false;

      const lv = c[p].low;
      let isLow = c[i].low > lv;
      for (let k = p - len; isLow && k < p; k++) if (c[k].low < lv) isLow = false;

      if (isHigh) {
        const cur = get(0);
        if (cur.d < 1) zz.unshift({ d: 1, x: p, y: hv });
        else if (hv > cur.y) {
          cur.x = p;
          cur.y = hv;
        }
      }
      if (isLow) {
        const cur = get(0);
        if (cur.d > -1) zz.unshift({ d: -1, x: p, y: lv });
        else if (lv < cur.y) {
          cur.x = p;
          cur.y = lv;
        }
      }
    }

    // Which swing to test against: the latest high / low that is not the point still being built.
    const iH = get(2).d === 1 ? 2 : 1;
    const iL = get(2).d === -1 ? 2 : 1;
    const H = get(iH);
    const L = get(iL);
    const close = c[i].close;

    if (close > H.y && H.d === 1 && trend < 1) {
      trend = 1;
      lastMssBull = H.y;
      lastBosBull = NaN;
      lastBosBear = NaN;
      events.push({ kind: "MSS", dir: 1, level: H.y, levelIdx: H.x, brokeIdx: i });
    } else if (close < L.y && L.d === -1 && trend > -1) {
      trend = -1;
      lastMssBear = L.y;
      lastBosBull = NaN;
      lastBosBear = NaN;
      events.push({ kind: "MSS", dir: -1, level: L.y, levelIdx: L.x, brokeIdx: i });
    } else if (trend === 1 && close > H.y) {
      if (H.y !== lastBosBull && H.y !== lastMssBull) {
        lastBosBull = H.y;
        events.push({ kind: "BOS", dir: 1, level: H.y, levelIdx: H.x, brokeIdx: i });
      }
    } else if (trend === -1 && close < L.y) {
      if (L.y !== lastBosBear && L.y !== lastMssBear) {
        lastBosBear = L.y;
        events.push({ kind: "BOS", dir: -1, level: L.y, levelIdx: L.x, brokeIdx: i });
      }
    }
  }
  return events;
}

// ---------------------------------------------------------------------------
// Order blocks + breaker blocks
// ---------------------------------------------------------------------------
// A swing top/bottom is found when the bar `length` bars ago is beyond everything since.
// When price CLOSES through that swing, the order block is the extreme candle (by body, by default)
// between the swing and the break: lowest body for a bullish OB, highest body for a bearish OB.
// The OB becomes a BREAKER once a candle BODY closes through its far side. A breaker is dropped
// again if price closes back through its near side.

export interface OrderBlock {
  dir: Dir; // 1 = bullish OB (a demand zone), -1 = bearish OB (a supply zone)
  top: number;
  bottom: number;
  idx: number; // bar of the order block candle
  createdIdx: number; // bar that closed through the swing and created it
  breaker: boolean;
  breakIdx: number | null; // bar whose body closed through the far side
  removedIdx: number | null; // bar that reclaimed a breaker and removed it (null = still alive)
}

export interface OrderBlockOptions {
  length?: number; // swing lookback, LuxAlgo default 10
  useBody?: boolean; // LuxAlgo default true
}

export function detectOrderBlocks(c: Bar[], opts: OrderBlockOptions = {}): OrderBlock[] {
  const length = opts.length ?? 10;
  const useBody = opts.useBody ?? true;
  const n = c.length;
  const out: OrderBlock[] = [];

  const mx = (k: number) => (useBody ? Math.max(c[k].open, c[k].close) : c[k].high);
  const mn = (k: number) => (useBody ? Math.min(c[k].open, c[k].close) : c[k].low);

  let os: 0 | 1 = 0;
  let prevOs: 0 | 1 = 0;
  let top: { y: number; x: number; crossed: boolean } | null = null;
  let btm: { y: number; x: number; crossed: boolean } | null = null;

  for (let i = length; i < n; i++) {
    // Swing detection (one-sided: bar i-length vs the `length` bars after it, current bar included).
    let upper = -Infinity;
    let lower = Infinity;
    for (let k = i - length + 1; k <= i; k++) {
      if (c[k].high > upper) upper = c[k].high;
      if (c[k].low < lower) lower = c[k].low;
    }
    const pivotBar = i - length;
    os = c[pivotBar].high > upper ? 0 : c[pivotBar].low < lower ? 1 : os;
    if (os === 0 && prevOs !== 0) top = { y: c[pivotBar].high, x: pivotBar, crossed: false };
    if (os === 1 && prevOs !== 1) btm = { y: c[pivotBar].low, x: pivotBar, crossed: false };
    prevOs = os;

    // ---- bullish OB: a close above the swing top ----
    if (top && !top.crossed && c[i].close > top.y) {
      top.crossed = true;
      let minima = mx(i - 1);
      let maxima = mn(i - 1);
      let loc = i - 1;
      for (let j = 1; j <= i - top.x - 1; j++) {
        const b = i - j;
        minima = Math.min(mn(b), minima);
        if (minima === mn(b)) {
          maxima = mx(b);
          loc = b;
        }
      }
      out.push({ dir: 1, top: maxima, bottom: minima, idx: loc, createdIdx: i, breaker: false, breakIdx: null, removedIdx: null });
    }
    // ---- bearish OB: a close below the swing bottom ----
    if (btm && !btm.crossed && c[i].close < btm.y) {
      btm.crossed = true;
      let minima = mn(i - 1);
      let maxima = mx(i - 1);
      let loc = i - 1;
      for (let j = 1; j <= i - btm.x - 1; j++) {
        const b = i - j;
        maxima = Math.max(mx(b), maxima);
        if (maxima === mx(b)) {
          minima = mn(b);
          loc = b;
        }
      }
      out.push({ dir: -1, top: maxima, bottom: minima, idx: loc, createdIdx: i, breaker: false, breakIdx: null, removedIdx: null });
    }

    // ---- breaker / removal state for every live block ----
    const bodyLow = Math.min(c[i].open, c[i].close);
    const bodyHigh = Math.max(c[i].open, c[i].close);
    for (const ob of out) {
      if (ob.removedIdx !== null) continue;
      if (ob.dir === 1) {
        if (!ob.breaker) {
          if (bodyLow < ob.bottom) {
            ob.breaker = true;
            ob.breakIdx = i;
          }
        } else if (c[i].close > ob.top) {
          ob.removedIdx = i;
        }
      } else {
        if (!ob.breaker) {
          if (bodyHigh > ob.top) {
            ob.breaker = true;
            ob.breakIdx = i;
          }
        } else if (c[i].close < ob.bottom) {
          ob.removedIdx = i;
        }
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Volume imbalance
// ---------------------------------------------------------------------------
// Bullish: the current candle's body sits entirely above the previous candle's HIGH, yet the
// current candle's lower wick still reaches back below that high (wicks overlap, bodies don't).
// The zone is the gap between the previous body top and the current body bottom. Bearish mirrors it.
// This is NOT an FVG: an FVG needs the wicks of candle 1 and candle 3 not to overlap.

export interface VolumeImbalance {
  dir: Dir;
  top: number;
  bottom: number;
  idx: number; // the candle that completes the imbalance
}

export function detectVolumeImbalances(c: Bar[]): VolumeImbalance[] {
  const out: VolumeImbalance[] = [];
  for (let i = 1; i < c.length; i++) {
    const k = c[i];
    const p = c[i - 1];
    const bodyHi = Math.max(k.open, k.close);
    const bodyLo = Math.min(k.open, k.close);
    const pBodyHi = Math.max(p.open, p.close);
    const pBodyLo = Math.min(p.open, p.close);

    const bull = k.open > p.close && p.high > k.low && k.close > p.close && k.open > p.open && p.high < bodyLo;
    const bear = k.open < p.close && p.low < k.high && k.close < p.close && k.open < p.open && p.low > bodyHi;

    if (bull) out.push({ dir: 1, bottom: pBodyHi, top: bodyLo, idx: i });
    if (bear) out.push({ dir: -1, bottom: bodyHi, top: pBodyLo, idx: i });
  }
  return out;
}

// ---------------------------------------------------------------------------
// One call for everything
// ---------------------------------------------------------------------------

export interface Structures {
  events: StructureEvent[]; // MSS and BOS, oldest -> newest
  orderBlocks: OrderBlock[]; // alive, non-breaker blocks, newest first
  breakers: OrderBlock[]; // alive breaker blocks, newest first
  volumeImbalances: VolumeImbalance[]; // newest first
}

export interface StructureOptions {
  msLen?: number; // market structure pivot length (LuxAlgo default 5)
  obLength?: number; // order block swing lookback (default 10)
  useBody?: boolean; // order block uses candle bodies (default true)
  maxPerKind?: number; // how many of each to hand back (default 3)
}

export function analyseStructures(c: Bar[], opts: StructureOptions = {}): Structures {
  const max = opts.maxPerKind ?? 3;
  const obs = detectOrderBlocks(c, { length: opts.obLength, useBody: opts.useBody });
  const alive = obs.filter((o) => o.removedIdx === null).sort((a, b) => b.createdIdx - a.createdIdx);
  return {
    events: detectStructure(c, opts.msLen ?? 5),
    orderBlocks: alive.filter((o) => !o.breaker).slice(0, max),
    breakers: alive.filter((o) => o.breaker).slice(0, max),
    volumeImbalances: detectVolumeImbalances(c).reverse().slice(0, max),
  };
}

// Convenience for the dashboard's buy / sell switch.
export function forDirection(s: Structures, direction: "buy" | "sell") {
  const d: Dir = direction === "buy" ? 1 : -1;
  return {
    mss: [...s.events].reverse().find((e) => e.kind === "MSS" && e.dir === d) ?? null,
    bos: [...s.events].reverse().find((e) => e.kind === "BOS" && e.dir === d) ?? null,
    orderBlock: s.orderBlocks.find((o) => o.dir === d) ?? null,
    breaker: s.breakers.find((o) => o.dir === d) ?? null,
    volumeImbalance: s.volumeImbalances.find((v) => v.dir === d) ?? null,
  };
}
