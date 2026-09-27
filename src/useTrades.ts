import { useState, useEffect } from "react";
import type { Trade } from "./types";
import {
  loadTrades,
  addTrade as addTradeToStorage,
  deleteTrade as deleteTradeFromStorage,
  updateTrade as updateTradeInStorage,
} from "./storage";

export function useTrades() {
  const [trades, setTrades] = useState<Trade[]>([]);

  useEffect(() => {
    setTrades(loadTrades());
  }, []);

  function addTrade(trade: Trade) {
    setTrades(addTradeToStorage(trade));
  }

  function deleteTrade(tradeId: string) {
    setTrades(deleteTradeFromStorage(tradeId));
  }

  function updateTrade(trade: Trade) {
    setTrades(updateTradeInStorage(trade));
  }

  return { trades, addTrade, deleteTrade, updateTrade };
}