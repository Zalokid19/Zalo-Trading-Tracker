const API_KEY = import.meta.env.VITE_TWELVE_DATA_KEY;
const BASE_URL = "https://api.twelvedata.com";
const TIMEZONE = "Africa/Johannesburg"; // UTC+2, matches Cape Town / Belhar, no DST
const BRIDGE_URL = "http://localhost:5001";
const USE_MT5_BRIDGE = true; // flip to false to fall back to Twelve Data

export interface Candle {
  datetime: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export type Timeframe = "1min" | "5min" | "15min" | "30min" | "1h" | "2h" | "4h" | "8h" | "1day";

export class RateLimitError extends Error {
  secondsRemaining: number;
  constructor(secondsRemaining: number) {
    super(`Rate limited — try again in ${secondsRemaining}s`);
    this.secondsRemaining = secondsRemaining;
  }
}

const WINDOW_MS = 60_000;
const MAX_CALLS = 7;
let callTimestamps: number[] = [];

function canMakeRequest(): boolean {
  const now = Date.now();
  callTimestamps = callTimestamps.filter((t) => now - t < WINDOW_MS);
  return callTimestamps.length < MAX_CALLS;
}

function recordRequest(): void {
  callTimestamps.push(Date.now());
}

function secondsUntilNextSlot(): number {
  if (callTimestamps.length === 0) return 0;
  const oldest = callTimestamps[0];
  const wait = WINDOW_MS - (Date.now() - oldest);
  return Math.max(0, Math.ceil(wait / 1000));
}

const CACHE_TTL_MS = 90_000;
const cache = new Map<string, { data: Candle[]; time: number }>();

async function fetchFromBridge(interval: Timeframe, outputsize: number): Promise<Candle[]> {
  const res = await fetch(`${BRIDGE_URL}/candles?interval=${interval}&outputsize=${outputsize}`);
  if (!res.ok) throw new Error(`Bridge returned ${res.status}`);
  const data = await res.json();
  if (data.status === "error") throw new Error(data.message || "Bridge error");
  return data.values as Candle[];
}

async function fetchFromTwelveData(interval: Timeframe, outputsize: number): Promise<Candle[]> {
  if (!canMakeRequest()) {
    const key = `${interval}-${outputsize}`;
    const cached = cache.get(key);
    if (cached) return cached.data;
    throw new RateLimitError(secondsUntilNextSlot());
  }
  recordRequest();

  const url = `${BASE_URL}/time_series?symbol=XAU/USD&interval=${interval}&outputsize=${outputsize}&timezone=${encodeURIComponent(TIMEZONE)}&apikey=${API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.status === "error") throw new Error(data.message || "Failed to fetch XAU/USD data");

  const candles: Candle[] = data.values.map((v: any) => ({
    datetime: v.datetime,
    open: parseFloat(v.open),
    high: parseFloat(v.high),
    low: parseFloat(v.low),
    close: parseFloat(v.close),
  }));
  return candles.reverse();
}

export let lastDataSource: "mt5" | "twelvedata" = "twelvedata";

export async function fetchXauCandles(interval: Timeframe, outputsize = 100): Promise<Candle[]> {
  const key = `${interval}-${outputsize}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.time < CACHE_TTL_MS) {
    return cached.data;
  }

  let result: Candle[];
  if (USE_MT5_BRIDGE) {
    try {
      result = await fetchFromBridge(interval, outputsize);
      lastDataSource = "mt5";
    } catch (err) {
      console.warn("MT5 bridge unavailable, falling back to Twelve Data:", err);
      result = await fetchFromTwelveData(interval, outputsize);
      lastDataSource = "twelvedata";
    }
  } else {
    result = await fetchFromTwelveData(interval, outputsize);
    lastDataSource = "twelvedata";
  }

  cache.set(key, { data: result, time: Date.now() });
  return result;
}

export function combineCandles(candles: Candle[], groupSize: number): Candle[] {
  const result: Candle[] = [];
  for (let i = 0; i + groupSize <= candles.length; i += groupSize) {
    const group = candles.slice(i, i + groupSize);
    result.push({
      datetime: group[0].datetime,
      open: group[0].open,
      high: Math.max(...group.map((c) => c.high)),
      low: Math.min(...group.map((c) => c.low)),
      close: group[group.length - 1].close,
    });
  }
  return result;
}