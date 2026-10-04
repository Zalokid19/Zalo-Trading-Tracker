export type AccountType = "funded" | "personal";

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  startingBalance: number;
  balance: number;
  dailyLossPct: number;
  maxLossPct: number;
  riskPerTradePct: number;
  floatingLossCap: number;
  createdAt: string;
}

export interface Trade {
  id: string;
  accountId: string;
  date: string;
  time: string;
  pnl: number;
  notes?: string;
}

export interface SetupRecord {
  id: string;
  date: string;
  time: string;
  direction: "buy" | "sell";
  score: number;
  label: "Weak" | "Moderate" | "Strong";
  outcome: "win" | "loss" | "pending";
  checkedCriteria: string[];
  entry?: number;
  stopLoss?: number;
  tp1?: number;
}

export interface ThresholdTrade {
  id: string;
  threshold: number;
  date: string;
  time: string;
  direction: "buy" | "sell";
  score: number;
  entry: number;
  stopLoss: number;
  tp1: number;
  mt5Ticket: number;
  outcome: "win" | "loss" | "pending";
  profit?: number;
}

export interface ActiveSetup {
  id: string;
  direction: "buy" | "sell";
  strategy: "intraday" | "swing";
  score: number;
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  startedAt: string;
}