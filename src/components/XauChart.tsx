import { useEffect, useRef, useState } from "react";
import { createChart, ColorType, CandlestickSeries, CrosshairMode, type ISeriesApi } from "lightweight-charts";
import { fetchXauCandles, combineCandles, RateLimitError, type Candle, type Timeframe } from "../xauApi";
import {
  analyzeSingleTimeframe,
  findRecentSweptLevels,
  getPreviousDayLevels,
  type AutoDetection,
  type LiquidityLevel,
} from "../xauAnalysis";
import { calculateTradeLevels, type TradeLevels } from "../tradeLevels";
import { findSRZones } from "../xauAnalysis";
import { detectSequentialSetup, type SequentialSetup } from "../sequentialSetup";
import { lastDataSource } from "../xauApi";

interface ZoneBand {
  label: string;
  high: number;
  low: number;
  color: string;
  midline?: boolean;
  textColor?: string;
}

interface TfOption {
  key: string;
  label: string;
}

const TF_OPTIONS: TfOption[] = [
  { key: "1min", label: "1m" },
  { key: "3min", label: "3m" },
  { key: "5min", label: "5m" },
  { key: "15min", label: "15m" },
  { key: "1h", label: "1h" },
  { key: "4h", label: "4h" },
  { key: "1day", label: "D" },
];

function strategyForTf(tf: string): "intraday" | "swing" {
  return ["1min", "3min", "5min", "15min"].includes(tf) ? "intraday" : "swing";
}

function buildBands(detection: AutoDetection, direction: "buy" | "sell", candles: Candle[]): ZoneBand[] {
  const bands: ZoneBand[] = [];
  if (detection.orderBlock.detected && detection.orderBlock.zoneHigh !== undefined && detection.orderBlock.zoneLow !== undefined) {
    bands.push({
      label: direction === "buy" ? "OB" : "-OB",
      high: detection.orderBlock.zoneHigh,
      low: detection.orderBlock.zoneLow,
      color: direction === "buy" ? "rgba(0, 180, 0, 0.20)" : "rgba(255, 0, 0, 0.18)",
    });
  }
  if (detection.fvg.detected && detection.fvg.zoneHigh !== undefined && detection.fvg.zoneLow !== undefined) {
    bands.push({
      label: "FVG",
      high: detection.fvg.zoneHigh,
      low: detection.fvg.zoneLow,
      color: "rgba(224, 224, 224, 0.55)",
      midline: true,
    });
  }
  const { support, resistance } = findSRZones(candles);
  if (support) {
    bands.push({ label: "Support", high: support.high, low: support.low, color: "rgba(211, 211, 211, 0.6)", textColor: "#8b0000" });
  }
  if (resistance) {
    bands.push({ label: "Resistance", high: resistance.high, low: resistance.low, color: "rgba(211, 211, 211, 0.6)", textColor: "#8b0000" });
  }
  return bands;
}

interface Props {
  direction: "buy" | "sell";
}

