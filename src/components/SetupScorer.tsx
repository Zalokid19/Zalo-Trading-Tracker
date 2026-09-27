import { useState, useEffect, useRef } from "react";
import { criteria } from "../setupCriteria";
import Gauge from "./Gauge";
import type { SetupRecord } from "../types";
import { useSetups } from "../useSetups";
import { fetchXauCandles, combineCandles, type Candle } from "../xauApi";
import { analyzeXau, buildPerspective, type AutoDetection } from "../xauAnalysis";
import { getCriteriaStats } from "../criteriaStats";
import { calculateTradeLevels, type TradeLevels } from "../tradeLevels";
import { notifySetupAlert } from "../notifications";
import XauChart from "./XauChart";
import type { Account } from "../types";
import { calculateLotSize } from "../positionSizing";

export interface ZoneMarker {
  label: string;
  price: number;
  color: string;
}


function getLabel(score: number): "Weak" | "Moderate" | "Strong" {
  if (score >= 70) return "Strong";
  if (score >= 40) return "Moderate";
  return "Weak";
}

const reasonMap: Record<string, keyof AutoDetection> = {
  liquiditySweep: "liquiditySweep",
  displacement: "displacement",
  mss: "mss",
  fvg: "fvg",
  entry: "entry",
  orderBlock: "orderBlock",
};

const ALERT_THRESHOLD = 70;
const SCAN_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

interface Props {
  accounts: Account[];
}

