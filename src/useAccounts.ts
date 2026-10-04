import { useState, useEffect } from "react";
import type { Account } from "./types";
import { loadAccounts, saveAccounts, updateAccount as updateAccountInStorage } from "./storage";
import { initialAccounts } from "./seedData";

export function useAccounts() {
  const [accounts, setAccounts] = useState<Account[]>([]);

  useEffect(() => {
    const existing = loadAccounts() as Partial<Account>[];
    if (existing.length === 0) {
      saveAccounts(initialAccounts);
      setAccounts(initialAccounts);
      return;
    }
    const migrated = existing.map((acc) => {
      const seed = initialAccounts.find((s) => s.id === acc.id);
      return {
        ...acc,
        riskPerTradePct: acc.riskPerTradePct ?? seed?.riskPerTradePct ?? 1,
        floatingLossCap: acc.floatingLossCap ?? seed?.floatingLossCap ?? 0,
      } as Account;
    });
    saveAccounts(migrated);
    setAccounts(migrated);
  }, []);

  function updateAccount(updated: Account) {
    setAccounts(updateAccountInStorage(updated));
  }

  return { accounts, setAccounts, updateAccount };
}