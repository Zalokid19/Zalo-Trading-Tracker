import { useState } from "react";
import type { Account, Trade } from "../types";

interface Props {
  accounts: Account[];
  onAddTrade: (trade: Trade) => void;
}

export default function TradeForm({ accounts, onAddTrade }: Props) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [pnl, setPnl] = useState("");
  const [notes, setNotes] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!accountId || pnl === "") return;

    const now = new Date();
    const trade: Trade = {
      id: crypto.randomUUID(),
      accountId,
      date: now.toISOString().split("T")[0],
      time: now.toTimeString().slice(0, 5),
      pnl: parseFloat(pnl),
      notes: notes || undefined,
    };

    onAddTrade(trade);
    setPnl("");
    setNotes("");
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-gradient-to-b from-card to-cardhover border border-border rounded-xl shadow-xl shadow-black/50 hover:shadow-accent/10 hover:border-accent/20 transition-all p-6 flex flex-wrap gap-4 items-end"
    >
      <div>
        <label className="block text-xs text-gray-400 mb-1">Account</label>
        <select
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          className="bg-bgdark border border-border rounded px-3 py-2 text-sm"
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs text-gray-400 mb-1">P/L ($)</label>
        <input
          type="number"
          step="0.01"
          value={pnl}
          onChange={(e) => setPnl(e.target.value)}
          placeholder="e.g. 45.20 or -30"
          className="bg-bgdark border border-border rounded px-3 py-2 text-sm w-36"
          required
        />
      </div>

      <div className="flex-1 min-w-[150px]">
        <label className="block text-xs text-gray-400 mb-1">Notes (optional)</label>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. EURUSD scalp"
          className="bg-bgdark border border-border rounded px-3 py-2 text-sm w-full"
        />
      </div>

      <button
        type="submit"
        className="bg-accent text-black font-semibold rounded px-5 py-2 text-sm hover:opacity-90"
      >
        Add Trade
      </button>
    </form>
  );
}