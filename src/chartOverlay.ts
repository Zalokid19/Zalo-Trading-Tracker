import type {
  IChartApi,
  ISeriesApi,
  ISeriesPrimitive,
  IPrimitivePaneView,
  IPrimitivePaneRenderer,
  SeriesAttachedParameter,
  Logical,
  Time,
} from "lightweight-charts";
import type { IctResult } from "./ictModel";

// ---------- yesterday's liquidity ----------

export interface PrevDay {
  high: number;
  low: number;
  highSwept: boolean;
  lowSwept: boolean;
}

// Daily candles, oldest -> newest. The last one is today (still forming).
export function prevDayFrom(day: { high: number; low: number }[]): PrevDay | null {
  if (day.length < 2) return null;
  const y = day[day.length - 2];
  const t = day[day.length - 1];
  return { high: y.high, low: y.low, highSwept: t.high > y.high, lowSwept: t.low < y.low };
}

// ---------- swing liquidity ----------

export interface Pool {
  kind: "high" | "low";
  price: number;
  idx: number; // bar where the swing formed
  sweptIdx: number | null; // first bar that traded through it, if any
}

const LIQ_LEN = 5; // a swing needs this many lower (or higher) bars on each side
const MAX_SWEPT_SHOWN = 1; // only the most recent taken level stays; untouched liquidity always stays

// Every swing high and low is resting liquidity until price trades through it.
export function findLiquidity(candles: { high: number; low: number }[]): Pool[] {
  const n = candles.length;
  const pools: Pool[] = [];
  // The newest candle is still forming, so swings are only confirmed on closed candles.
  for (let p = LIQ_LEN; p <= n - 2 - LIQ_LEN; p++) {
    let isHigh = true;
    let isLow = true;
    for (let k = p - LIQ_LEN; k <= p + LIQ_LEN; k++) {
      if (k === p) continue;
      if (k < p ? candles[k].high > candles[p].high : candles[k].high >= candles[p].high) isHigh = false;
      if (k < p ? candles[k].low < candles[p].low : candles[k].low <= candles[p].low) isLow = false;
    }
    if (isHigh) {
      let sweptIdx: number | null = null;
      for (let q = p + 1; q < n; q++) {
        if (candles[q].high > candles[p].high) {
          sweptIdx = q;
          break;
        }
      }
      pools.push({ kind: "high", price: candles[p].high, idx: p, sweptIdx });
    }
    if (isLow) {
      let sweptIdx: number | null = null;
      for (let q = p + 1; q < n; q++) {
        if (candles[q].low < candles[p].low) {
          sweptIdx = q;
          break;
        }
      }
      pools.push({ kind: "low", price: candles[p].low, idx: p, sweptIdx });
    }
  }
  const resting = pools.filter((x) => x.sweptIdx === null);
  const taken = pools
    .filter((x) => x.sweptIdx !== null)
    .sort((a, b) => (b.sweptIdx as number) - (a.sweptIdx as number))
    .slice(0, MAX_SWEPT_SHOWN);
  return [...taken, ...resting];
}

// ---------- shapes ----------

// A bar index, or the left / right edge of the chart pane.
export type Edge = number | "left" | "edge";

export interface BoxShape {
  kind: "box";
  i1: Edge;
  i2: Edge;
  top: number;
  bottom: number;
  fill: string;
  label?: string; // centred inside the box
  labelColor?: string;
}

export interface LineShape {
  kind: "line";
  i1: Edge;
  i2: Edge;
  price: number;
  color: string;
  width: number;
  dash?: number[];
  label?: string; // sits in a gap in the line
  labelColor?: string;
  labelFrac?: number; // preferred position along the chart width, 0..1
}

// Speech-bubble tag pointing at a price level (Stop loss / Entry / Take Profit).
export interface CalloutShape {
  kind: "callout";
  i: number;
  price: number;
  text: string;
  color: string;
}

export type Shape = BoxShape | LineShape | CalloutShape;

export interface Zone {
  high: number;
  low: number;
}

