import type { Account } from "./types";

export const initialAccounts: Account[] = [
  {
    id: "funded-1",
    name: "Account 2 - 256371",
    type: "funded",
    startingBalance: 5000,
    balance: 5223.99,
    dailyLossPct: 4,
    maxLossPct: 10,
    riskPerTradePct: 1,
    floatingLossCap: 100,
    createdAt: "2026-09-14",
  },
  {
    id: "personal-1",
    name: "Personal Account",
    type: "personal",
    startingBalance: 10,
    balance: 10,
    dailyLossPct: 4,
    maxLossPct: 10,
    riskPerTradePct: 1,
    floatingLossCap: 2,
    createdAt: "2026-09-27",
  },
];