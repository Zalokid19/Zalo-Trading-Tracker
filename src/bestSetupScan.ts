import { fetchXauCandles, combineCandles } from "./xauApi";
import { analyzeXau, checkSRConfluence, type AutoDetection } from "./xauAnalysis";
import { criteria } from "./setupCriteria";
import { calculateTradeLevels, type TradeLevels } from "./tradeLevels";

function scoreOf(detection: AutoDetection, srConfluence: boolean) {
  const checked: Record<string, boolean> = {
    liquiditySweep: detection.liquiditySweep.detected,
    displacement: detection.displacement.detected,
    mss: detection.mss.detected,
    fvg: detection.fvg.detected,
    entry: detection.entry.detected,
    orderBlock: detection.orderBlock.detected,
    srConfluence,
  };
  const score = criteria.reduce((sum, c) => sum + (checked[c.id] ? c.weight : 0), 0);
  return score;
}

export interface BestSetup {
  strategy: "intraday" | "swing";
  direction: "buy" | "sell";
  score: number;
  levels: TradeLevels | null;
}

export async function getBestSetup(): Promise<BestSetup> {
  const [oneMin, fiveMin, fifteenMin, thirtyMin, oneH, fourH, oneDay] = await Promise.all([
    fetchXauCandles("1min", 60),
    fetchXauCandles("5min", 30),
    fetchXauCandles("15min", 30),
    fetchXauCandles("30min", 30),
    fetchXauCandles("1h", 30),
    fetchXauCandles("4h", 30),
    fetchXauCandles("1day", 30),
  ]);
  const threeMin = combineCandles(oneMin, 3);

  const intradayBuy = analyzeXau(oneMin, threeMin, fiveMin, fiveMin, "buy");
  const intradaySell = analyzeXau(oneMin, threeMin, fiveMin, fiveMin, "sell");
  const swingBuy = analyzeXau(fifteenMin, thirtyMin, oneH, fourH, "buy");
  const swingSell = analyzeXau(fifteenMin, thirtyMin, oneH, fourH, "sell");

  const combos = [
    { strategy: "intraday" as const, direction: "buy" as const, candles: oneMin, score: scoreOf(intradayBuy, checkSRConfluence(oneMin, intradayBuy, "buy").atZone), detection: intradayBuy },
    { strategy: "intraday" as const, direction: "sell" as const, candles: oneMin, score: scoreOf(intradaySell, checkSRConfluence(oneMin, intradaySell, "sell").atZone), detection: intradaySell },
    { strategy: "swing" as const, direction: "buy" as const, candles: oneDay, score: scoreOf(swingBuy, checkSRConfluence(oneDay, swingBuy, "buy").atZone), detection: swingBuy },
    { strategy: "swing" as const, direction: "sell" as const, candles: oneDay, score: scoreOf(swingSell, checkSRConfluence(oneDay, swingSell, "sell").atZone), detection: swingSell },
  ];

  const best = combos.reduce((a, b) => (b.score > a.score ? b : a));
  const levels = calculateTradeLevels(best.candles, best.direction, best.strategy, best.detection);

  return { strategy: best.strategy, direction: best.direction, score: best.score, levels };
}