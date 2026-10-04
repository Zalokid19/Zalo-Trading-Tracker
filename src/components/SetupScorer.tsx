import { useState, useEffect, useRef } from "react";
import Gauge from "./Gauge";
import SetupChart, { type ChartData } from "./SetupChart";
import type { SetupRecord, Account, ActiveSetup } from "../types";
import type { TradeLevels } from "../tradeLevels";
import { useSetups } from "../useSetups";
import { fetchXauCandles, combineCandles, RateLimitError } from "../xauApi";
import { getCriteriaStats } from "../criteriaStats";
import { fetchLotSize, type LotSizing } from "../mt5Api";
import { notifySetupAlert, notifyOutcomeHit } from "../notifications";
import { checkSetupOutcome } from "../outcomeChecker";
import { detectIct, type Candle, type IctResult } from "../ictModel";
import { canTradeToday, recordTrade, tradesToday, MAX_TRADES_PER_DAY } from "../tradeLimit";
import { executeSetup } from "../autoTrade";
import { loadTracking, saveTracking, resolveTracked, type TrackedSetup } from "../setupTracker";

const cardCls =
  "bg-gradient-to-b from-card to-cardhover border border-border rounded-xl shadow-xl shadow-black/50 hover:shadow-accent/10 hover:border-accent/20 transition-all p-4 md:p-6";

// Score mapping: a confirmed sequence scores 50 + quality/2, so 80+ means a confirmed setup with quality 60+.
const SHOW_LEVELS_AT = 80;
const EXECUTE_AT = 80;
const SCAN_INTERVAL_MS = 5 * 60 * 1000;
const INTRADAY_TTL_MS = 3 * 60 * 60 * 1000;
const SWING_TTL_MS = 24 * 60 * 60 * 1000;
// Set to true if fetchXauCandles returns the newest candle first.
const NEWEST_FIRST = false;

type Direction = "buy" | "sell";
type Strategy = "intraday" | "swing";
type Detail = Record<string, { detected: boolean; reason: string }>;

interface PanelData {
  direction: Direction;
  score: number;
  levels: TradeLevels | null;
}

interface Scored {
  tf: string;
  strategy: Strategy;
  result: IctResult;
  score: number;
  checked: Record<string, boolean>;
}

const MODEL_CHECKS = [
  { id: "liquiditySweep", label: "Liquidity sweep" },
  { id: "displacement", label: "Displacement" },
  { id: "mss", label: "Market structure shift" },
  { id: "fvg", label: "FVG entry zone" },
  { id: "entry", label: "Entry, stop and target set" },
];

function getLabel(score: number): "Weak" | "Moderate" | "Strong" {
  if (score >= 70) return "Strong";
  if (score >= 40) return "Moderate";
  return "Weak";
}

function scoreOf(r: IctResult): { checked: Record<string, boolean>; score: number } {
  const confirmed = r.stage === "confirmed";
  const checked: Record<string, boolean> = {
    liquiditySweep: r.sweep,
    displacement: r.displacement,
    mss: confirmed,
    fvg: r.fvg,
    entry: confirmed && r.levels !== null,
  };
  const score = confirmed ? Math.round(50 + r.quality / 2) : r.stage === "swept" ? 25 : 0;
  return { checked, score };
}

function detailOf(r: IctResult): Detail {
  return {
    liquiditySweep: { detected: r.sweep, reason: r.reasons.sweep },
    displacement: { detected: r.displacement, reason: r.reasons.displacement },
    mss: { detected: r.stage === "confirmed", reason: r.reasons.mss },
    fvg: { detected: r.fvg, reason: r.reasons.fvg },
    entry: { detected: r.stage === "confirmed" && r.levels !== null, reason: r.reasons.entry },
  };
}

function perspectiveOf(s: Scored): string {
  const r = s.result;
  if (r.stage === "none") return "No sweep, shift and entry sequence on any timeframe right now. Waiting for liquidity to be taken.";
  const side = r.direction === "buy" ? "Bullish" : "Bearish";
  if (r.stage === "swept") return `${s.tf}: ${side} sweep in progress. ${r.reasons.sweep} ${r.reasons.mss}`;
  const missed = r.entryPassed ? " Price already traded through the entry, so this one is missed." : "";
  return `${s.tf}: ${side} setup confirmed ${r.ageBars} bars ago, quality ${r.quality}/100. ${r.reasons.sweep} ${r.reasons.mss} ${r.reasons.fvg}${missed}`;
}

