import type { Account, Trade } from "../types";
import { getTodayPnl, getTotalPnl, getWinRate, getProfitFactor, getTodayTrades, formatMoney, getDollarLimit } from "../utils";
import { isChasingLosses } from "../utils";

interface Props {
  account: Account;
  trades: Trade[];
  onEdit: () => void;
}

function LossBar({ label, limit, used }: { label: string; limit: number; used: number }) {
  const pct = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
  const left = Math.max(limit - used, 0);
  const barColor = pct >= 100 ? "bg-red" : pct >= 80 ? "bg-accent" : "bg-green";
  const borderColor = pct >= 100 ? "border-l-red" : pct >= 80 ? "border-l-accent" : "border-l-green";

  return (
    <div className={`bg-card border border-border ${borderColor} border-l-4 rounded-xl p-5 flex-1`}>
      <div className="flex justify-between items-start mb-3">
        <span className="text-xs text-gray-400 font-medium">{label}</span>
        <span className="text-xs bg-bgdark border border-border rounded px-2 py-1 text-gray-300">
          {formatMoney(limit)}
        </span>
      </div>
      <p className="text-3xl font-extrabold mb-3 tracking-tight">
        {formatMoney(left)} <span className="text-sm font-normal text-gray-400">left</span>
      </p>
      <div className="w-full h-2 bg-bgdark rounded-full overflow-hidden">
        <div className={`h-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-gray-500 mt-1 font-medium">{Math.round(pct)}% used</p>
    </div>
  );
}

export default function AccountCard({ account, trades, onEdit }: Props) {
  const todayPnl = getTodayPnl(trades, account.id);
  const totalPnl = getTotalPnl(trades, account.id);
  const todayLoss = todayPnl < 0 ? Math.abs(todayPnl) : 0;
  const totalLoss = totalPnl < 0 ? Math.abs(totalPnl) : 0;
  const winRate = getWinRate(trades, account.id);
  const profitFactor = getProfitFactor(trades, account.id);
  const tradesToday = getTodayTrades(trades, account.id).length;
  const overTradeLimit = tradesToday >= 3;
  const chasingLosses = isChasingLosses(trades, account.id);

  const dailyLossLimit = getDollarLimit(account.startingBalance, account.dailyLossPct);
  const maxLossLimit = getDollarLimit(account.startingBalance, account.maxLossPct);

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold">{account.name}</h2>
          <span className="text-xs bg-green/20 text-green rounded-full px-2.5 py-1 font-semibold">
            ● Active
          </span>
        </div>
        <button
          onClick={onEdit}
          className="text-xs text-gray-300 hover:text-white hover:border-accent border border-border rounded px-3 py-1.5 transition-colors"
        >
          Credentials
        </button>
        {overTradeLimit && (
          <p className="text-xs text-red font-semibold mt-2">⚠ 3 trades hit today — you said stop here.</p>
        )}
        {chasingLosses && (
          <p className="text-xs text-red font-semibold mt-2">⚠ Two losses in a row — don't chase, step back.</p>
        )}
      </div>

      <p className="text-xs text-accent uppercase tracking-widest font-bold mb-2">
        Trading Objectives
      </p>
      <div className="flex gap-4 mb-4">
        <LossBar
          label={`Daily Loss Level (${account.dailyLossPct}%)`}
          limit={dailyLossLimit}
          used={todayLoss}
        />
        <LossBar
          label={`Max Drawdown Level (${account.maxLossPct}%)`}
          limit={maxLossLimit}
          used={totalLoss}
        />
      </div>

      <div className="grid grid-cols-4 gap-4 bg-card border border-border rounded-xl shadow-lg shadow-black/40 hover:border-accent/30 transition-colors p-5">
        <div>
          <p className="text-xs text-gray-400 mb-1">Balance</p>
          <p className="text-xl font-bold">{formatMoney(account.balance + totalPnl)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400 mb-1">Total P/L</p>
          <p className={`text-xl font-bold ${totalPnl >= 0 ? "text-green" : "text-red"}`}>
            {formatMoney(totalPnl)}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-400 mb-1">Win Rate</p>
          <p className="text-xl font-bold">{winRate}%</p>
        </div>
        <div>
          <p className="text-xs text-gray-400 mb-1">Profit Factor</p>
          <p className="text-xl font-bold">{profitFactor}</p>
        </div>
      </div>
      <p className="text-xs text-gray-500 mt-2">Trades Today: {tradesToday}</p>
    </div>
  );
}