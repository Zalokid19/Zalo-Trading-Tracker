const API_KEY = import.meta.env.VITE_TWELVE_DATA_KEY;
const BASE_URL = "https://api.twelvedata.com";

export interface Candle {
  datetime: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export type Timeframe = "1min" | "3min" | "5min" | "15min" | "1h" | "4h" | "1day";

export async function fetchXauCandles(interval: Timeframe, outputsize = 100): Promise<Candle[]> {
  const url = `${BASE_URL}/time_series?symbol=XAU/USD&interval=${interval}&outputsize=${outputsize}&apikey=${API_KEY}`;

  const res = await fetch(url);
  const data = await res.json();

  if (data.status === "error") {
    throw new Error(data.message || "Failed to fetch XAU/USD data");
  }

  const candles: Candle[] = data.values.map((v: any) => ({
    datetime: v.datetime,
    open: parseFloat(v.open),
    high: parseFloat(v.high),
    low: parseFloat(v.low),
    close: parseFloat(v.close),
  }));

  // Twelve Data returns newest-first; we want oldest-first for analysis
  return candles.reverse();
}

// Combine N consecutive 1-min candles into synthetic larger candles (e.g. 3 candles = 3min)
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