function closedOnly<T>(raw: T[]): T[] {
  const ordered = NEWEST_FIRST ? [...raw].reverse() : raw;
  return ordered.slice(0, -1); // drop the candle that is still forming
}

const FIRED_KEY = "zalo-fired-setups";
function loadFired(): string[] {
  try {
    return JSON.parse(localStorage.getItem(FIRED_KEY) ?? "[]");
  } catch {
    return [];
  }
}
function saveFired(key: string) {
  localStorage.setItem(FIRED_KEY, JSON.stringify([...loadFired(), key].slice(-40)));
}

function recordOf(t: TrackedSetup, outcome: "pending" | "win" | "loss"): SetupRecord {
  const d = new Date(t.firedAt);
  return {
    id: t.id,
    date: d.toISOString().split("T")[0],
    time: d.toTimeString().slice(0, 5),
    direction: t.direction,
    score: t.score,
    label: getLabel(t.score),
    outcome,
    checkedCriteria: t.checked,
    entry: t.entry,
    stopLoss: t.stopLoss,
    tp1: t.tp1,
  };
}

function StrategyPanel({ title, data }: { title: string; data: PanelData | null }) {
  if (!data)
    return (
      <div className={cardCls}>
        <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">{title}</p>
        <p className="text-sm text-gray-500">Run an analysis to see this strategy's levels.</p>
      </div>
    );

  const label = getLabel(data.score);
  const dirColor = data.direction === "buy" ? "text-green" : "text-red";
  const ready = data.score >= SHOW_LEVELS_AT;

  return (
    <div className={cardCls}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-gray-500 uppercase tracking-wide">{title}</p>
        <span className={`text-xs font-semibold ${ready ? "text-green" : "text-gray-500"}`}>
          {ready ? "Confirmed" : "Forming"}
        </span>
      </div>
      <p className="text-lg font-bold mb-3">
        <span className={dirColor}>{data.direction.toUpperCase()}</span>{" "}
        <span className="text-sm text-gray-500 font-normal">
          ({data.score}/100 — {label})
        </span>
      </p>
      {data.levels ? (
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><span className="text-gray-400">Entry </span><span className="font-semibold">${data.levels.entry.toFixed(2)}</span></div>
          <div><span className="text-gray-400">Stop </span><span className="font-semibold text-red">${data.levels.stopLoss.toFixed(2)}</span></div>
          <div><span className="text-gray-400">TP1 </span><span className="font-semibold text-green">${data.levels.tp1.toFixed(2)}</span></div>
          <div><span className="text-gray-400">TP2 </span><span className="font-semibold text-green">${data.levels.tp2.toFixed(2)}</span></div>
        </div>
      ) : (
        <p className="text-sm text-gray-500">No levels yet.</p>
      )}
    </div>
  );
}

interface Props {
  accounts: Account[];
}

