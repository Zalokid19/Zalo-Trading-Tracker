import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import type { Account, Trade } from "../types";
import { getWeekdayDistribution } from "../utils";

interface Props {
  account: Account;
  trades: Trade[];
}

export default function WeekdayChart({ account, trades }: Props) {
  const data = getWeekdayDistribution(trades, account.id);
  const hasTrades = data.some((d) => d.wins > 0 || d.losses > 0);

  return (
    <div className="bg-card border border-border rounded-xl shadow-lg shadow-black/40 hover:border-accent/30 transition-colors p-6">
      <h3 className="text-sm font-semibold mb-4 text-gray-300">
        {account.name} — Weekly Trade Distribution
      </h3>
        {!hasTrades ? (
          <div className="flex flex-col items-center justify-center py-10 border border-dashed border-border rounded-lg">
            <p className="text-2xl mb-2">📊</p>
            <p className="text-sm text-gray-500">Log a few trades to see your weekday breakdown</p>
          </div>
        ) : (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data}>
            <CartesianGrid stroke="#1f1f2b" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="day" stroke="#888" tick={{ fontSize: 11 }} />
            <YAxis stroke="#888" tick={{ fontSize: 11 }} allowDecimals={false} />
            <Tooltip
              contentStyle={{ background: "#12121a", border: "1px solid #1f1f2b", fontSize: 12 }}
              labelStyle={{ color: "#888" }}
            />
            <Bar dataKey="wins" fill="#1fd8a4" radius={[4, 4, 0, 0]} />
            <Bar dataKey="losses" fill="#f0466e" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}