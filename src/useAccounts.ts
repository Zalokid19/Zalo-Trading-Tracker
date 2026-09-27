import { useState, useEffect } from "react";
import type { Account } from "./types";
import { loadAccounts, saveAccounts, updateAccount as updateAccountInStorage } from "./storage";
import { initialAccounts } from "./seedData";

export function useAccounts() {
  const [accounts, setAccounts] = useState<Account[]>([]);

  useEffect(() => {
    const existing = loadAccounts();
    if (existing.length === 0) {
      saveAccounts(initialAccounts);
      setAccounts(initialAccounts);
    } else {
      setAccounts(existing);
    }
  }, []);

  function updateAccount(updated: Account) {
    const result = updateAccountInStorage(updated);
    setAccounts(result);
  }

  return { accounts, setAccounts, updateAccount };
}