export default function XauChart({ direction }: Props) {
  const [tf, setTf] = useState("5min");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [levels, setLevels] = useState<TradeLevels | null>(null);
  const [detection, setDetection] = useState<AutoDetection | null>(null);
  const [bands, setBands] = useState<ZoneBand[]>([]);
  const [seq, setSeq] = useState<SequentialSetup | null>(null);
  const [htfLiquidity, setHtfLiquidity] = useState<LiquidityLevel[]>([]);
  const [prevDay, setPrevDay] = useState<{ high: number; low: number } | null>(null);
  const [referencePrice, setReferencePrice] = useState<number | undefined>(undefined);
  const [referenceTime, setReferenceTime] = useState<string | undefined>(undefined);

  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  // Load the currently-selected timeframe and run detection on it, refetches on every tf click.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        let loaded: Candle[];
        if (tf === "3min") {
          const oneMin = await fetchXauCandles("1min", 90);
          loaded = combineCandles(oneMin, 3);
        } else {
          loaded = await fetchXauCandles(tf as Timeframe, 60);
        }
        if (cancelled) return;

        const result = analyzeSingleTimeframe(loaded, direction);
        const strategy = strategyForTf(tf);
        const tradeLevels = calculateTradeLevels(loaded, direction, strategy, result);

        const last = loaded[loaded.length - 1];
        setCandles(loaded);
        setSeq(detectSequentialSetup(loaded, direction));
        setDetection(result);
        setLevels(tradeLevels);setBands(buildBands(result, direction, loaded));
        setReferencePrice(last.close);
        setReferenceTime(new Date(last.datetime).toLocaleTimeString("en-ZA", { timeZone: "Africa/Johannesburg" }));
      } catch (err) {
        if (!cancelled) {
          if (err instanceof RateLimitError) {
            setError(`Too many requests — wait ${err.secondsRemaining}s and pick a timeframe again.`);
          } else {
            setError(err instanceof Error ? err.message : "Failed to load chart");
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [tf, direction]);

  // Load higher-timeframe liquidity and the previous day's high/low once, not on every tf click.
  useEffect(() => {
    let cancelled = false;

    async function loadHtf() {
      try {
        const [m30, h1, h4, day] = await Promise.all([
          fetchXauCandles("30min", 40),
          fetchXauCandles("1h", 40),
          fetchXauCandles("4h", 40),
          fetchXauCandles("1day", 10),
        ]);
        if (cancelled) return;
        setHtfLiquidity([
          ...findRecentSweptLevels(m30, "30M"),
          ...findRecentSweptLevels(h1, "1H"),
          ...findRecentSweptLevels(h4, "4H"),
          ...findRecentSweptLevels(day, "Daily"),
        ]);
        setPrevDay(getPreviousDayLevels(day));
      } catch {
        // Higher-timeframe liquidity overlay is a bonus layer — a rate-limit hit here
        // shouldn't block the main chart, so it's skipped silently.
      }
    }

    loadHtf();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!containerRef.current || candles.length === 0) return;

    const chart = createChart(containerRef.current, {
      layout: { background: { type: ColorType.Solid, color: "#ffffff" }, textColor: "#131722", fontSize: 12 },
      grid: { vertLines: { visible: false }, horzLines: { visible: false } },
      width: containerRef.current.clientWidth,
      height: 460,
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "#9598a1", width: 1, style: 3, labelBackgroundColor: "#131722" },
        horzLine: { color: "#9598a1", width: 1, style: 3, labelBackgroundColor: "#131722" },
      },
      rightPriceScale: { borderColor: "#d1d4dc", scaleMargins: { top: 0.1, bottom: 0.1 } },
      timeScale: { borderColor: "#d1d4dc", timeVisible: true, secondsVisible: false, barSpacing: 10, minBarSpacing: 4 },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#1E66F5",
      downColor: "#000000",
      borderVisible: false,
      wickUpColor: "#1E66F5",
      wickDownColor: "#000000",
      priceFormat: { type: "price", precision: 2, minMove: 0.01 },
    });

    series.setData(
      candles.map((c) => ({
        time: (new Date(c.datetime).getTime() / 1000) as any,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }))
    );

    if (levels) {
      series.createPriceLine({ price: levels.entry, color: "#ffb020", lineWidth: 2, lineStyle: 2, title: "Entry" });
      series.createPriceLine({ price: levels.stopLoss, color: "#ef5350", lineWidth: 2, lineStyle: 2, title: "SL" });
      series.createPriceLine({ price: levels.tp1, color: "#1E66F5", lineWidth: 1, lineStyle: 2, title: "TP1" });
      series.createPriceLine({ price: levels.tp2, color: "#1E66F5", lineWidth: 1, lineStyle: 2, title: "TP2" });
      series.createPriceLine({ price: levels.tp3, color: "#1E66F5", lineWidth: 1, lineStyle: 2, title: "TP3" });
    }

    if (seq && seq.state !== "idle") {
    if (seq.sweptLevel !== undefined) {
        series.createPriceLine({ price: seq.sweptLevel, color: "#b45309", lineWidth: 1, lineStyle: 1, title: "SWEEP" });
    }
    if (seq.mssLevel !== undefined) {
        series.createPriceLine({ price: seq.mssLevel, color: direction === "buy" ? "#15803d" : "#b91c1c", lineWidth: 2, lineStyle: 0, title: "MSS" });
    }
    if (seq.state === "fired") {
        if (seq.entry !== undefined) series.createPriceLine({ price: seq.entry, color: "#1E293B", lineWidth: 2, lineStyle: 2, title: "ENTRY" });
        if (seq.stopLoss !== undefined) series.createPriceLine({ price: seq.stopLoss, color: "#b91c1c", lineWidth: 2, lineStyle: 0, title: "SL" });
        if (seq.tp1 !== undefined) series.createPriceLine({ price: seq.tp1, color: "#15803d", lineWidth: 1, lineStyle: 2, title: "TP1" });
    }
    }

    if (detection?.mss.detected) {
      const price = detection.mss.zoneHigh ?? detection.mss.zoneLow;
      if (price !== undefined) {
        series.createPriceLine({ price, color: "#000000", lineWidth: 1, lineStyle: 0, title: "MSS" });
      }
    }
    if (detection?.bos.detected) {
      const price = detection.bos.zoneHigh ?? detection.bos.zoneLow;
      if (price !== undefined) {
        series.createPriceLine({ price, color: "#616161", lineWidth: 1, lineStyle: 1, title: "BOS" });
      }
    }
    if (detection?.liquiditySweep.detected) {
      const price = detection.liquiditySweep.zoneHigh ?? detection.liquiditySweep.zoneLow;
      if (price !== undefined) {
        series.createPriceLine({ price, color: "#000000", lineWidth: 2, lineStyle: 0, title: "Liquidity Swept" });
      }
    }
    htfLiquidity.forEach((lvl) => {
      series.createPriceLine({ price: lvl.price, color: "#000000", lineWidth: 1, lineStyle: 0, title: lvl.label });
    });
    if (prevDay) {
      series.createPriceLine({ price: prevDay.high, color: "#d32f2f", lineWidth: 1, lineStyle: 0, title: "Yesterday High" });
      series.createPriceLine({ price: prevDay.low, color: "#d32f2f", lineWidth: 1, lineStyle: 0, title: "Yesterday Low" });
    }

    chart.timeScale().fitContent();
    seriesRef.current = series;

    function drawOverlay() {
      const canvas = overlayRef.current;
      const container = containerRef.current;
      if (!canvas || !container || !seriesRef.current) return;
      const width = container.clientWidth;
      const height = 460;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      bands.forEach((b) => {
        const yHigh = seriesRef.current!.priceToCoordinate(b.high);
        const yLow = seriesRef.current!.priceToCoordinate(b.low);
        if (yHigh === null || yLow === null) return;
        const top = Math.min(yHigh, yLow);
        const boxHeight = Math.max(Math.abs(yLow - yHigh), 2);

        ctx.fillStyle = b.color;
        ctx.fillRect(0, top, width, boxHeight);

        if (b.midline) {
          const mid = top + boxHeight / 2;
          ctx.setLineDash([5, 4]);
          ctx.strokeStyle = "#757575";
          ctx.beginPath();
          ctx.moveTo(0, mid);
          ctx.lineTo(width, mid);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        ctx.fillStyle = b.textColor ?? "#424242";
        ctx.font = "bold 11px sans-serif";
        ctx.fillText(b.label, 6, top + 12);
      });
    }

    drawOverlay();
    chart.timeScale().subscribeVisibleTimeRangeChange(drawOverlay);
    chart.subscribeCrosshairMove(drawOverlay);

    const handleResize = () => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth });
      drawOverlay();
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, [candles, levels, detection, bands, htfLiquidity, prevDay, seq]);

