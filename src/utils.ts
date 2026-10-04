import type { Trade } from "./types";

export function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}

export function getTodayTrades(trades: Trade[], accountId: string): Trade[] {
  const today = todayISO();
  return trades.filter((t) => t.accountId === accountId && t.date === today);
}

export function getTodayPnl(trades: Trade[], accountId: string): number {
  return getTodayTrades(trades, accountId).reduce((sum, t) => sum + t.pnl, 0);
}

export function getTotalPnl(trades: Trade[], accountId: string): number {
  return trades
    .filter((t) => t.accountId === accountId)
    .reduce((sum, t) => sum + t.pnl, 0);
}

export function getWinRate(trades: Trade[], accountId: string): number {
  const accountTrades = trades.filter((t) => t.accountId === accountId);
  if (accountTrades.length === 0) return 0;
  const wins = accountTrades.filter((t) => t.pnl > 0).length;
  return Math.round((wins / accountTrades.length) * 100 * 100) / 100;
}

export function getProfitFactor(trades: Trade[], accountId: string): number {
  const accountTrades = trades.filter((t) => t.accountId === accountId);
  const grossProfit = accountTrades
    .filter((t) => t.pnl > 0)
    .reduce((sum, t) => sum + t.pnl, 0);
  const grossLoss = Math.abs(
    accountTrades.filter((t) => t.pnl < 0).reduce((sum, t) => sum + t.pnl, 0)
  );
  if (grossLoss === 0) return grossProfit > 0 ? grossProfit : 0;
  return Math.round((grossProfit / grossLoss) * 100) / 100;
}

export function getDollarLimit(startingBalance: number, pct: number): number {
  return Math.round(startingBalance * (pct / 100) * 100) / 100;
}

export function getTradesTakenToday(trades: Trade[], accountId: string): number {
  return getTodayTrades(trades, accountId).length;
}

export function isChasingLosses(trades: Trade[], accountId: string): boolean {
  const today = getTodayTrades(trades, accountId).sort((a, b) => a.time.localeCompare(b.time));
  if (today.length < 2) return false;
  const lastTwo = today.slice(-2);
  return lastTwo.every((t) => t.pnl < 0);
}

export function getWeekdayDistribution(trades: Trade[], accountId: string) {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const accountTrades = trades.filter((t) => t.accountId === accountId);

  const result = days.map((day) => ({ day, wins: 0, losses: 0 }));

  accountTrades.forEach((t) => {
    const dayIndex = new Date(t.date + "T00:00:00").getDay();
    if (t.pnl > 0) result[dayIndex].wins += 1;
    else if (t.pnl < 0) result[dayIndex].losses += 1;
  });

  // reorder to start on Monday, matching the reference dashboard
  return [...result.slice(1), result[0]];
}

export function formatMoney(n: number): string {
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}