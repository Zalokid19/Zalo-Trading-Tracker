import { useEffect, useState } from "react";
import { fetchMT5Account, type MT5Account } from "../mt5Api";

export default function MT5LiveCard() {
  const [account, setAccount] = useState<MT5Account | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      const data = await fetchMT5Account();
      if (!cancelled) {
        setAccount(data);
        setChecked(true);
      }
    }
    poll();
    const interval = setInterval(poll, 15000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (!checked) return null; // avoid a flash of "not connected" before the first check

  if (!account) {
    return (
      <div className="bg-card border border-border rounded-xl p-4 text-sm text-gray-500">
        MT5 bridge not reachable — start <code className="text-gray-400">bridge.py</code> with MT5 open to see your live demo account here.
      </div>
    );
  }

  const profitColor = account.profit >= 0 ? "text-green" : "text-red";

  return (
    <div className="bg-gradient-to-b from-card to-cardhover border border-teal/30 rounded-xl p-5 shadow-lg shadow-black/40">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-teal uppercase tracking-widest font-bold">MT5 Live Demo Account</p>
        <span className="text-[10px] bg-teal/15 text-teal rounded-full px-2 py-0.5">● Connected</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div>
          <p className="text-xs text-gray-400">Balance</p>
          <p className="text-lg font-bold">{account.currency} {account.balance.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400">Equity</p>
          <p className="text-lg font-bold">{account.currency} {account.equity.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400">Margin Used</p>
          <p className="text-lg font-bold">{account.currency} {account.margin.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400">Floating P/L</p>
          <p className={`text-lg font-bold ${profitColor}`}>{account.currency} {account.profit.toFixed(2)}</p>
        </div>
      </div>
    </div>
  );
}