import type { SetupRecord } from "./types";

export function checkSetupOutcome(setup: SetupRecord, currentPrice: number): "win" | "loss" | null {
  if (setup.stopLoss === undefined || setup.tp1 === undefined) return null;

  if (setup.direction === "buy") {
    if (currentPrice >= setup.tp1) return "win";
    if (currentPrice <= setup.stopLoss) return "loss";
  } else {
    if (currentPrice <= setup.tp1) return "win";
    if (currentPrice >= setup.stopLoss) return "loss";
  }
  return null;
}