export interface SRZones {
  support: Zone | null;
  resistance: Zone | null;
}

// Wording on the chart. Change the text here if you'd rather it said Buyside / Sellside.
const TEXT = {
  liquidity: "Liquidity $",
  swept: "Liquidity swept $",
  fvg: "FVG",
  ob: "OB",
  support: "SUPPORT ZONE",
  resistance: "RESISTANCE ZONE",
  yHigh: "Yesterday High",
  yLow: "Yesterday Low",
  stop: "Stop loss",
  entry: "Entry",
  target: "Take Profit",
};

// Colours. Red = sellside (highs, resistance, bearish), green = buyside (lows, support, bullish).
export const COLORS = {
  line: "#000000",
  red: "#d6293f",
  green: "#14a38b",
  muted: "#6b7280",
  zone: "rgba(110, 110, 110, 0.20)", // support / resistance
  fvg: "rgba(110, 110, 110, 0.32)",
  ob: "rgba(110, 110, 110, 0.24)",
  stopZone: "rgba(110, 110, 110, 0.45)", // entry to stop: light grey
  targetZone: "rgba(110, 205, 175, 0.32)", // entry to target: light green
  callout: "#4db6a1",
  calloutBorder: "#3f9f8b",
};

// One setup, drawn once, in the same look as the TradingView chart: black liquidity lines with
// coloured text in a gap, grey zones with coloured text, and the long / short box with callouts.
// `lastIdx` is the index of the newest candle.
export function buildShapes(
  r: IctResult | null,
  prevDay: PrevDay | null,
  lastIdx: number,
  pools: Pool[] = [],
  sr: SRZones | null = null
): Shape[] {
  const shapes: Shape[] = [];
  const g = r?.geometry;
  const hasSetup = !!r && !!g && r.stage !== "none";

  // Support / resistance zones go underneath everything.
  if (sr?.resistance) {
    shapes.push({ kind: "box", i1: "left", i2: "edge", top: sr.resistance.high, bottom: sr.resistance.low, fill: COLORS.zone, label: TEXT.resistance, labelColor: COLORS.red });
  }
  if (sr?.support) {
    shapes.push({ kind: "box", i1: "left", i2: "edge", top: sr.support.high, bottom: sr.support.low, fill: COLORS.zone, label: TEXT.support, labelColor: COLORS.green });
  }

  const end = lastIdx + 12; // right edge of the setup boxes

  // The setup's own zones, drawn before the lines so the lines sit on top.
  if (r && g && hasSetup) {
    const buy = r.direction === "buy";
    const side = buy ? COLORS.green : COLORS.red;
    if (g.ob) {
      shapes.push({ kind: "box", i1: g.ob.idx, i2: end, top: g.ob.top, bottom: g.ob.bottom, fill: COLORS.ob, label: TEXT.ob, labelColor: side });
    }
    if (g.fvg) {
      shapes.push({ kind: "box", i1: g.fvg.fromIdx, i2: end, top: g.fvg.top, bottom: g.fvg.bottom, fill: COLORS.fvg, label: TEXT.fvg, labelColor: side });
    }
    if (r.stage === "confirmed" && r.levels) {
      const { entry, stopLoss, tp1 } = r.levels;
      // Long / short position tool, starting at the newest candle like the TradingView tool.
      shapes.push({ kind: "box", i1: lastIdx, i2: end, top: buy ? entry : stopLoss, bottom: buy ? stopLoss : entry, fill: COLORS.stopZone });
      shapes.push({ kind: "box", i1: lastIdx, i2: end, top: buy ? tp1 : entry, bottom: buy ? entry : tp1, fill: COLORS.targetZone });
    }
  }

  // Yesterday's high and low.
  if (prevDay) {
    shapes.push({
      kind: "line", i1: "left", i2: "edge", price: prevDay.high, color: COLORS.line, width: 1.5,
      label: prevDay.highSwept ? `${TEXT.yHigh} · swept` : TEXT.yHigh, labelColor: COLORS.red, labelFrac: 0.1,
    });
    shapes.push({
      kind: "line", i1: "left", i2: "edge", price: prevDay.low, color: COLORS.line, width: 1.5,
      label: prevDay.lowSwept ? `${TEXT.yLow} · swept` : TEXT.yLow, labelColor: COLORS.red, labelFrac: 0.1,
    });
  }

  // The setup's lines: the liquidity it took and the structure shift.
  if (r && g && hasSetup) {
    const buy = r.direction === "buy";
    const side = buy ? COLORS.green : COLORS.red;
    shapes.push({
      kind: "line", i1: g.swingIdx, i2: g.sweepIdx, price: g.sweptLevel, color: COLORS.line, width: 1.5, dash: [4, 3],
      label: TEXT.swept, labelColor: side, // a swept low is buyside (green), a swept high is sellside (red)
    });
    if (g.mssIdx === null) {
      shapes.push({
        kind: "line", i1: g.mssLevelIdx, i2: "edge", price: g.mssLevel, color: COLORS.muted, width: 1.5, dash: [6, 4],
        label: "Waiting for MSS", labelColor: COLORS.muted,
      });
    } else {
      shapes.push({
        kind: "line", i1: g.mssLevelIdx, i2: g.mssIdx, price: g.mssLevel, color: COLORS.line, width: 1.5,
        label: "MSS", labelColor: side,
      });
    }
  }

  // Swing liquidity: black line, coloured text, $ sign. Untouched ones all stay; of the ones price
  // has taken, only the most recent stays, and only when a setup isn't already showing its own.
  const tolerance = (prevDay ? Math.max(prevDay.high, prevDay.low) : 0) * 0.0002;
  for (const pool of pools) {
    if (hasSetup && pool.sweptIdx !== null) continue;
    if (pool.idx === g?.swingIdx) continue; // the setup draws this one
    if (prevDay && (Math.abs(pool.price - prevDay.high) <= tolerance || Math.abs(pool.price - prevDay.low) <= tolerance)) continue;
    const taken = pool.sweptIdx !== null;
    shapes.push({
      kind: "line",
      i1: taken ? pool.idx : "left",
      i2: taken ? (pool.sweptIdx as number) : "edge",
      price: pool.price,
      color: COLORS.line,
      width: 1.25,
      dash: taken ? [4, 3] : undefined,
      label: taken ? TEXT.swept : TEXT.liquidity,
      labelColor: pool.kind === "high" ? COLORS.red : COLORS.green,
      labelFrac: 0.25 + (Math.round(pool.price * 10) % 5) * 0.12,
    });
  }

  // Callouts last, so they sit on top.
  if (r && r.stage === "confirmed" && r.levels && g) {
    const { entry, stopLoss, tp1 } = r.levels;
    shapes.push({ kind: "callout", i: end, price: stopLoss, text: TEXT.stop, color: COLORS.callout });
    shapes.push({ kind: "callout", i: end, price: entry, text: TEXT.entry, color: COLORS.callout });
    shapes.push({ kind: "callout", i: end, price: tp1, text: TEXT.target, color: COLORS.callout });
  }

  return shapes;
}

