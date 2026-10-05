// Draws the ictStructures results (order blocks, breakers, volume imbalances, MSS / BOS)
// straight onto a lightweight-charts series. Self-contained: it does not touch chartOverlay.ts.
// Bar indexes from the analysis are used as chart "logical" positions, which is correct as long as
// the series data starts at the first analysed candle (SetupChart does exactly that).

import type {
  ISeriesPrimitive,
  SeriesAttachedParameter,
  Time,
  IChartApi,
  ISeriesApi,
  SeriesType,
  IPrimitivePaneView,
  IPrimitivePaneRenderer,
  Logical,
} from "lightweight-charts";
import type { Structures, OrderBlock } from "./ictStructures";

type Scope = { context: CanvasRenderingContext2D; mediaSize: { width: number; height: number } };
type Target = { useMediaCoordinateSpace: <T>(cb: (scope: Scope) => T) => T };

const BULL = "#0d9488"; // teal, matches the dashboard's green text
const BEAR = "#dc2626";
const VI_CYAN = "#0891b2";
const MSS_BULL = "#00b386";
const MSS_BEAR = "#e60400";
const FONT = "italic 700 11px Inter, system-ui, sans-serif";

class Renderer implements IPrimitivePaneRenderer {
  constructor(private owner: StructuresPrimitive) {}
  draw(target: Target): void {
    target.useMediaCoordinateSpace(({ context, mediaSize }) => this.owner.paint(context, mediaSize.width));
  }
}

class View implements IPrimitivePaneView {
  private r: Renderer;
  constructor(owner: StructuresPrimitive) {
    this.r = new Renderer(owner);
  }
  zOrder(): "normal" {
    return "normal";
  }
  renderer(): IPrimitivePaneRenderer {
    return this.r;
  }
}

export class StructuresPrimitive implements ISeriesPrimitive<Time> {
  private chart: IChartApi | null = null;
  private series: ISeriesApi<SeriesType> | null = null;
  private requestUpdate: (() => void) | null = null;
  private data: Structures | null = null;
  private lastIdx = 0;
  private views: IPrimitivePaneView[] = [new View(this)];

  attached(p: SeriesAttachedParameter<Time>): void {
    this.chart = p.chart as IChartApi;
    this.series = p.series as ISeriesApi<SeriesType>;
    this.requestUpdate = p.requestUpdate;
  }
  detached(): void {
    this.chart = null;
    this.series = null;
    this.requestUpdate = null;
  }
  paneViews(): readonly IPrimitivePaneView[] {
    return this.views;
  }

  /** Hand over fresh results (or null to clear). lastIdx = index of the newest candle on the chart. */
  update(data: Structures | null, lastIdx: number): void {
    this.data = data;
    this.lastIdx = lastIdx;
    this.requestUpdate?.();
  }

  paint(ctx: CanvasRenderingContext2D, width: number): void {
    const d = this.data;
    if (!d || !this.chart || !this.series) return;
    const ts = this.chart.timeScale();
    const series = this.series;
    const X = (idx: number) => ts.logicalToCoordinate(idx as Logical);
    const Y = (p: number) => series.priceToCoordinate(p);
    const right = this.lastIdx + 4;

    const box = (x1: number, x2: number, top: number, bottom: number, fill: string, stroke: string, dashed: boolean) => {
      const l = Math.max(0, Math.min(x1, x2));
      const r = Math.min(width, Math.max(x1, x2));
      if (r <= l) return;
      const t = Math.min(top, bottom);
      const h = Math.max(1, Math.abs(bottom - top));
      ctx.save();
      ctx.fillStyle = fill;
      ctx.fillRect(l, t, r - l, h);
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1;
      ctx.setLineDash(dashed ? [4, 3] : []);
      ctx.strokeRect(l + 0.5, t + 0.5, r - l, h);
      ctx.restore();
    };
    const label = (text: string, x: number, y: number, color: string, align: CanvasTextAlign = "left") => {
      ctx.save();
      ctx.font = FONT;
      ctx.fillStyle = color;
      ctx.textAlign = align;
      ctx.textBaseline = "middle";
      ctx.fillText(text, Math.max(2, Math.min(x, width - 2)), y);
      ctx.restore();
    };

    // ---- Order blocks: the newest bullish and newest bearish one that is still intact ----
    const firstOf = (list: OrderBlock[], dir: 1 | -1) => list.find((o) => o.dir === dir);
    for (const ob of [firstOf(d.orderBlocks, 1), firstOf(d.orderBlocks, -1)]) {
      if (!ob) continue;
      const x1 = X(ob.idx);
      const x2 = X(right);
      const yT = Y(ob.top);
      const yB = Y(ob.bottom);
      if (x1 === null || x2 === null || yT === null || yB === null) continue;
      const col = ob.dir === 1 ? BULL : BEAR;
      box(x1, x2, yT, yB, ob.dir === 1 ? "rgba(13,148,136,0.16)" : "rgba(220,38,38,0.14)", col, false);
      label(ob.dir === 1 ? "+OB" : "-OB", Math.max(x1, 0) + 4, Math.min(yT, yB) + 9, col);
    }

    // ---- Breaker blocks: a broken bullish OB now acts as supply, a broken bearish OB as demand ----
    for (const bb of d.breakers.slice(0, 2)) {
      const x1 = X(bb.idx);
      const x2 = X(right);
      const yT = Y(bb.top);
      const yB = Y(bb.bottom);
      if (x1 === null || x2 === null || yT === null || yB === null) continue;
      const bearishNow = bb.dir === 1;
      const col = bearishNow ? BEAR : BULL;
      box(x1, x2, yT, yB, bearishNow ? "rgba(220,38,38,0.08)" : "rgba(13,148,136,0.08)", col, true);
      label(bearishNow ? "Bear breaker" : "Bull breaker", Math.max(x1, 0) + 4, Math.max(yT, yB) - 9, col);
    }

    // ---- Volume imbalances ----
    for (const vi of d.volumeImbalances.slice(0, 2)) {
      const x1 = X(vi.idx - 1);
      const x2 = X(vi.idx + 4);
      const yT = Y(vi.top);
      const yB = Y(vi.bottom);
      if (x1 === null || x2 === null || yT === null || yB === null) continue;
      box(x1, x2, yT, yB, "rgba(8,145,178,0.30)", VI_CYAN, false);
      label("VI", x2 + 4, (yT + yB) / 2, VI_CYAN);
    }

    // ---- MSS / BOS: the latest MSS and any BOS after it (LuxAlgo "Present" mode) ----
    let lastMss = -1;
    for (let i = d.events.length - 1; i >= 0; i--) {
      if (d.events[i].kind === "MSS") {
        lastMss = i;
        break;
      }
    }
    if (lastMss >= 0) {
      for (const e of d.events.slice(lastMss, lastMss + 5)) {
        const x1 = X(e.levelIdx);
        const x2 = X(e.brokeIdx);
        const y = Y(e.level);
        if (x1 === null || x2 === null || y === null) continue;
        const col = e.dir === 1 ? MSS_BULL : MSS_BEAR;
        ctx.save();
        ctx.strokeStyle = col;
        ctx.lineWidth = e.kind === "MSS" ? 1.5 : 1;
        ctx.setLineDash(e.kind === "MSS" ? [] : [2, 3]);
        ctx.beginPath();
        ctx.moveTo(Math.max(0, x1), y + 0.5);
        ctx.lineTo(Math.min(width, x2), y + 0.5);
        ctx.stroke();
        ctx.restore();
        label(e.kind, (x1 + x2) / 2, e.dir === 1 ? y - 8 : y + 9, col, "center");
      }
    }
  }
}
