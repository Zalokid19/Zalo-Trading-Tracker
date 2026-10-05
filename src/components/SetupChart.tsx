import { useEffect, useRef, useState } from "react";
import * as LWC from "lightweight-charts";
import type { IChartApi, IPriceLine, ISeriesApi, Logical, UTCTimestamp } from "lightweight-charts";
import { MIN_QUALITY, type IctResult } from "../ictModel";
import { buildShapes, buildTradeShapes, findLiquidity, prevDayFrom, ShapesPrimitive, COLORS, type ChartTrade, type SRZones } from "../chartOverlay";
import { findSRZones } from "../xauAnalysis";
import { analyseStructures } from "../ictStructures";
import { StructuresPrimitive } from "../structureOverlay";
import { lastDataSource } from "../xauApi";

export interface ChartCandle {
  datetime: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface ChartFrame {
  candles: ChartCandle[]; // oldest -> newest, including the candle that is still forming
  result: IctResult; // analysed on every candle except that last one
}

export interface ChartData {
  frames: Record<string, ChartFrame>;
  daily: { high: number; low: number }[]; // oldest -> newest, last one is today
  bestTf: string | null;
  trades: ChartTrade[]; // entry-ready setups being followed until their stop or target is hit
}

const TFS = ["1m", "3m", "5m", "15m", "30m", "1h", "4h"];
// Support / resistance zones only make sense on the bigger timeframes, liquidity from 15m up.
const SR_TFS = new Set(["30m", "1h", "4h"]);
const LIQ_TFS = new Set(["15m", "30m", "1h", "4h"]);
const BLUE = "#2962FF"; // bullish candle
const BLACK = "#000000"; // bearish candle, and every candle border and wick

// "2026-10-03 14:00:00" -> seconds. The text is used as-is (no timezone shifting), so the axis
// shows the same clock the candles came with.
function toTime(dt: string, fallbackIndex: number): UTCTimestamp {
  const iso = dt.length <= 10 ? `${dt}T00:00:00Z` : `${dt.replace(" ", "T")}Z`;
  const ms = Date.parse(iso);
  return (Number.isNaN(ms) ? fallbackIndex * 60 : Math.floor(ms / 1000)) as UTCTimestamp;
}

// Works with lightweight-charts v5 (addSeries) and v4 (addCandlestickSeries).
function addCandles(chart: IChartApi): ISeriesApi<"Candlestick"> {
  const options = {
    upColor: BLUE,
    downColor: BLACK,
    borderVisible: true,
    borderUpColor: BLACK,
    borderDownColor: BLACK,
    wickUpColor: BLACK,
    wickDownColor: BLACK,
    priceLineStyle: LWC.LineStyle.Dotted,
  };
  const c = chart as unknown as {
    addSeries?: (def: unknown, o: unknown) => ISeriesApi<"Candlestick">;
    addCandlestickSeries?: (o: unknown) => ISeriesApi<"Candlestick">;
  };
  if (typeof c.addCandlestickSeries === "function") return c.addCandlestickSeries(options);
  const def = (LWC as unknown as { CandlestickSeries: unknown }).CandlestickSeries;
  return c.addSeries!(def, options);
}

function statusOf(r: IctResult | undefined, trades: ChartTrade[]): { text: string; tone: string } {
  const t = trades[trades.length - 1];
  if (t) {
    return {
      text: `${t.direction === "buy" ? "Long" : "Short"} trade being followed · entry ${t.entry.toFixed(2)} · stop ${t.stopLoss.toFixed(2)} · target ${t.tp1.toFixed(2)}`,
      tone: t.direction === "buy" ? "text-green" : "text-red",
    };
  }
  if (!r || r.stage === "none") return { text: "No setup on this timeframe right now.", tone: "text-gray-500" };
  if (r.stage === "swept") return { text: "Liquidity swept. Waiting for the structure shift.", tone: "text-accent" };
  if (r.quality < MIN_QUALITY) {
    return { text: `Setup confirmed, but quality ${r.quality}/100 is under ${MIN_QUALITY}, so there is no trade box.`, tone: "text-gray-500" };
  }
  return { text: "Setup confirmed, but it isn't being traded (price already reached the entry, or another trade is open).", tone: "text-gray-500" };
}

interface Props {
  data: ChartData | null;
}

export default function SetupChart({ data }: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const primRef = useRef<ShapesPrimitive | null>(null);
  const structRef = useRef<StructuresPrimitive | null>(null);
  const linesRef = useRef<IPriceLine[]>([]);
  const shownTfRef = useRef<string | null>(null);
  const pickedRef = useRef(false);
  const [tf, setTf] = useState("15m");
  const [showStruct, setShowStruct] = useState(true);

  // Follow the timeframe that has the setup, until the user picks one themselves.
  useEffect(() => {
    if (data?.bestTf && !pickedRef.current) setTf(data.bestTf);
  }, [data?.bestTf]);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const chart = LWC.createChart(el, {
      autoSize: true,
      // Light yellow at the top fading to white at the bottom, no grid.
      layout: {
        background: { type: LWC.ColorType.VerticalGradient, topColor: "#fff7cc", bottomColor: "#ffffff" },
        textColor: "#131722",
      },
      grid: { vertLines: { visible: false }, horzLines: { visible: false } },
      crosshair: {
        mode: LWC.CrosshairMode.Normal,
        vertLine: { color: "#9598a1", width: 1, style: LWC.LineStyle.Dashed, labelBackgroundColor: "#131722" },
        horzLine: { color: "#9598a1", width: 1, style: LWC.LineStyle.Dashed, labelBackgroundColor: "#131722" },
      },
      rightPriceScale: { borderColor: "#d1d4dc" },
      timeScale: { borderColor: "#d1d4dc", timeVisible: true, secondsVisible: false, rightOffset: 14 },
    });
    const series = addCandles(chart);
    const prim = new ShapesPrimitive();
    series.attachPrimitive(prim);
    const structPrim = new StructuresPrimitive();
    series.attachPrimitive(structPrim);
    structRef.current = structPrim;
    chartRef.current = chart;
    seriesRef.current = series;
    primRef.current = prim;
    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      primRef.current = null;
      structRef.current = null;
      linesRef.current = [];
      shownTfRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    const prim = primRef.current;
    const frame = data?.frames[tf];
    if (!chart || !series || !prim || !frame || !data) return;

    // Candle times must strictly increase, and the bar count must stay the same
    // so the setup's bar indexes keep lining up.
    let prev = 0;
    const points = frame.candles.map((c, i) => {
      let t = toTime(c.datetime, i);
      if (t <= prev) t = (prev + 1) as UTCTimestamp;
      prev = t;
      return { time: t, open: c.open, high: c.high, low: c.low, close: c.close };
    });
    series.setData(points);

    const lastIdx = points.length - 1;
    let sr: SRZones | null = null;
    if (SR_TFS.has(tf)) {
      try {
        const z = findSRZones(frame.candles);
        sr = { support: z.support ?? null, resistance: z.resistance ?? null };
      } catch {
        sr = null; // not enough candles for zones on this timeframe
      }
    }
    // Liquidity lines (swing highs/lows) and yesterday's high/low are hidden below 15m.
    const showLiq = LIQ_TFS.has(tf);
    const rawLiq = findLiquidity(frame.candles);
    const liquidity = showLiq || !Array.isArray(rawLiq) ? rawLiq : ([] as unknown as typeof rawLiq);
    const prevDay = (showLiq ? prevDayFrom(data.daily) : null) as ReturnType<typeof prevDayFrom>;
    prim.setShapes(
      [
        ...buildShapes(frame.result, prevDay, lastIdx, liquidity, sr),
        ...buildTradeShapes(data.trades, frame.candles, lastIdx),
      ],
      lastIdx
    );

    // MSS / BOS, order blocks, breakers and volume imbalances (closed candles only).
    let structures: ReturnType<typeof analyseStructures> | null = null;
    if (showStruct) {
      try {
        structures = analyseStructures(frame.candles.slice(0, -1), { maxPerKind: 3 });
      } catch {
        structures = null;
      }
    }
    structRef.current?.update(structures, lastIdx);

    // Entry / stop / target tags on the price axis, only while a trade is being followed.
    for (const l of linesRef.current) series.removePriceLine(l);
    linesRef.current = [];
    const trade = data.trades[data.trades.length - 1];
    if (trade) {
      // Price-only tags on the axis, like TradingView: stop and entry grey, target green.
      const mk = (price: number, color: string) =>
        series.createPriceLine({ price, color, axisLabelColor: color, axisLabelTextColor: "#ffffff", lineVisible: false, axisLabelVisible: true, title: "" });
      linesRef.current = [mk(trade.entry, "#7f7f7f"), mk(trade.stopLoss, "#7f7f7f"), mk(trade.tp1, COLORS.callout)];
    }

    if (shownTfRef.current !== tf) {
      chart.timeScale().setVisibleLogicalRange({
        from: Math.max(0, points.length - 100) as Logical,
        to: (points.length + 14) as Logical,
      });
      shownTfRef.current = tf;
    }
  }, [data, tf, showStruct]);

  const status = statusOf(data?.frames[tf]?.result, data?.trades ?? []);

  return (
    <div className="bg-gradient-to-b from-card to-cardhover border border-border rounded-xl shadow-xl shadow-black/50 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">XAU/USD · {tf}</p>
          <p className={`text-sm font-medium mt-1 ${status.tone}`}>{status.text}</p>
          <span className={`inline-block mt-1.5 text-[11px] px-2 py-0.5 rounded ${lastDataSource === "mt5" ? "bg-teal/15 text-teal" : "bg-amber-500/15 text-amber-400"}`}>
            {lastDataSource === "mt5" ? "● Live MT5" : "⚠ Twelve Data (fallback)"}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {TFS.map((t) => (
            <button
              key={t}
              onClick={() => {
                pickedRef.current = true;
                setTf(t);
              }}
              className={`text-xs font-semibold rounded-md px-3 py-1.5 transition-all ${
                t === tf ? "bg-accent text-black" : "bg-bgdark border border-border text-gray-400 hover:text-white"
              }`}
            >
              {t}
            </button>
          ))}
          <button
            onClick={() => setShowStruct((v) => !v)}
            title="Show or hide MSS / BOS, order blocks, breakers and volume imbalances"
            className={`text-xs font-semibold rounded-md px-3 py-1.5 transition-all ${
              showStruct ? "bg-teal/20 text-teal border border-teal/40" : "bg-bgdark border border-border text-gray-400 hover:text-white"
            }`}
          >
            ICT
          </button>
        </div>
      </div>

      <div className="relative rounded-lg overflow-hidden">
        <div ref={boxRef} style={{ height: 460 }} className="w-full" />
        {!data && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/90 text-sm text-gray-500">
            Run an analysis to draw the chart.
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-1 mt-3 text-[11px] text-gray-500">
        <span>Black line = liquidity (red text = highs, green text = lows), shown on 15m and up</span>
        <span>Support / resistance zones show on 30m, 1h and 4h only</span>
        <span>Dashed = liquidity swept</span>
        <span>Grey box = FVG / order block / support / resistance</span>
        <span>+OB / -OB = order block, dashed box = breaker, cyan = volume imbalance, MSS / BOS = structure breaks (ICT button toggles them)</span>
        <span>Grey / green box = entry to stop / target, only for a tradeable setup, until the stop or target is hit</span>
      </div>
    </div>
  );
}