// ---------- the primitive that paints them ----------

type DrawTarget = Parameters<IPrimitivePaneRenderer["draw"]>[0];

const FONT = '-apple-system, "Segoe UI", Roboto, sans-serif';
const widthCache = new Map<string, number>();

interface Rect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}
const overlaps = (a: Rect, b: Rect) => a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1;

export class ShapesPrimitive implements ISeriesPrimitive<Time> {
  private chart: IChartApi | null = null;
  private series: ISeriesApi<"Candlestick"> | null = null;
  private requestUpdate: (() => void) | null = null;
  private shapes: Shape[] = [];

  private readonly renderer: IPrimitivePaneRenderer = { draw: (target) => this.draw(target) };
  private readonly view: IPrimitivePaneView = { zOrder: () => "normal", renderer: () => this.renderer };

  attached(param: SeriesAttachedParameter<Time>): void {
    this.chart = param.chart;
    this.series = param.series as ISeriesApi<"Candlestick">;
    this.requestUpdate = param.requestUpdate;
  }

  detached(): void {
    this.chart = null;
    this.series = null;
    this.requestUpdate = null;
  }

  setShapes(shapes: Shape[], _lastIdx = 0): void {
    this.shapes = shapes;
    this.requestUpdate?.();
  }

  updateAllViews(): void {}

