// src/lib/splitRules.ts

import type {
  SplitCounts,
  SplitRecord,
  SplitValidationInput,
  SplitValidationResult,
} from "@/types";

/**
 * Central split rule configuration
 *
 * PLATES_PER_MAINTENANCE:
 *   Each maintenance plate from the previous split supports up to 5 plates
 *   in the current split.
 */
export const PLATES_PER_MAINTENANCE = 5;
export const BASE_CAPACITY = PLATES_PER_MAINTENANCE;

export function getSplitCounts(split: SplitRecord): SplitCounts {
  return {
    actual: split.actual_plate_count ?? 0,
    flow: split.flow_plate_count ?? 0,
    maintenance: split.maintenance_plate_count ?? 0,
  };
}

export function calcTotal(counts: SplitCounts): number {
  return counts.actual + counts.flow + counts.maintenance;
}

export function calcCapacityLoad(counts: SplitCounts): number {
  return counts.actual + counts.flow;
}

export function getRequiredPrevMaintenance(plateLoad: number): number {
  return Math.max(1, Math.ceil(plateLoad / PLATES_PER_MAINTENANCE));
}

export function getCapacityFromPrev(prevSplit: SplitRecord | null): number {
  if (!prevSplit) return BASE_CAPACITY;
  return getCapacityFromPrevMaintenance(prevSplit.maintenance_plate_count);
}

export function getCapacityFromPrevMaintenance(prevMaintenance: number): number {
  return Math.max(1, prevMaintenance) * PLATES_PER_MAINTENANCE;
}

export function isSplitOpen(split: SplitRecord | null): boolean {
  return !!split && split.status === "open";
}

export function validateSplitChange(
  input: SplitValidationInput
): SplitValidationResult {
  const { currentSplit, newCurrentCounts, prevSplit, prevPrevSplit, nextSplit } = input;

  const newCurrentTotal = calcTotal(newCurrentCounts);
  const newCurrentLoad = calcCapacityLoad(newCurrentCounts);
  const requiredPrevMaintenance = getRequiredPrevMaintenance(newCurrentLoad);
  const resultingCapacity =
    getCapacityFromPrevMaintenance(requiredPrevMaintenance);

  if (newCurrentLoad > resultingCapacity) {
    return {
      allowed: false,
      error: `You cannot register more than ${resultingCapacity} non-maintenance plates for this split.`,
      warning: null,
      newCurrentTotal,
      requiredPrevMaintenance,
      resultingCapacity,
      shouldWarnAboutExtraMaintenance: false,
    };
  }

  if (!prevSplit && newCurrentLoad > BASE_CAPACITY) {
    return {
      allowed: false,
      error: `You cannot exceed ${BASE_CAPACITY} non-maintenance plates because there is no previous split to support more capacity.`,
      warning: null,
      newCurrentTotal,
      requiredPrevMaintenance,
      resultingCapacity,
      shouldWarnAboutExtraMaintenance: false,
    };
  }

  if (prevSplit && newCurrentLoad > getCapacityFromPrev(prevSplit)) {
    if (!isSplitOpen(prevSplit)) {
      return {
        allowed: false,
        error: `You cannot exceed ${getCapacityFromPrev(prevSplit)} non-maintenance plates because the previous split is completed with ${prevSplit.maintenance_plate_count} maintenance plates.`,
        warning: null,
        newCurrentTotal,
        requiredPrevMaintenance,
        resultingCapacity,
        shouldWarnAboutExtraMaintenance: false,
      };
    }
  }

  const currentMaintenance = currentSplit.maintenance_plate_count ?? 0;
  const nextLoad = nextSplit ? calcCapacityLoad(getSplitCounts(nextSplit)) : 0;

  if (
    nextSplit &&
    nextLoad > 0 &&
    getCapacityFromPrevMaintenance(newCurrentCounts.maintenance) < nextLoad &&
    nextLoad > BASE_CAPACITY
  ) {
    return {
      allowed: false,
      error: `You cannot reduce maintenance plates because the next split already relies on ${currentMaintenance} maintenance plates.`,
      warning: null,
      newCurrentTotal,
      requiredPrevMaintenance,
      resultingCapacity,
      shouldWarnAboutExtraMaintenance: false,
    };
  }

  let warning: string | null = null;
  const prevMaintenanceNow = prevSplit?.maintenance_plate_count ?? 1;
  const requiredCapacity = getCapacityFromPrevMaintenance(requiredPrevMaintenance);

  if (requiredPrevMaintenance > prevMaintenanceNow) {
    warning =
      `This action will set the previous split to ${requiredPrevMaintenance} maintenance plates and increase this split's capacity to ${requiredCapacity} non-maintenance plates.`;
  } else if (requiredPrevMaintenance === prevMaintenanceNow && requiredPrevMaintenance > 1) {
    warning = `This split is using ${requiredPrevMaintenance} maintenance plates from the previous split, allowing up to ${requiredCapacity} non-maintenance plates.`;
  } else if (requiredPrevMaintenance < prevMaintenanceNow) {
    warning =
      `Reducing the number of plates will lower the required maintenance plates on the previous split to ${requiredPrevMaintenance}.`;
  }

  return {
    allowed: true,
    error: null,
    warning,
    newCurrentTotal,
    requiredPrevMaintenance,
    resultingCapacity,
    shouldWarnAboutExtraMaintenance: requiredPrevMaintenance > prevMaintenanceNow,
  };
}
