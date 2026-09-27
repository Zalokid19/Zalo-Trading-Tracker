import { useEffect, useRef } from "react";
import type { TradeLevels } from "../tradeLevels";

export interface ZoneMarker {
  label: string;
  price: number;
  color: string;
}

interface Props {
  levels: TradeLevels | null;
  zones: ZoneMarker[];
}

export default function XauChart({ levels, zones }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  if (!containerRef.current) return;
  containerRef.current.innerHTML = "";
  containerRef.current.className = "tradingview-widget-container";

  const widgetDiv = document.createElement("div");
  widgetDiv.className = "tradingview-widget-container__widget";
  widgetDiv.style.height = "560px";
  widgetDiv.style.width = "100%";
  containerRef.current.appendChild(widgetDiv);

  const script = document.createElement("script");
  script.type = "text/javascript";
  script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
  script.async = true;
  script.text = JSON.stringify({
    autosize: false,
    width: "100%",
    height: 560,
    symbol: "OANDA:XAUUSD",
    interval: "5",
    timezone: "Etc/UTC",
    theme: "dark",
    style: "1",
    locale: "en",
    enable_publishing: false,
    allow_symbol_change: false,
    support_host: "https://www.tradingview.com",
  });
  containerRef.current.appendChild(script);
}, []);

  return (
    <div className="grid grid-cols-3 gap-4">
    <div className="col-span-2 bg-card border border-border rounded-xl p-3 shadow-lg shadow-black/40 overflow-hidden">
    <div
        ref={containerRef}
        style={{ height: "560px", width: "100%", position: "relative", overflow: "hidden" }}
    />
    </div>
      <div className="bg-card border border-border rounded-xl p-5 shadow-lg shadow-black/40 space-y-5">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-3">Trade Levels</p>
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
            <p className="text-xs text-gray-500">Run an analysis to calculate levels.</p>
          )}
        </div>

        <div className="border-t border-border pt-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-3">Zones Detected</p>
          {zones.length > 0 ? (
            <div className="space-y-2">
              {zones.map((z, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-2" style={{ color: z.color }}>
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: z.color }} />
                    {z.label}
                  </span>
                  <span className="font-semibold text-gray-200">${z.price.toFixed(2)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-500">No zones detected on the last analysis.</p>
          )}
        </div>
      </div>
    </div>
  );
}