export default function SetupScorer({ accounts }: Props) {
  const [selectedAccountId, setSelectedAccountId] = useState(accounts[0]?.id ?? "");
  const selectedAccount = accounts.find((a) => a.id === selectedAccountId) ?? accounts[0];
  const [direction, setDirection] = useState<"buy" | "sell">("buy");
  const [strategy, setStrategy] = useState<"intraday" | "swing">("intraday");
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detection, setDetection] = useState<AutoDetection | null>(null);
  const [perspective, setPerspective] = useState<string | null>(null);
  const [levels, setLevels] = useState<TradeLevels | null>(null);
  const [autoScan, setAutoScan] = useState(false);
  const [chartCandles, setChartCandles] = useState<Candle[]>([]);
  const [zones, setZones] = useState<ZoneMarker[]>([]);
  const lastAlertKey = useRef<string | null>(null);
  const prevCheckedRef = useRef<Record<string, boolean>>({});
  const { setups, addSetup, updateOutcome } = useSetups();

  function toggle(id: string) {
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  const score = criteria.reduce((sum, c) => sum + (checked[c.id] ? c.weight : 0), 0);
  const label = getLabel(score);
  const stats = getCriteriaStats(setups);

  async function runAnalysis(silent = false) {
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
        const [oneMinCandles, fiveMinCandles]: [Candle[], Candle[]] = await Promise.all([
          fetchXauCandles("1min", 60),
          fetchXauCandles("5min", 30),
        ]);
        const threeMinCandles = combineCandles(oneMinCandles, 3);
        const result = analyzeXau(oneMinCandles, threeMinCandles, fiveMinCandles, direction);
        setChartCandles(fiveMinCandles);

        const newZones: ZoneMarker[] = [];
        if (result.liquiditySweep.detected) {
          const price = result.liquiditySweep.zoneHigh ?? result.liquiditySweep.zoneLow;
          if (price !== undefined) newZones.push({ label: "Liquidity Sweep", price, color: "#ff9800" });
        }
        if (result.fvg.detected && result.fvg.zoneHigh !== undefined) {
          newZones.push({ label: "FVG Top", price: result.fvg.zoneHigh, color: "#2196f3" });
        }
        if (result.fvg.detected && result.fvg.zoneLow !== undefined) {
          newZones.push({ label: "FVG Bottom", price: result.fvg.zoneLow, color: "#2196f3" });
        }
        if (result.orderBlock.detected && result.orderBlock.zoneHigh !== undefined) {
          newZones.push({ label: "Order Block Top", price: result.orderBlock.zoneHigh, color: "#9c27b0" });
        }
        if (result.orderBlock.detected && result.orderBlock.zoneLow !== undefined) {
          newZones.push({ label: "Order Block Bottom", price: result.orderBlock.zoneLow, color: "#9c27b0" });
        }
        setZones(newZones);

        const newChecked: Record<string, boolean> = {
          ...checked,
          liquiditySweep: result.liquiditySweep.detected,
          displacement: result.displacement.detected,
          mss: result.mss.detected,
          fvg: result.fvg.detected,
          entry: result.entry.detected,
          orderBlock: result.orderBlock.detected,
        };
        const newlyConfirmed = criteria.filter(
          (c) => newChecked[c.id] && !prevCheckedRef.current[c.id]
        );

        setChecked(newChecked);
        setDetection(result);

        const basePerspective = buildPerspective(result, direction);
        if (newlyConfirmed.length > 0) {
          const names = newlyConfirmed.map((c) => c.label).join(", ");
          setPerspective(`Update: ${names} just confirmed. ${basePerspective}`);
        } else {
          setPerspective(basePerspective);
        }

        prevCheckedRef.current = newChecked;

      const newScore = criteria.reduce((sum, c) => sum + (newChecked[c.id] ? c.weight : 0), 0);
      const tradeLevels = calculateTradeLevels(oneMinCandles, direction, strategy);
      setLevels(tradeLevels);

      if (newScore >= ALERT_THRESHOLD && tradeLevels) {
        const alertKey = `${direction}-${new Date().toISOString().slice(0, 13)}`;
        if (lastAlertKey.current !== alertKey) {
          notifySetupAlert(direction, newScore, tradeLevels.entry, tradeLevels.stopLoss, tradeLevels.tp1);
          lastAlertKey.current = alertKey;
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to analyze chart");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!autoScan) return;
    const interval = setInterval(() => runAnalysis(true), SCAN_INTERVAL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoScan, direction, strategy]);

  function handleSave() {
    const now = new Date();
    const record: SetupRecord = {
      id: crypto.randomUUID(),
      date: now.toISOString().split("T")[0],
      time: now.toTimeString().slice(0, 5),
      direction,
      score,
      label,
      outcome: "pending",
      checkedCriteria: Object.keys(checked).filter((k) => checked[k]),
    };
    addSetup(record);
    setChecked({});
    setDetection(null);
    setPerspective(null);
    setLevels(null);
  }

  function winRateFor(l: string) {
    const relevant = setups.filter((s) => s.label === l && s.outcome !== "pending");
    if (relevant.length === 0) return null;
    const wins = relevant.filter((s) => s.outcome === "win").length;
    return Math.round((wins / relevant.length) * 100);
  }

  const sortedSetups = [...setups].sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));

    return (
    <div className="max-w-6xl">
      <h1 className="text-2xl font-bold mb-1">Zalo Setup Scorer</h1>
      <p className="text-sm text-accent font-semibold mb-6">XAU/USD</p>

      <div className="bg-card border border-border rounded-xl shadow-lg shadow-black/40 hover:border-accent/30 transition-colors p-6 mb-6">
        <div className="flex flex-wrap items-center gap-4 mb-4">
          <div>
            <p className="text-xs text-gray-400 mb-1.5">Strategy</p>
            <div className="flex gap-2">
              <button onClick={() => setStrategy("intraday")} className={`px-3 py-1.5 rounded text-sm font-medium ${strategy === "intraday" ? "bg-accent text-black" : "bg-bgdark border border-border text-gray-400"}`}>Intraday</button>
              <button onClick={() => setStrategy("swing")} className={`px-3 py-1.5 rounded text-sm font-medium ${strategy === "swing" ? "bg-accent text-black" : "bg-bgdark border border-border text-gray-400"}`}>Swing</button>
            </div>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-1.5">Direction</p>
            <div className="flex gap-2">
              <button onClick={() => setDirection("buy")} className={`px-3 py-1.5 rounded text-sm font-medium ${direction === "buy" ? "bg-green text-black" : "bg-bgdark border border-border text-gray-400"}`}>Buy</button>
              <button onClick={() => setDirection("sell")} className={`px-3 py-1.5 rounded text-sm font-medium ${direction === "sell" ? "bg-red text-black" : "bg-bgdark border border-border text-gray-400"}`}>Sell</button>
            </div>
          </div>
          <button onClick={() => runAnalysis(false)} disabled={loading} className="bg-accent text-black font-semibold rounded px-5 py-2 text-sm hover:opacity-90 disabled:opacity-50">
            {loading ? "Analyzing..." : "Analyze Chart"}
          </button>
          <button
            onClick={() => setAutoScan((v) => !v)}
            className={`ml-auto text-xs font-semibold rounded-lg px-4 py-2.5 flex items-center gap-2 transition-all ${
              autoScan
                ? "bg-green/15 text-green border border-green/50 shadow-[0_0_12px_rgba(0,230,160,0.25)]"
                : "bg-bgdark border border-border text-gray-400"
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${autoScan ? "bg-green animate-pulse" : "bg-gray-600"}`} />
            {autoScan ? "Auto-Scan ON · every 5 min" : "Auto-Scan OFF"}
          </button>
        </div>
        {error && <p className="text-sm text-red">{error}</p>}
      </div>

      <div className="grid grid-cols-3 gap-6 mb-6">
        <div className="col-span-2 space-y-6">
          {perspective && (
            <div className="bg-card border-2 border-accent/40 rounded-xl p-6">
              <p className="text-xs text-accent uppercase tracking-widest font-bold mb-2">Perspective</p>
              <p className="text-sm text-gray-200 leading-relaxed">{perspective}</p>
            </div>
          )}
          {levels && score >= 40 && selectedAccount && (
            <div className="bg-card border border-border rounded-xl p-6">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-gray-500 uppercase tracking-wide">Calculated Trade Levels</p>
                <select
                  value={selectedAccountId}
                  onChange={(e) => setSelectedAccountId(e.target.value)}
                  className="bg-bgdark border border-border rounded px-2 py-1 text-xs"
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-5 gap-4">
                <div>
                  <p className="text-xs text-gray-400">Entry</p>
                  <p className="text-lg font-bold">${levels.entry.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Stop Loss</p>
                  <p className="text-lg font-bold text-red">${levels.stopLoss.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">TP1</p>
                  <p className="text-lg font-bold text-green">${levels.tp1.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">TP2</p>
                  <p className="text-lg font-bold text-green">${levels.tp2.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">TP3</p>
                  <p className="text-lg font-bold text-green">${levels.tp3.toFixed(2)}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-border">
                <div>
                  <p className="text-xs text-gray-400">Risk Amount ({selectedAccount.riskPerTradePct}% of balance)</p>
                  <p className="text-lg font-bold text-accent">
                    ${(selectedAccount.balance * (selectedAccount.riskPerTradePct / 100)).toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Suggested Lot Size</p>
                  <p className="text-lg font-bold text-accent">
                    {calculateLotSize(
                      selectedAccount.balance * (selectedAccount.riskPerTradePct / 100),
                      Math.abs(levels.entry - levels.stopLoss)
                    )}
                  </p>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-3">
                Mechanically calculated from the recent swing level and your account's risk %. Confirm against your own read of the chart before entering, and double-check lot size against your broker's actual pip value.
              </p>
            </div>
          )}
        </div>

        <div className="bg-card border border-border rounded-xl shadow-lg shadow-black/40 hover:border-accent/30 transition-colors p-6 flex items-center justify-center">
          <Gauge score={score} />
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl shadow-lg shadow-black/40 hover:border-accent/30 transition-colors p-6 space-y-1 mb-6">
        <p className="text-xs text-gray-500 uppercase tracking-wide mb-3">
          Checklist for a {direction === "buy" ? "Buy" : "Sell"}
        </p>
        {criteria.map((c) => {
          const detail = reasonMap[c.id] && detection ? (detection[reasonMap[c.id]] as { reason: string }) : null;
          const stat = stats.find((s) => s.id === c.id);
          return (
            <div key={c.id} className={`rounded-lg px-3 py-2.5 ${checked[c.id] ? "bg-green/10" : ""}`}>
              <label className="flex items-center gap-3 text-sm cursor-pointer">
                <input type="checkbox" checked={!!checked[c.id]} onChange={() => toggle(c.id)} className="w-4 h-4 accent-accent" />
                <span className={checked[c.id] ? "text-white font-medium" : "text-gray-400"}>{c.label}</span>
                {reasonMap[c.id] && <span className="text-[10px] bg-bgdark border border-border rounded px-1.5 py-0.5 text-gray-500">auto</span>}
                <span className="ml-auto text-xs text-gray-500">{c.weight}pts</span>
              </label>
              {detail && <p className="text-xs text-gray-400 mt-1.5 ml-7 leading-relaxed">{detail.reason}</p>}
              {stat && stat.winRate !== null && (
                <p className="text-xs mt-1 ml-7">
                  <span className="text-gray-500">Your history: </span>
                  <span className={stat.winRate >= 60 ? "text-green" : stat.winRate >= 40 ? "text-accent" : "text-red"}>{stat.winRate}% win rate</span>
                  <span className="text-gray-600"> ({stat.timesTaken} trades)</span>
                </p>
              )}
            </div>
          );
        })}
        <button onClick={handleSave} className="bg-accent text-black font-semibold rounded px-5 py-2 text-sm hover:opacity-90 mt-3">
          Save This Setup
        </button>
      </div>

      {chartCandles.length > 0 && (
        <div className="mb-6">
          <XauChart levels={score >= 70 ? levels : null} zones={zones} />
        </div>
      )}

      <div className="bg-card border border-border rounded-xl shadow-lg shadow-black/40 hover:border-accent/30 transition-colors p-6 mb-6">
        <p className="text-xs text-gray-500 uppercase tracking-wide mb-3">Win Rate by Setup Strength</p>
        <div className="grid grid-cols-3 gap-4">
          {["Strong", "Moderate", "Weak"].map((l) => {
            const rate = winRateFor(l);
            return (
              <div key={l}>
                <p className="text-xs text-gray-400">{l}</p>
                <p className="text-lg font-bold">{rate === null ? "—" : `${rate}%`}</p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl shadow-lg shadow-black/40 hover:border-accent/30 transition-colors p-6">
        <p className="text-xs text-gray-500 uppercase tracking-wide mb-3">Setup History</p>
        {sortedSetups.length === 0 ? (
          <p className="text-sm text-gray-400">No setups saved yet.</p>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {sortedSetups.map((s) => (
              <div key={s.id} className="flex items-center justify-between text-sm border-b border-border pb-2">
                <div>
                  <span className="text-gray-400">{s.date} {s.time}</span>{" "}
                  <span className={s.direction === "buy" ? "text-green" : "text-red"}>{s.direction.toUpperCase()}</span>{" "}
                  <span className="text-gray-300">— {s.label} ({s.score})</span>
                </div>
                {s.outcome === "pending" ? (
                  <div className="flex gap-2">
                    <button onClick={() => updateOutcome(s.id, "win")} className="text-xs text-green hover:underline">Mark Win</button>
                    <button onClick={() => updateOutcome(s.id, "loss")} className="text-xs text-red hover:underline">Mark Loss</button>
                  </div>
                ) : (
                  <span className={s.outcome === "win" ? "text-green text-xs font-semibold" : "text-red text-xs font-semibold"}>{s.outcome.toUpperCase()}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}