export interface Criterion {
  id: string;
  label: string;
  weight: number;
}

export const criteria: Criterion[] = [
  { id: "liquiditySweep", label: "1. Liquidity Sweep", weight: 15 },
  { id: "displacement", label: "2. Price Displacement", weight: 10 },
  { id: "mss", label: "3-4. Market Structure Shift (1-3min, same direction)", weight: 20 },
  { id: "fvg", label: "5. FVG in the 5min MSS", weight: 15 },
  { id: "entry", label: "6. Entry — 5min MSS retracing into the FVG", weight: 15 },
  { id: "orderBlock", label: "7. Order Block (created after the MSS)", weight: 15 },
  { id: "srConfluence", label: "8. At a real Support/Resistance zone", weight: 10 },
];