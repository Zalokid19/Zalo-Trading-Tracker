import type { Candle } from "./ictModel";

// A confirmed setup that is being followed until its outcome is known.
export interface TrackedSetup {
  id: string; // same id is used for the history record and the locked setup
  tf: string;
  strategy: "intraday" | "swing";
  direction: "buy" | "sell";
  entry: number;
  stopLoss: number;
  tp1: number;
  score: number;
  checked: string[];
  firedAt: number; // ms
  saved: boolean; // already written to Setup History as pending
}

export type TrackStatus = "waiting" | "filled" | "win" | "loss" | "missed" | "expired";
export type TrackFrames = Record<"1m" | "5m" | "15m" | "1h", Candle[]>;

const HOUR = 3_600_000;
const BAR_MS = { "1m": 60_000, "5m": 300_000, "15m": 900_000, "1h": HOUR } as const;
const KEY = "zalo-tracking";

export function loadTracking(): TrackedSetup[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function saveTracking(list: TrackedSetup[]): void {
  localStorage.setItem(KEY, JSON.stringify(list.slice(-30)));
}

// Walks the CLOSED candles that formed after the setup fired, in order:
//   1. price has to reach the entry (the limit order fills) within the fill window
//   2. after the fill, whichever of stop or target is touched first decides the outcome
// If one candle touches both, the stop is assumed to have come first, so results are never flattering.
// Candles are oldest -> newest and must not include the one still forming.
export function resolveTracked(t: TrackedSetup, frames: TrackFrames, now: number): TrackStatus {
  const elapsed = Math.max(0, now - t.firedAt);
  const key = elapsed <= 4 * HOUR ? "1m" : elapsed <= 8 * HOUR ? "5m" : elapsed <= 24 * HOUR ? "15m" : "1h";
  const ms = BAR_MS[key];

  // Bars that opened strictly after the fire moment (one less than the elapsed count, to be safe).
  const count = Math.max(0, Math.floor(elapsed / ms) - 1);
  const candles = count > 0 ? frames[key].slice(-count) : [];

  const fillWait = t.strategy === "swing" ? 24 * HOUR : 3 * HOUR;
  const fillBars = Math.ceil(fillWait / ms);
  const buy = t.direction === "buy";
  let filled = false;

  for (let i = 0; i < candles.length; i++) {
    const k = candles[i];
    if (!filled) {
      if (i < fillBars && (buy ? k.low <= t.entry : k.high >= t.entry)) {
        filled = true;
        if (buy ? k.low <= t.stopLoss : k.high >= t.stopLoss) return "loss";
        continue; // the target isn't counted on the same candle as the fill
      }
      if (buy ? k.high >= t.tp1 : k.low <= t.tp1) return "missed"; // ran to the target without us
    } else {
      if (buy ? k.low <= t.stopLoss : k.high >= t.stopLoss) return "loss";
      if (buy ? k.high >= t.tp1 : k.low <= t.tp1) return "win";
    }
  }

  if (filled) return elapsed > 7 * 24 * HOUR ? "expired" : "filled";
  return elapsed > fillWait + 2 * ms ? "expired" : "waiting";
}
