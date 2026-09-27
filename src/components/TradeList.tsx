import { useState } from "react";
import type { Trade } from "../types";
import { formatMoney } from "../utils";

interface Props {
  trades: Trade[];
  onDelete: (tradeId: string) => void;
  onUpdate: (trade: Trade) => void;
}

export default function TradeList({ trades, onDelete, onUpdate }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPnl, setEditPnl] = useState("");

  const sorted = [...trades].sort((a, b) =>
    (b.date + b.time).localeCompare(a.date + a.time)
  );

  function startEdit(trade: Trade) {
    setEditingId(trade.id);
    setEditPnl(String(trade.pnl));
  }

  function saveEdit(trade: Trade) {
    onUpdate({ ...trade, pnl: parseFloat(editPnl) });
    setEditingId(null);
  }

  if (sorted.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-lg shadow-black/40 hover:border-accent/30 transition-colors p-6 text-sm text-gray-400">
        No trades logged yet.
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl shadow-lg shadow-black/40 hover:border-accent/30 transition-colors p-6">
      <h3 className="text-sm font-semibold mb-4 text-gray-300">Recent Trades</h3>
      <div className="space-y-2 max-h-80 overflow-y-auto">
        {sorted.map((t) => (
          <div
            key={t.id}
            className="flex items-center justify-between border-b border-border pb-2 text-sm gap-3"
          >
            <div className="flex-1 min-w-0">
              <span className="text-gray-400">{t.date}</span>{" "}
              <span className="text-gray-500">{t.time}</span>
              {t.notes && <span className="text-gray-500 ml-2">— {t.notes}</span>}
            </div>

            {editingId === t.id ? (
              <>
                <input
                  type="number"
                  step="0.01"
                  value={editPnl}
                  onChange={(e) => setEditPnl(e.target.value)}
                  className="bg-bgdark border border-border rounded px-2 py-1 text-sm w-24"
                  autoFocus
                />
                <button
                  onClick={() => saveEdit(t)}
                  className="text-xs text-green hover:underline"
                >
                  Save
                </button>
                <button
                  onClick={() => setEditingId(null)}
                  className="text-xs text-gray-400 hover:underline"
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <span className={t.pnl >= 0 ? "text-green font-semibold" : "text-red font-semibold"}>
                  {formatMoney(t.pnl)}
                </span>
                <button
                  onClick={() => startEdit(t)}
                  className="text-xs text-gray-400 hover:text-white"
                >
                  Edit
                </button>
                <button
                  onClick={() => onDelete(t.id)}
                  className="text-xs text-red hover:underline"
                >
                  Delete
                </button>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}