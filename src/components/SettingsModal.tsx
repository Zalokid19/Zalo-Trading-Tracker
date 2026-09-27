import { useState } from "react";
import type { Account } from "../types";

interface Props {
  account: Account;
  onSave: (updated: Account) => void;
  onClose: () => void;
}

export default function SettingsModal({ account, onSave, onClose }: Props) {
  const [name, setName] = useState(account.name);
  const [balance, setBalance] = useState(String(account.balance));
  const [dailyLossPct, setDailyLossPct] = useState(String(account.dailyLossPct));
  const [maxLossPct, setMaxLossPct] = useState(String(account.maxLossPct));

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave({
      ...account,
      name,
      balance: parseFloat(balance),
      dailyLossPct: parseFloat(dailyLossPct),
      maxLossPct: parseFloat(maxLossPct),
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <form
        onSubmit={handleSubmit}
        className="bg-card border border-border rounded-xl shadow-lg shadow-black/40 hover:border-accent/30 transition-colors p-6 w-full max-w-sm space-y-4"
      >
        <h3 className="text-lg font-semibold">Edit {account.name}</h3>

        <div>
          <label className="block text-xs text-gray-400 mb-1">Account Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="bg-bgdark border border-border rounded px-3 py-2 text-sm w-full"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1">Balance ($)</label>
          <input
            type="number"
            step="0.01"
            value={balance}
            onChange={(e) => setBalance(e.target.value)}
            className="bg-bgdark border border-border rounded px-3 py-2 text-sm w-full"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1">Daily Loss Limit (%)</label>
          <input
            type="number"
            step="0.1"
            value={dailyLossPct}
            onChange={(e) => setDailyLossPct(e.target.value)}
            className="bg-bgdark border border-border rounded px-3 py-2 text-sm w-full"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1">Max Loss Limit (%)</label>
          <input
            type="number"
            step="0.1"
            value={maxLossPct}
            onChange={(e) => setMaxLossPct(e.target.value)}
            className="bg-bgdark border border-border rounded px-3 py-2 text-sm w-full"
          />
        </div>

        <div className="flex gap-3 justify-end pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm rounded border border-border hover:bg-bgdark"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-2 text-sm rounded bg-accent text-black font-semibold hover:opacity-90"
          >
            Save
          </button>
        </div>
      </form>
    </div>
  );
}