import type { Account, Trade, SetupRecord, ThresholdTrade } from "./types";

const ACCOUNTS_KEY = "trading-dashboard-accounts";
const TRADES_KEY = "trading-dashboard-trades";

// ---- Accounts ----
export function loadAccounts(): Account[] {
  const raw = localStorage.getItem(ACCOUNTS_KEY);
  return raw ? JSON.parse(raw) : [];
}

export function saveAccounts(accounts: Account[]): void {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}

export function updateAccount(updated: Account): Account[] {
  const accounts = loadAccounts().map((a) => (a.id === updated.id ? updated : a));
  saveAccounts(accounts);
  return accounts;
}

export function deleteTrade(tradeId: string): Trade[] {
  const trades = loadTrades().filter((t) => t.id !== tradeId);
  saveTrades(trades);
  return trades;
}

export function updateTrade(updated: Trade): Trade[] {
  const trades = loadTrades().map((t) => (t.id === updated.id ? updated : t));
  saveTrades(trades);
  return trades;
}

export function addAccount(account: Account): Account[] {
  const accounts = loadAccounts();
  const updated = [...accounts, account];
  saveAccounts(updated);
  return updated;
}

// ---- Trades ----
export function loadTrades(): Trade[] {
  const raw = localStorage.getItem(TRADES_KEY);
  return raw ? JSON.parse(raw) : [];
}

export function saveTrades(trades: Trade[]): void {
  localStorage.setItem(TRADES_KEY, JSON.stringify(trades));
}

export function addTrade(trade: Trade): Trade[] {
  const trades = loadTrades();
  const updated = [...trades, trade];
  saveTrades(updated);
  return updated;
}

export function getTradesForAccount(accountId: string): Trade[] {
  return loadTrades().filter((t) => t.accountId === accountId);
}

export function getTradesForDate(accountId: string, date: string): Trade[] {
  return getTradesForAccount(accountId).filter((t) => t.date === date);
}

export function loadSetups(): SetupRecord[] {
  const raw = localStorage.getItem("trading-dashboard-setups");
  return raw ? JSON.parse(raw) : [];
}

export function saveSetups(setups: SetupRecord[]): void {
  localStorage.setItem("trading-dashboard-setups", JSON.stringify(setups));
}

export function addSetup(setup: SetupRecord): SetupRecord[] {
  const setups = [...loadSetups(), setup];
  saveSetups(setups);
  return setups;
}

export function updateSetupOutcome(id: string, outcome: SetupRecord["outcome"]): SetupRecord[] {
  const setups = loadSetups().map((s) => (s.id === id ? { ...s, outcome } : s));
  saveSetups(setups);
  return setups;
}

const THRESHOLD_TRADES_KEY = "trading-dashboard-threshold-trades";

export function loadThresholdTrades(): ThresholdTrade[] {
  const raw = localStorage.getItem(THRESHOLD_TRADES_KEY);
  return raw ? JSON.parse(raw) : [];
}

export function saveThresholdTrades(trades: ThresholdTrade[]): void {
  localStorage.setItem(THRESHOLD_TRADES_KEY, JSON.stringify(trades));
}

export function addThresholdTrade(trade: ThresholdTrade): ThresholdTrade[] {
  const trades = [...loadThresholdTrades(), trade];
  saveThresholdTrades(trades);
  return trades;
}

export function updateThresholdTradeResult(id: string, outcome: "win" | "loss", profit: number): ThresholdTrade[] {
  const trades = loadThresholdTrades().map((t) => (t.id === id ? { ...t, outcome, profit } : t));
  saveThresholdTrades(trades);
  return trades;
}