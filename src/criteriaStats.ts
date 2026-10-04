import type { SetupRecord } from "./types";
import { criteria } from "./setupCriteria";

export interface CriterionStat {
  id: string;
  label: string;
  timesTaken: number;
  winRate: number | null;
}

export function getCriteriaStats(setups: SetupRecord[]): CriterionStat[] {
  const completed = setups.filter((s) => s.outcome !== "pending");

  return criteria.map((c) => {
    const withCriterion = completed.filter((s) => (s.checkedCriteria ?? []).includes(c.id));
    const wins = withCriterion.filter((s) => s.outcome === "win").length;
    return {
      id: c.id,
      label: c.label,
      timesTaken: withCriterion.length,
      winRate: withCriterion.length > 0 ? Math.round((wins / withCriterion.length) * 100) : null,
    };
  });
}