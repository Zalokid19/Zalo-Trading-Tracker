// The only file that sends an order to MT5 (through the local bridge).
import { placeMT5Order } from "./mt5Api";

export interface TradeRequest {
  direction: "buy" | "sell";
  entry: number; // pending LIMIT order goes here (near edge of the FVG)
  stopLoss: number;
  takeProfit: number;
  expiresInMinutes: number; // the bridge cancels the order if it hasn't filled by then
}

export async function executeSetup(req: TradeRequest): Promise<void> {
  let result;
  try {
    // lot = null: the bridge sizes the trade itself from balance, equity and free margin.
    result = await placeMT5Order(req.direction, null, req.stopLoss, req.takeProfit, "zalo-auto", req.entry, req.expiresInMinutes);
  } catch {
    throw new Error("The MT5 bridge isn't reachable. Start the bridge script and make sure MT5 is open.");
  }
  if (result?.status !== "ok") {
    throw new Error(result?.message ?? "MT5 rejected the order.");
  }
}
