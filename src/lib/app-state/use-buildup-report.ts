import { useMemo } from "react";

import { usePlanning } from "@/lib/app-state/planning-store";
import { buildProductionBuildupReport } from "@/reports";
import type { ProductionBuildupReport } from "@/reports/types";

/**
 * Builds the Production Buildup Plan report dataset from the current engine
 * result. Memoised on the engine result id so nothing is recalculated while
 * the user browses tabs.
 */
export function useBuildupReport(): ProductionBuildupReport | null {
  const { result, imported, calendar, lineSettings, smvMaster, period } = usePlanning();

  return useMemo(() => {
    if (!result) return null;
    return buildProductionBuildupReport({
      result,
      imported,
      calendar,
      lineSettings,
      smvMaster,
      period,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result?.audit.resultId, imported, calendar, lineSettings, smvMaster, period.from, period.to]);
}
