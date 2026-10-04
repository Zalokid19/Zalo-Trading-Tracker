import { useEffect, useState } from "react";
import type { Account } from "./types";
import { useAccounts } from "./useAccounts";
import { useTrades } from "./useTrades";
import { requestNotificationPermission, checkLossLimits } from "./notifications";
import Sidebar from "./components/Sidebar";
import AccountCard from "./components/AccountCard";
import EquityChart from "./components/EquityChart";
import WeekdayChart from "./components/WeekdayChart";
import TradeForm from "./components/TradeForm";
import TradeList from "./components/TradeList";
import SettingsModal from "./components/SettingsModal";
import SetupScorer from "./components/SetupScorer";
import MT5LiveCard from "./components/MT5LiveCard";

function App() {
  const { accounts, updateAccount } = useAccounts();
  const { trades, addTrade, deleteTrade, updateTrade } = useTrades();
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [view, setView] = useState<"dashboard" | "scorer">("dashboard");

  useEffect(() => {
    requestNotificationPermission();
  }, []);

  useEffect(() => {
    accounts.forEach((account) => checkLossLimits(account, trades));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trades, accounts]);

  return (
    <div className="min-h-screen bg-bgdark text-white flex flex-col md:flex-row relative">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/3 w-[600px] h-[600px] bg-accent/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-green/5 rounded-full blur-[120px]" />
      </div>

      <Sidebar active={view} onNavigate={setView} />

      <main className="flex-1 min-w-0 p-4 md:p-6 relative z-10">
        {view === "scorer" ? (
          <SetupScorer accounts={accounts} />
        ) : (
          <>
          <div className="mb-8 relative">
            <div className="absolute -top-8 -left-4 w-72 h-72 bg-teal/10 rounded-full blur-[100px] pointer-events-none" />
            <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-accent via-white to-teal bg-clip-text text-transparent relative">
              Zalo Trading Dashboard
            </h1>
            <p className="text-sm text-gray-500 mt-1 relative">XAU/USD · Funded & Personal Accounts</p>
          </div>

          <div className="mb-6">
          <MT5LiveCard />
          </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
              {accounts.map((account) => (
                <AccountCard
                  key={account.id}
                  account={account}
                  trades={trades}
                  onEdit={() => setEditingAccount(account)}
                />
              ))}
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
              {accounts.map((account) => (
                <EquityChart key={account.id} account={account} trades={trades} />
              ))}
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
              {accounts.map((account) => (
                <WeekdayChart key={account.id} account={account} trades={trades} />
              ))}
            </div>

            <div className="mb-6">
              <TradeForm accounts={accounts} onAddTrade={addTrade} />
            </div>

            <TradeList trades={trades} onDelete={deleteTrade} onUpdate={updateTrade} />
          </>
        )}
      </main>

      {editingAccount && (
        <SettingsModal
          account={editingAccount}
          onSave={updateAccount}
          onClose={() => setEditingAccount(null)}
        />
      )}
    </div>
  );
}

export default App;