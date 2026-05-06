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
 * BASE_CAPACITY:
 *   Normal maximum number of plates in a split.
 *
 * EXPANDED_CAPACITY:
 *   Maximum number of plates when the previous split has 2 maintenance plates.
 *
 * EXTRA_MAINTENANCE_THRESHOLD:
 *   From this number of plates and above, the previous split must carry
 *   an extra maintenance plate.
 */
export const BASE_CAPACITY = 5;
export const EXPANDED_CAPACITY = 10;
export const EXTRA_MAINTENANCE_THRESHOLD = 6;

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

export function getRequiredPrevMaintenance(total: number): 1 | 2 {
  return total >= EXTRA_MAINTENANCE_THRESHOLD ? 2 : 1;
}

export function getCapacityFromPrev(prevSplit: SplitRecord | null): number {
  if (!prevSplit) return BASE_CAPACITY;
  return prevSplit.maintenance_plate_count === 2
    ? EXPANDED_CAPACITY
    : BASE_CAPACITY;
}

export function getCapacityFromPrevMaintenance(prevMaintenance: number): number {
  return prevMaintenance === 2 ? EXPANDED_CAPACITY : BASE_CAPACITY;
}

export function isSplitOpen(split: SplitRecord | null): boolean {
  return !!split && split.status === "open";
}

export function validateSplitChange(
  input: SplitValidationInput
): SplitValidationResult {
  const { currentSplit, newCurrentCounts, prevSplit, prevPrevSplit, nextSplit } = input;

  const newCurrentTotal = calcTotal(newCurrentCounts);
  const requiredPrevMaintenance = getRequiredPrevMaintenance(newCurrentTotal);
  const resultingCapacity =
    getCapacityFromPrevMaintenance(requiredPrevMaintenance);

  if (newCurrentTotal > resultingCapacity) {
    return {
      allowed: false,
      error: `You cannot register more than ${resultingCapacity} plates for this split.`,
      warning: null,
      newCurrentTotal,
      requiredPrevMaintenance,
      resultingCapacity,
      shouldWarnAboutExtraMaintenance: false,
    };
  }

  if (requiredPrevMaintenance === 2) {
    if (!prevSplit) {
      return {
        allowed: false,
        error: `You cannot exceed ${BASE_CAPACITY} plates because there is no previous split to add a maintenance plate.`,
        warning: null,
        newCurrentTotal,
        requiredPrevMaintenance,
        resultingCapacity,
        shouldWarnAboutExtraMaintenance: false,
      };
    }

    if (!isSplitOpen(prevSplit)) {
      return {
        allowed: false,
        error: `You cannot exceed ${BASE_CAPACITY} plates because the previous split is not open for adding maintenance plates.`,
        warning: null,
        newCurrentTotal,
        requiredPrevMaintenance,
        resultingCapacity,
        shouldWarnAboutExtraMaintenance: false,
      };
    }

    const prevCounts = getSplitCounts(prevSplit);
    const prevTotal = calcTotal(prevCounts);
    const deltaMaintenance = 2 - prevCounts.maintenance;
    const prevCapacity = getCapacityFromPrev(prevPrevSplit);

    if (deltaMaintenance > 0 && prevTotal + deltaMaintenance > prevCapacity) {
      return {
        allowed: false,
        error: `This action is not allowed because adding a maintenance plate to the previous split would exceed its limit of ${prevCapacity} plates.`,
        warning: null,
        newCurrentTotal,
        requiredPrevMaintenance,
        resultingCapacity,
        shouldWarnAboutExtraMaintenance: false,
      };
    }
  }

  const currentMaintenance = currentSplit.maintenance_plate_count ?? 0;
  const nextTotal = nextSplit ? calcTotal(getSplitCounts(nextSplit)) : 0;

  if (
    nextSplit &&
    currentMaintenance === 2 &&
    newCurrentCounts.maintenance < 2 &&
    nextTotal > BASE_CAPACITY
  ) {
    return {
      allowed: false,
      error: `You cannot reduce maintenance plates because the next split already relies on expanded capacity (more than ${BASE_CAPACITY} plates).`,
      warning: null,
      newCurrentTotal,
      requiredPrevMaintenance,
      resultingCapacity,
      shouldWarnAboutExtraMaintenance: false,
    };
  }

  let warning: string | null = null;
  const prevMaintenanceNow = prevSplit?.maintenance_plate_count ?? 1;

  if (
    newCurrentTotal >= EXTRA_MAINTENANCE_THRESHOLD &&
    prevMaintenanceNow < 2
  ) {
    warning =
      `This action will add an extra maintenance plate to the previous split and increase the capacity of this split to ${EXPANDED_CAPACITY} plates.`;
  } else if (
    newCurrentTotal >= EXTRA_MAINTENANCE_THRESHOLD &&
    prevMaintenanceNow === 2
  ) {
    warning = `This split is already using expanded capacity (up to ${EXPANDED_CAPACITY} plates).`;
  } else if (
    newCurrentTotal < EXTRA_MAINTENANCE_THRESHOLD &&
    prevMaintenanceNow === 2
  ) {
    warning =
      `Reducing the number of plates will remove the extra maintenance plate from the previous split and return capacity to ${BASE_CAPACITY}.`;
  }

  return {
    allowed: true,
    error: null,
    warning,
    newCurrentTotal,
    requiredPrevMaintenance,
    resultingCapacity,
    shouldWarnAboutExtraMaintenance: requiredPrevMaintenance === 2,
  };
}