  paneViews(): readonly IPrimitivePaneView[] {
    return [this.view];
  }

  private draw(target: DrawTarget): void {
    const chart = this.chart;
    const series = this.series;
    if (!chart || !series) return;
    const ts = chart.timeScale();

    target.useBitmapCoordinateSpace(({ context: ctx, horizontalPixelRatio: hr, verticalPixelRatio: vr, bitmapSize }) => {
      const W = bitmapSize.width;
      const H = bitmapSize.height;
      const xOf = (e: Edge): number | null => {
        if (e === "left") return 0;
        if (e === "edge") return W;
        const x = ts.logicalToCoordinate(e as Logical);
        return x === null ? null : x * hr;
      };
      const yOf = (p: number): number | null => {
        const y = series.priceToCoordinate(p);
        return y === null ? null : y * vr;
      };
      const widthOf = (font: string, text: string): number => {
        const key = `${font}|${text}`;
        let w = widthCache.get(key);
        if (w === undefined) {
          ctx.font = font;
          w = ctx.measureText(text).width;
          widthCache.set(key, w);
        }
        return w;
      };

      // 1) Zones.
      for (const s of this.shapes) {
        if (s.kind !== "box") continue;
        const x1 = xOf(s.i1);
        const x2 = xOf(s.i2);
        const ya = yOf(s.top);
        const yb = yOf(s.bottom);
        if (x1 === null || x2 === null || ya === null || yb === null) continue;
        const left = Math.min(x1, x2);
        const right = Math.max(x1, x2);
        const top = Math.min(ya, yb);
        const height = Math.max(Math.abs(yb - ya), 2 * vr);
        ctx.fillStyle = s.fill;
        ctx.fillRect(left, top, right - left, height);

        if (s.label) {
          const visL = Math.max(left, 0);
          const visR = Math.min(right, W);
          const visT = Math.max(top, 0);
          const visB = Math.min(top + height, H);
          if (visR - visL > 24 * hr && visB - visT > 14 * vr) {
            ctx.font = `700 ${Math.round(13 * vr)}px ${FONT}`;
            ctx.fillStyle = s.labelColor ?? "#374151";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(s.label, (visL + visR) / 2, (visT + visB) / 2);
          }
        }
      }

      // 2) Lines, with their text sitting in a gap. Labels never stack: if a spot is taken the
      //    text slides along the line to a free one, or is left out (the line is still drawn).
      const taken: Rect[] = [];
      const labelFont = `italic 700 ${Math.round(13 * vr)}px ${FONT}`;
      for (const s of this.shapes) {
        if (s.kind !== "line") continue;
        const x1 = xOf(s.i1);
        const x2 = xOf(s.i2);
        const y0 = yOf(s.price);
        if (x1 === null || x2 === null || y0 === null) continue;
        const xa = Math.min(x1, x2);
        const xb = Math.max(x1, x2);
        if (xb < 0 || xa > W) continue;

        const lw = Math.max(1, Math.round(s.width * hr));
        const y = Math.round(y0) + (lw % 2 ? 0.5 : 0);
        ctx.strokeStyle = s.color;
        ctx.lineWidth = lw;
        ctx.setLineDash((s.dash ?? []).map((d) => d * hr));
        const seg = (a: number, b: number) => {
          if (b <= a) return;
          ctx.beginPath();
          ctx.moveTo(a, y);
          ctx.lineTo(b, y);
          ctx.stroke();
        };

        if (!s.label) {
          seg(xa, xb);
          continue;
        }

        const tw = widthOf(labelFont, s.label);
        const half = tw / 2 + 8 * hr;
        const visL = Math.max(xa, 0);
        const visR = Math.min(xb, W);
        const lo = visL + half + 6 * hr;
        const hi = visR - half - 6 * hr;

        if (hi < lo) {
          // Too short to hold the text: draw the line and put the text just above it.
          seg(xa, xb);
          const cx = Math.min(Math.max((visL + visR) / 2, tw / 2 + 4 * hr), W - tw / 2 - 4 * hr);
          const box: Rect = { x1: cx - tw / 2, x2: cx + tw / 2, y1: y - 17 * vr, y2: y - 2 * vr };
          if (!taken.some((t) => overlaps(t, box))) {
            taken.push(box);
            ctx.setLineDash([]);
            ctx.font = labelFont;
            ctx.fillStyle = s.labelColor ?? s.color;
            ctx.textAlign = "center";
            ctx.textBaseline = "bottom";
            ctx.fillText(s.label, cx, y - 3 * vr);
          }
          continue;
        }

        const seeds = [s.labelFrac !== undefined ? W * s.labelFrac : (visL + visR) / 2, W * 0.2, W * 0.35, W * 0.5, W * 0.65, W * 0.8];
        let cx: number | null = null;
        for (const seed of seeds) {
          const c = Math.min(Math.max(seed, lo), hi);
          const box: Rect = { x1: c - half, x2: c + half, y1: y - 9 * vr, y2: y + 9 * vr };
          if (!taken.some((t) => overlaps(t, box))) {
            cx = c;
            taken.push(box);
            break;
          }
        }
        if (cx === null) {
          seg(xa, xb);
          continue;
        }
        seg(xa, cx - half);
        seg(cx + half, xb);
        ctx.setLineDash([]);
        ctx.font = labelFont;
        ctx.fillStyle = s.labelColor ?? s.color;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(s.label, cx, y + vr);
      }
      ctx.setLineDash([]);

      // 3) Callouts: rounded bubbles with a tail to the level, nudged apart when they'd overlap.
      const bubbles: Rect[] = [];
      for (const s of this.shapes) {
        if (s.kind !== "callout") continue;
        const x = xOf(s.i);
        const y = yOf(s.price);
        if (x === null || y === null) continue;
        const font = `700 ${Math.round(10.5 * vr)}px ${FONT}`;
        const w = widthOf(font, s.text) + 20 * hr;
        const h = 30 * vr;
        const left = x + 40 * hr;
        const hit = (t: number) => bubbles.some((b) => overlaps(b, { x1: left, x2: left + w, y1: t, y2: t + h }));
        let top = y - 7 * vr - h;
        let below = false;
        if (hit(top)) {
          below = true;
          top = y + 7 * vr;
          for (let i = 0; i < 3 && hit(top); i++) top += h + 4 * vr;
        }
        bubbles.push({ x1: left, x2: left + w, y1: top, y2: top + h });

        const rad = 8 * hr;
        ctx.beginPath();
        ctx.moveTo(left + rad, top);
        ctx.arcTo(left + w, top, left + w, top + h, rad);
        ctx.arcTo(left + w, top + h, left, top + h, rad);
        ctx.arcTo(left, top + h, left, top, rad);
        ctx.arcTo(left, top, left + w, top, rad);
        ctx.closePath();
        ctx.fillStyle = s.color;
        ctx.fill();
        ctx.strokeStyle = COLORS.calloutBorder;
        ctx.lineWidth = Math.max(1, Math.round(hr));
        ctx.stroke();

        // tail
        ctx.beginPath();
        if (below) {
          ctx.moveTo(left, top + h * 0.1);
          ctx.lineTo(x, y);
          ctx.lineTo(left, top + h * 0.45);
        } else {
          ctx.moveTo(left, top + h * 0.55);
          ctx.lineTo(x, y);
          ctx.lineTo(left, top + h * 0.92);
        }
        ctx.closePath();
        ctx.fillStyle = s.color;
        ctx.fill();

        ctx.font = font;
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(s.text, left + w / 2, top + h / 2);
      }
    });
  }
}