return (
  <div className="space-y-3">
    {seq && (
      <div
        className={`text-sm font-bold px-4 py-2 rounded-lg flex items-center justify-between ${
          seq.state === "fired"
            ? direction === "buy" ? "bg-green/20 text-green" : "bg-red/20 text-red"
            : seq.state === "waiting" ? "bg-amber-500/20 text-amber-400" : "bg-bgdark text-gray-500"
        }`}
      >
        <span>
          {seq.state === "fired" ? (direction === "buy" ? "▲ LONG SETUP" : "▼ SHORT SETUP")
            : seq.state === "waiting" ? "⏳ SWEEP · WAITING MSS"
            : "SCANNING"}
        </span>
        {seq.state === "fired" && <span>Quality {seq.quality}/100</span>}
      </div>
    )}
    <div className="flex flex-wrap items-center gap-2">
        {TF_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            onClick={() => setTf(opt.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              tf === opt.key ? "bg-accent text-black" : "bg-bgdark border border-border text-gray-400"
            }`}
          >
            {opt.label}
          </button>
        ))}

        <span className={`text-xs px-2 py-1 rounded ${lastDataSource === "mt5" ? "bg-teal/15 text-teal" : "bg-amber-500/15 text-amber-400"}`}>
          {lastDataSource === "mt5" ? "● Live MT5" : "⚠ Twelve Data (fallback)"}
        </span>

        {loading && <span className="text-xs text-gray-500">Loading…</span>}
      </div>

      {error && <p className="text-sm text-red">{error}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white border border-border rounded-xl p-3 shadow-lg shadow-black/40 overflow-hidden">
          <div className="relative" style={{ height: "460px", width: "100%" }}>
            <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />
            <canvas ref={overlayRef} style={{ position: "absolute", inset: 0, pointerEvents: "none" }} />
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-5 shadow-lg shadow-black/40 space-y-5">
          {referencePrice !== undefined && (
            <div className="pb-4 border-b border-border">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">
                {TF_OPTIONS.find((o) => o.key === tf)?.label} Reference Price
              </p>
              <p className="text-sm font-bold">${referencePrice.toFixed(2)}</p>
              {referenceTime && <p className="text-[11px] text-gray-500 mt-0.5">as of {referenceTime} SAST</p>}
            </div>
          )}

          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-3">Trade Levels ({tf})</p>
            {levels ? (
              <div className="space-y-2.5">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-400">Entry</span>
                  <span className="text-sm font-bold">${levels.entry.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-400">Stop Loss</span>
                  <span className="text-sm font-bold text-red">${levels.stopLoss.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-400">TP1</span>
                  <span className="text-sm font-bold text-green">${levels.tp1.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-400">TP2</span>
                  <span className="text-sm font-bold text-green">${levels.tp2.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-400">TP3</span>
                  <span className="text-sm font-bold text-green">${levels.tp3.toFixed(2)}</span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-gray-500">No candles loaded yet.</p>
            )}
          </div>

          <div className="border-t border-border pt-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Chart Key</p>
            <div className="space-y-1.5 text-[11px] text-gray-400">
              <p><span className="inline-block w-2.5 h-2.5 rounded-sm mr-1.5" style={{ background: "rgba(0,180,0,0.5)" }} /> Bullish OB</p>
              <p><span className="inline-block w-2.5 h-2.5 rounded-sm mr-1.5" style={{ background: "rgba(255,0,0,0.4)" }} /> Bearish -OB</p>
              <p><span className="inline-block w-2.5 h-2.5 rounded-sm mr-1.5" style={{ background: "rgba(224,224,224,0.9)" }} /> FVG</p>
              <p>Black line — Liquidity Swept / MSS</p>
              <p>Gray dashed line — BOS</p>
              <p className="text-red">Red line — Yesterday High/Low</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}