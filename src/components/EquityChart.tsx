import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import type { Account, Trade } from "../types";

interface Props {
  account: Account;
  trades: Trade[];
}

export default function EquityChart({ account, trades }: Props) {
  const accountTrades = [...trades]
    .filter((t) => t.accountId === account.id)
    .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));

  let running = account.startingBalance;
  const data = [
    { label: "Start", balance: running },
    ...accountTrades.map((t) => {
      running += t.pnl;
      return { label: `${t.date} ${t.time}`, balance: Math.round(running * 100) / 100 };
    }),
  ];

  return (
    <div className="bg-card border border-border rounded-xl shadow-lg shadow-black/40 hover:border-accent/30 transition-colors p-6">
      <h3 className="text-sm font-semibold mb-4 text-gray-300">{account.name} — Equity Curve</h3>
        {accountTrades.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 border border-dashed border-border rounded-lg">
            <p className="text-2xl mb-2">📈</p>
            <p className="text-sm text-gray-500">Log a trade to see your equity curve</p>
          </div>
        ) : (
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={data}>
            <CartesianGrid stroke="#1f1f2b" strokeDasharray="3 3" />
            <XAxis dataKey="label" hide />
            <YAxis
              stroke="#888"
              tick={{ fontSize: 11 }}
              domain={["auto", "auto"]}
            />
            <Tooltip
              contentStyle={{ background: "#12121a", border: "1px solid #1f1f2b", fontSize: 12 }}
              labelStyle={{ color: "#888" }}
            />
            <Line
              type="monotone"
              dataKey="balance"
              stroke="#1fd8a4"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}