import { useEffect, useState } from "react";
import type { Account } from "./types";
import { useAccounts } from "./useAccounts";
import { useTrades } from "./useTrades";
import { requestNotificationPermission, checkLossLimits } from "./notifications";
import AccountCard from "./components/AccountCard";
import EquityChart from "./components/EquityChart";
import TradeForm from "./components/TradeForm";
import TradeList from "./components/TradeList";
import SettingsModal from "./components/SettingsModal";
import WeekdayChart from "./components/WeekdayChart";
import Sidebar from "./components/Sidebar";
import SetupScorer from "./components/SetupScorer";

function App() {
  const [view, setView] = useState<"dashboard" | "scorer">("dashboard");
  const { accounts, updateAccount } = useAccounts();
  const { trades, addTrade, deleteTrade, updateTrade } = useTrades();
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);

  useEffect(() => {
    requestNotificationPermission();
  }, []);

  useEffect(() => {
    accounts.forEach((account) => checkLossLimits(account, trades));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trades, accounts]);

      return (
        <div className="min-h-screen bg-bgdark text-white flex">
          <Sidebar active={view} onNavigate={setView} />
          <div className="flex-1 p-6">
          {view === "scorer" ? (
            <SetupScorer accounts={accounts} />
          ) : (
          <>
          <div className="mb-8">
            <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
              Zalo Trading Dashboard
            </h1>
            <p className="text-sm text-gray-500 mt-1">XAU/USD · Funded & Personal Accounts</p>
          </div>

        <div className="grid md:grid-cols-2 gap-6 mb-6">
          {accounts.map((account) => (
            <AccountCard
            key={account.id}
            account={account}
            trades={trades}
            onEdit={() => setEditingAccount(account)}
          />
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6 mb-6">
        {accounts.map((account) => (
          <EquityChart key={account.id} account={account} trades={trades} />
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6 mb-6">
        {accounts.map((account) => (
          <WeekdayChart key={account.id} account={account} trades={trades} />
        ))}
      </div>

      <div className="mb-6">
        <TradeForm accounts={accounts} onAddTrade={addTrade} />
      </div>

      <TradeList trades={trades} onDelete={deleteTrade} onUpdate={updateTrade} />

      {editingAccount && (
        <SettingsModal
          account={editingAccount}
          onSave={updateAccount}
          onClose={() => setEditingAccount(null)}
        />
      )}
    </>
    )}
    </div>
    </div>
  );
}

export default App;