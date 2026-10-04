// XAUUSD: 1.00 lot moves $10 per pip (pip = $0.10 price move). Adjust if your broker differs.
export const PIP_VALUE_PER_LOT = 10;

export function calculateLotSize(riskAmount: number, stopDistancePrice: number): number {
  if (stopDistancePrice <= 0) return 0;
  const pips = stopDistancePrice / 0.1;
  const lots = riskAmount / (pips * PIP_VALUE_PER_LOT);
  return Math.round(lots * 100) / 100;
}