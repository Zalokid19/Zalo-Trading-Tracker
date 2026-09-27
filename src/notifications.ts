import type { Account, Trade } from "./types";
import { getTodayPnl, getTotalPnl, formatMoney, getDollarLimit } from "./utils";

export function requestNotificationPermission(): void {
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
  }
}

function fireNotification(title: string, body: string) {
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification(title, { body });
  }
}

export function notifySetupAlert(
  direction: "buy" | "sell",
  score: number,
  entry: number,
  stopLoss: number,
  takeProfit: number
) {
  fireNotification(
    `XAU/USD: Strong ${direction.toUpperCase()} setup forming (${score}/100)`,
    `Entry: $${entry.toFixed(2)} | Stop: $${stopLoss.toFixed(2)} | Target: $${takeProfit.toFixed(2)}`
  );
}

export function checkLossLimits(account: Account, trades: Trade[]): void {
  const todayPnl = getTodayPnl(trades, account.id);
  const todayLoss = todayPnl < 0 ? Math.abs(todayPnl) : 0;

  const totalPnl = getTotalPnl(trades, account.id);
  const totalLoss = totalPnl < 0 ? Math.abs(totalPnl) : 0;

  const dailyLossLimit = getDollarLimit(account.startingBalance, account.dailyLossPct);
  const maxLossLimit = getDollarLimit(account.startingBalance, account.maxLossPct);
  const dailyPct = dailyLossLimit > 0 ? todayLoss / dailyLossLimit : 0;
  const maxPct = maxLossLimit > 0 ? totalLoss / maxLossLimit : 0;

  if (dailyPct >= 1) {
    fireNotification(
      account.name + ": Daily loss limit BREACHED",
      "You have lost " + formatMoney(todayLoss) + " today, over your " + formatMoney(dailyLossLimit) + " limit."
    );
  } else if (dailyPct >= 0.8) {
    fireNotification(
      account.name + ": Approaching daily loss limit",
      "You have lost " + formatMoney(todayLoss) + " today, " + Math.round(dailyPct * 100) + "% of your " + formatMoney(dailyLossLimit) + " limit."
    );
  }

  if (maxPct >= 1) {
    fireNotification(
      account.name + ": Max loss limit BREACHED",
      "Total drawdown is " + formatMoney(totalLoss) + ", over your " + formatMoney(maxLossLimit) + " max."
    );
  } else if (maxPct >= 0.8) {
    fireNotification(
      account.name + ": Approaching max loss limit",
      "Total drawdown is " + formatMoney(totalLoss) + ", " + Math.round(maxPct * 100) + "% of your " + formatMoney(maxLossLimit) + " max."
    );
  }
}