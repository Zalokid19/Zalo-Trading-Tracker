const KEY = "zalo-daily-trades";
export const MAX_TRADES_PER_DAY = 5;

function today() {
  return new Date().toLocaleDateString("en-CA"); // local date, YYYY-MM-DD
}

export function tradesToday(): number {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null");
    return saved?.date === today() ? saved.count : 0;
  } catch {
    return 0;
  }
}

export function canTradeToday(): boolean {
  return tradesToday() < MAX_TRADES_PER_DAY;
}

export function recordTrade(): void {
  localStorage.setItem(KEY, JSON.stringify({ date: today(), count: tradesToday() + 1 }));
}