export default function SetupScorer(_props: Props) {
  const [direction, setDirection] = useState<Direction>("buy");
  const [strategy, setStrategy] = useState<Strategy>("intraday");
  const [bestTf, setBestTf] = useState<string | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [score, setScore] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detection, setDetection] = useState<Detail | null>(null);
  const [perspective, setPerspective] = useState<string | null>(null);
  const [levels, setLevels] = useState<TradeLevels | null>(null);
  const [autoScan, setAutoScan] = useState(() => localStorage.getItem("zalo-autoscan") === "on");
  const [autoExec, setAutoExec] = useState(() => localStorage.getItem("zalo-autoexec") === "on");
  const [tradeCount, setTradeCount] = useState(() => tradesToday());
  const [trackedCount, setTrackedCount] = useState(() => loadTracking().length);
  const [sizing, setSizing] = useState<LotSizing | null>(null);
  const [sizingError, setSizingError] = useState<string | null>(null);
  const [chartData, setChartData] = useState<ChartData | null>(null);
  const [otherScores, setOtherScores] = useState<{ intraday: number; swing: number } | null>(null);
  const [intradayPanel, setIntradayPanel] = useState<PanelData | null>(null);
  const [swingPanel, setSwingPanel] = useState<PanelData | null>(null);
  const [activeSetup, setActiveSetup] = useState<ActiveSetup | null>(() => {
    try {
      const saved = localStorage.getItem("zalo-active-setup");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const activeSetupRef = useRef<ActiveSetup | null>(activeSetup);
  const prevCheckedRef = useRef<Record<string, boolean>>({});
  const scanningRef = useRef(false);
  const { setups, addSetup, updateOutcome } = useSetups();

  // The auto-scan interval keeps calling the first version of runAnalysis, so anything it
  // reads that changes over time goes through this ref instead of the render closure.
  const live = useRef({ setups, addSetup, updateOutcome, autoExec });
  live.current = { setups, addSetup, updateOutcome, autoExec };

  function persistActiveSetup(setup: ActiveSetup | null) {
    activeSetupRef.current = setup;
    setActiveSetup(setup);
    if (setup) localStorage.setItem("zalo-active-setup", JSON.stringify(setup));
    else localStorage.removeItem("zalo-active-setup");
  }

  const label = getLabel(score);
  const stats = getCriteriaStats(setups);

  async function runAnalysis(silent = false) {
    if (scanningRef.current) return;
    scanningRef.current = true;
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const [raw1, raw5, raw15, raw30, raw60, raw240, rawDay] = await Promise.all([
        fetchXauCandles("1min", 300),
        fetchXauCandles("5min", 100),
        fetchXauCandles("15min", 100),
        fetchXauCandles("30min", 100),
        fetchXauCandles("1h", 100),
        fetchXauCandles("4h", 100),
        fetchXauCandles("1day", 5),
      ]);
      const raw3 = combineCandles(raw1, 3);

      const ordered1 = NEWEST_FIRST ? [...raw1].reverse() : raw1;
      const price = ordered1[ordered1.length - 1]?.close;
      if (price === undefined) throw new Error("No price data returned.");

      // Manually saved setups waiting on an outcome (auto-tracked ones are handled further down).
      const autoIds = new Set(loadTracking().map((t) => t.id));
      live.current.setups
        .filter((s) => s.outcome === "pending" && !autoIds.has(s.id))
        .forEach((s) => {
          const result = checkSetupOutcome(s, price);
          if (result) {
            live.current.updateOutcome(s.id, result);
            notifyOutcomeHit(result, s.direction, price);
          }
        });

      const frames: { tf: string; strategy: Strategy; candles: Candle[] }[] = [
        { tf: "1m", strategy: "intraday", candles: closedOnly(raw1) },
        { tf: "3m", strategy: "intraday", candles: closedOnly(raw3) },
        { tf: "5m", strategy: "intraday", candles: closedOnly(raw5) },
        { tf: "15m", strategy: "swing", candles: closedOnly(raw15) },
        { tf: "30m", strategy: "swing", candles: closedOnly(raw30) },
        { tf: "1h", strategy: "swing", candles: closedOnly(raw60) },
        { tf: "4h", strategy: "swing", candles: closedOnly(raw240) },
      ];

      const scored: Scored[] = frames.map((f) => {
        const result = detectIct(f.candles);
        return { tf: f.tf, strategy: f.strategy, result, ...scoreOf(result) };
      });

      const better = (a: Scored, b: Scored) =>
        b.score > a.score || (b.score === a.score && b.result.ageBars < a.result.ageBars) ? b : a;
      const best = scored.reduce(better);
      const bestIntraday = scored.filter((s) => s.strategy === "intraday").reduce(better);
      const bestSwing = scored.filter((s) => s.strategy === "swing").reduce(better);

      // 0) Confirmed setups record themselves once price reaches the entry, and are marked
      //    win or loss from the candles that formed after they fired.
      const frameOf = (tf: string) => frames.find((f) => f.tf === tf)?.candles ?? [];
      const trackFrames = { "1m": frameOf("1m"), "5m": frameOf("5m"), "15m": frameOf("15m"), "1h": frameOf("1h") };
      const stillTracked: TrackedSetup[] = [];
      for (const t of loadTracking()) {
        const status = resolveTracked(t, trackFrames, Date.now());
        if (status === "waiting") {
          stillTracked.push(t);
          continue;
        }
        if (status === "filled") {
          if (!t.saved) live.current.addSetup(recordOf(t, "pending"));
          stillTracked.push({ ...t, saved: true });
          continue;
        }
        if (status === "win" || status === "loss") {
          if (t.saved) live.current.updateOutcome(t.id, status);
          else live.current.addSetup(recordOf(t, status));
          notifyOutcomeHit(status, t.direction, price);
        }
        // Finished (win, loss, missed or expired): release the lock if it belonged to this setup.
        if (activeSetupRef.current?.id === t.id) persistActiveSetup(null);
      }
      saveTracking(stillTracked);
      setTrackedCount(stillTracked.length);

      // 1) Manage the setup we are already locked on.
      const active = activeSetupRef.current;
      if (active) {
        const hitTP = active.direction === "buy" ? price >= active.tp1 : price <= active.tp1;
        const hitSL = active.direction === "buy" ? price <= active.stopLoss : price >= active.stopLoss;
        const ttl = active.strategy === "swing" ? SWING_TTL_MS : INTRADAY_TTL_MS;
        const expired = Date.now() - new Date(active.startedAt).getTime() > ttl;
        if (hitTP || hitSL || expired) {
          persistActiveSetup(null);
        }
      }

      // 2) A new confirmed setup: lock it, alert, and (if switched on) place the demo order.
      const r = best.result;
      if (
        !activeSetupRef.current &&
        r.stage === "confirmed" &&
        r.levels &&
        r.direction &&
        best.score >= EXECUTE_AT &&
        !r.entryPassed
      ) {
        const lv = r.levels;
        const key = `${best.tf}|${r.direction}|${lv.entry.toFixed(2)}|${lv.stopLoss.toFixed(2)}`;
        if (!loadFired().includes(key)) {
          saveFired(key); // remembered before any await, so an overlapping scan can't fire it twice
          const setupId = crypto.randomUUID();
          saveTracking([
            ...loadTracking(),
            {
              id: setupId,
              tf: best.tf,
              strategy: best.strategy,
              direction: r.direction,
              entry: lv.entry,
              stopLoss: lv.stopLoss,
              tp1: lv.tp1,
              score: best.score,
              checked: Object.keys(best.checked).filter((k) => best.checked[k]),
              firedAt: Date.now(),
              saved: false,
            },
          ]);
          setTrackedCount(loadTracking().length);
          persistActiveSetup({
            id: setupId,
            direction: r.direction,
            strategy: best.strategy,
            score: best.score,
            entry: lv.entry,
            stopLoss: lv.stopLoss,
            tp1: lv.tp1,
            tp2: lv.tp2,
            tp3: lv.tp3,
            startedAt: new Date().toISOString(),
          });
          notifySetupAlert(r.direction, best.score, lv.entry, lv.stopLoss, lv.tp1);

          if (live.current.autoExec) {
            if (canTradeToday()) {
              try {
                await executeSetup({
                  direction: r.direction,
                  entry: lv.entry,
                  stopLoss: lv.stopLoss,
                  takeProfit: lv.tp1,
                  expiresInMinutes: best.strategy === "swing" ? 24 * 60 : 180,
                });
                recordTrade();
                setTradeCount(tradesToday());
              } catch (e) {
                setError(`Order not placed: ${e instanceof Error ? e.message : "unknown error"}`);
              }
            } else {
              setError(`Daily limit of ${MAX_TRADES_PER_DAY} trades reached, so this setup was not executed.`);
            }
          }
        }
      }

      // 3) Update the screen.
      setIntradayPanel({ direction: bestIntraday.result.direction ?? "buy", score: bestIntraday.score, levels: bestIntraday.result.levels });
      setSwingPanel({ direction: bestSwing.result.direction ?? "buy", score: bestSwing.score, levels: bestSwing.result.levels });
      setOtherScores({ intraday: bestIntraday.score, swing: bestSwing.score });

      const newly = MODEL_CHECKS.filter((c) => best.checked[c.id] && !prevCheckedRef.current[c.id]);
      const base = perspectiveOf(best);
      setPerspective(newly.length > 0 ? `Update: ${newly.map((c) => c.label).join(", ")} just confirmed. ${base}` : base);
      prevCheckedRef.current = best.checked;

      setStrategy(best.strategy);
      setBestTf(r.stage === "none" ? null : best.tf);
      setDirection((d) => r.direction ?? d);
      setChecked(best.checked);
      setScore(best.score);
      setDetection(detailOf(r));

      // The chart draws the same analysis the scorer just made, so the two can never disagree.
      const rawFor: Record<string, typeof raw1> = { "1m": raw1, "3m": raw3, "5m": raw5, "15m": raw15, "30m": raw30, "1h": raw60, "4h": raw240 };
      const chartFrames: ChartData["frames"] = {};
      for (const s of scored) {
        const raw = rawFor[s.tf];
        chartFrames[s.tf] = { candles: NEWEST_FIRST ? [...raw].reverse() : raw, result: s.result };
      }
      setChartData({
        frames: chartFrames,
        daily: NEWEST_FIRST ? [...rawDay].reverse() : rawDay,
        bestTf: r.stage === "none" ? null : best.tf,
      });

      const locked = activeSetupRef.current;
      setLevels(
        locked
          ? { entry: locked.entry, stopLoss: locked.stopLoss, tp1: locked.tp1, tp2: locked.tp2, tp3: locked.tp3 }
          : r.stage === "confirmed"
            ? r.levels
            : null
      );
    } catch (err) {
      if (err instanceof RateLimitError) {
        setError(`Too many requests right now — please wait ${err.secondsRemaining}s and try again.`);
      } else {
        setError(err instanceof Error ? err.message : "Failed to analyze chart");
      }
    } finally {
      scanningRef.current = false;
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!autoScan) return;
    runAnalysis(true);
    const interval = setInterval(() => runAnalysis(true), SCAN_INTERVAL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoScan]);

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
      entry: levels?.entry,
      stopLoss: levels?.stopLoss,
      tp1: levels?.tp1,
    };
    addSetup(record);

    setChecked({});
    setScore(0);
    setDetection(null);
    setPerspective(null);
    setLevels(null);
    setOtherScores(null);
    prevCheckedRef.current = {};
  }

  function winRateFor(l: string) {
    const relevant = setups.filter((s) => s.label === l && s.outcome !== "pending");
    if (relevant.length === 0) return null;
    const wins = relevant.filter((s) => s.outcome === "win").length;
    return Math.round((wins / relevant.length) * 100);
  }

  const sortedSetups = [...setups].sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));

  // Lot size is read from the live MT5 account (balance, equity, free margin). Nothing to type in.
  const showLevels = !!levels && score >= SHOW_LEVELS_AT;
  useEffect(() => {
    if (!levels || !showLevels) {
      setSizing(null);
      setSizingError(null);
      return;
    }
    let cancelled = false;
    fetchLotSize(direction, levels.entry, levels.stopLoss).then((r) => {
      if (cancelled) return;
      setSizing(r.sizing);
      setSizingError(r.error);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showLevels, direction, levels?.entry, levels?.stopLoss]);

  const directionColor = direction === "buy" ? "text-green" : "text-red";

  return (
    <div className="w-full max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Zalo Setup Scorer</h1>
        <p className="text-sm text-accent font-semibold">XAU/USD</p>
      </div>

      <div className={cardCls}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs text-gray-400 mb-1">Detected right now</p>
            <p className="text-lg font-bold">
              <span className="capitalize">{strategy}</span>
              {bestTf && <span className="text-gray-400 font-normal"> {bestTf}</span>}{" "}
              <span className={directionColor}>{direction.toUpperCase()}</span>{" "}
              <span className="text-gray-500 font-normal text-sm">
                ({score}/100) — {score >= SHOW_LEVELS_AT ? "Confirmed, entry-ready" : "Forming / No Entry Yet"}
              </span>
            </p>
            {otherScores && (
              <p className="text-xs text-gray-500 mt-1">
                Also checked: intraday best {otherScores.intraday}/100 · swing best {otherScores.swing}/100
              </p>
            )}

            {activeSetup && (
              <p className="text-xs text-teal mt-2 font-medium">
                🔒 Locked on a {activeSetup.direction.toUpperCase()} since {new Date(activeSetup.startedAt).toLocaleTimeString()} — holding until TP/SL hits or it expires.
              </p>
            )}

            {score < SHOW_LEVELS_AT && (
              <p className="text-xs text-accent mt-2 font-medium">
                ⚠ Not confirmed yet — the sweep, structure shift and FVG all have to happen in that order before this counts as an entry.
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => runAnalysis(false)}
              disabled={loading}
              className="bg-accent text-black font-semibold rounded-lg px-5 py-2 text-sm hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "Analyzing..." : "Analyze Chart"}
            </button>
            <button
              onClick={() => {
                setAutoScan((v) => {
                  const next = !v;
                  localStorage.setItem("zalo-autoscan", next ? "on" : "off");
                  return next;
                });
              }}
              className={`text-xs font-semibold rounded-lg px-4 py-2.5 flex items-center gap-2 transition-all ${
                autoScan
                  ? "bg-green/15 text-green border border-green/50 shadow-[0_0_12px_rgba(0,230,160,0.25)]"
                  : "bg-bgdark border border-border text-gray-400"
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${autoScan ? "bg-green animate-pulse" : "bg-gray-600"}`} />
              {autoScan ? "Auto-Scan ON · every 5 min" : "Auto-Scan OFF"}
            </button>
            <button
              onClick={() => {
                setAutoExec((v) => {
                  const next = !v;
                  localStorage.setItem("zalo-autoexec", next ? "on" : "off");
                  return next;
                });
              }}
              className={`text-xs font-semibold rounded-lg px-4 py-2.5 flex items-center gap-2 transition-all ${
                autoExec
                  ? "bg-accent/15 text-accent border border-accent/50"
                  : "bg-bgdark border border-border text-gray-400"
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${autoExec ? "bg-accent animate-pulse" : "bg-gray-600"}`} />
              {autoExec ? `Auto-Execute ON · ${tradeCount}/${MAX_TRADES_PER_DAY} today` : "Auto-Execute OFF"}
            </button>
          </div>
        </div>
        {autoExec && (
          <p className="text-xs text-gray-500 mt-3">
            Confirmed setups place a pending limit order on your MT5 demo account, up to {MAX_TRADES_PER_DAY} a day. The tab has to stay open.
          </p>
        )}
        {trackedCount > 0 && (
          <p className="text-xs text-gray-500 mt-3">
            Tracking {trackedCount} confirmed setup{trackedCount === 1 ? "" : "s"}. Each is saved to history when price reaches its entry, then marked win or loss when the stop or target is hit.
          </p>
        )}
        {error && <p className="text-sm text-red mt-3 break-words">{error}</p>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <StrategyPanel title="Intraday" data={intradayPanel} />
        <StrategyPanel title="Swing" data={swingPanel} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6 min-w-0">
          <div className="bg-card border-2 border-accent/40 rounded-xl p-4 md:p-6">
            <p className="text-xs text-accent uppercase tracking-widest font-bold mb-2">Perspective</p>
            <p className="text-sm text-gray-200 leading-relaxed">
              {perspective || "Run an analysis to see what the market is doing and why."}
            </p>
          </div>

          {levels && score >= SHOW_LEVELS_AT && (
            <div className={cardCls}>
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-3">Trade Levels</p>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
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
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 pt-4 border-t border-border">
                <div>
                  <p className="text-xs text-gray-400">Lot size (automatic)</p>
                  <p className="text-lg font-bold text-accent">{sizing ? sizing.lots.toFixed(2) : "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Risked if stopped out</p>
                  <p className="text-lg font-bold text-accent">
                    {sizing ? `${sizing.riskAtLots.toFixed(2)} ${sizing.currency}` : "—"}
                  </p>
                  {sizing && <p className="text-xs text-gray-500">{sizing.riskPct.toFixed(2)}% of account</p>}
                </div>
                <div>
                  <p className="text-xs text-gray-400">Margin needed</p>
                  <p className="text-lg font-bold">{sizing ? sizing.marginRequired.toFixed(2) : "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Free margin</p>
                  <p className="text-lg font-bold">{sizing ? sizing.freeMargin.toFixed(2) : "—"}</p>
                </div>
              </div>
              {sizing && sizing.limitedBy === "margin" && (
                <p className="text-xs text-accent mt-3">Size was reduced to stay within your free margin.</p>
              )}
              {sizing && sizing.limitedBy === "min" && (
                <p className="text-xs text-accent mt-3">
                  This is the smallest lot MT5 allows, so the risk is a little above the target.
                </p>
              )}
              {sizingError && <p className="text-xs text-red mt-3">{sizingError}</p>}
              <p className="text-xs text-gray-500 mt-3">
                Entry is the near edge of the fair value gap, the stop sits beyond the sweep. Not a guarantee. Confirm on your own chart.
              </p>
            </div>
          )}
        </div>

        <div className={`${cardCls} flex items-center justify-center`}>
          <Gauge score={score} />
        </div>
      </div>

      <div className={`${cardCls} space-y-1`}>
        <p className="text-xs text-gray-500 uppercase tracking-wide mb-3">
          Checklist for the detected {direction === "buy" ? "Buy" : "Sell"}
        </p>
        {MODEL_CHECKS.map((c) => {
          const detail = detection ? detection[c.id] : null;
          const stat = stats.find((s) => s.id === c.id);
          return (
            <div key={c.id} className={`rounded-lg px-3 py-2.5 ${checked[c.id] ? "bg-green/10" : ""}`}>
              <label className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <input type="checkbox" checked={!!checked[c.id]} readOnly className="w-4 h-4 accent-accent" />
                <span className={checked[c.id] ? "text-white font-medium" : "text-gray-400"}>{c.label}</span>
                <span className="text-[10px] bg-bgdark border border-border rounded px-1.5 py-0.5 text-gray-500">auto</span>
              </label>
              {detail && <p className="text-xs text-gray-400 mt-1.5 ml-7 leading-relaxed">{detail.reason}</p>}
              {stat && stat.winRate !== null && (
                <p className="text-xs mt-1 ml-7">
                  <span className="text-gray-500">Your history: </span>
                  <span className={stat.winRate >= 60 ? "text-green" : stat.winRate >= 40 ? "text-accent" : "text-red"}>
                    {stat.winRate}% win rate
                  </span>
                  <span className="text-gray-600"> ({stat.timesTaken} trades)</span>
                </p>
              )}
            </div>
          );
        })}
        <button onClick={handleSave} className="bg-accent text-black font-semibold rounded-lg px-5 py-2 text-sm hover:opacity-90 mt-3">
          Save This Setup
        </button>
      </div>

      <SetupChart data={chartData} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className={cardCls}>
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

        <div className={cardCls}>
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-3">Setup History</p>
          {sortedSetups.length === 0 ? (
            <p className="text-sm text-gray-400">No setups saved yet.</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {sortedSetups.map((s) => (
                <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 text-sm border-b border-border pb-2">
                  <div>
                    <span className="text-gray-400">{s.date} {s.time}</span>{" "}
                    <span className={s.direction === "buy" ? "text-green" : "text-red"}>{s.direction.toUpperCase()}</span>{" "}
                    <span className="text-gray-300">— {s.label} ({s.score})</span>
                  </div>
                  {s.outcome === "pending" ? (
                    <div className="flex gap-3">
                      <button onClick={() => updateOutcome(s.id, "win")} className="text-xs text-green hover:underline">Mark Win</button>
                      <button onClick={() => updateOutcome(s.id, "loss")} className="text-xs text-red hover:underline">Mark Loss</button>
                    </div>
                  ) : (
                    <span className={s.outcome === "win" ? "text-green text-xs font-semibold" : "text-red text-xs font-semibold"}>
                      {s.outcome.toUpperCase()}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
