// lib/splitService.ts

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  SplitCounts,
  SplitRecord,
  SplitValidationResult,
} from "@/types";
import { getSplitCounts, validateSplitChange } from "@/lib/splitRules";

export interface ApplySplitChangeInput {
  supabase: SupabaseClient;
  splitId: string;
  newCounts: SplitCounts;
}

export interface ApplySplitChangeResult {
  success: boolean;
  validation: SplitValidationResult;
  currentSplit: SplitRecord;
  prevSplit: SplitRecord | null;
  nextSplit: SplitRecord | null;
}

function normalizeCounts(counts: SplitCounts): SplitCounts {
  return {
    actual: Math.max(0, Number(counts.actual) || 0),
    flow: Math.max(0, Number(counts.flow) || 0),
    maintenance: Math.max(0, Number(counts.maintenance) || 0),
  };
}

export async function getSplitById(
  supabase: SupabaseClient,
  splitId: string
): Promise<SplitRecord> {
  const { data, error } = await supabase
    .from("splits")
    .select("*")
    .eq("id", splitId)
    .single();

  if (error || !data) {
    throw new Error("Failed to load split.");
  }

  return data as SplitRecord;
}

export async function getPrevSplit(
  supabase: SupabaseClient,
  currentSplit: SplitRecord
): Promise<SplitRecord | null> {
  const { data, error } = await supabase
    .from("splits")
    .select("*")
    .eq("batch_id", currentSplit.batch_id)
    .eq("split_number", currentSplit.split_number - 1)
    .maybeSingle();

  if (error) {
    throw new Error("Failed to load previous split.");
  }

  return (data as SplitRecord | null) ?? null;
}

export async function getNextSplit(
  supabase: SupabaseClient,
  currentSplit: SplitRecord
): Promise<SplitRecord | null> {
  const { data, error } = await supabase
    .from("splits")
    .select("*")
    .eq("batch_id", currentSplit.batch_id)
    .eq("split_number", currentSplit.split_number + 1)
    .maybeSingle();

  if (error) {
    throw new Error("Failed to load next split.");
  }

  return (data as SplitRecord | null) ?? null;
}

export async function loadSplitNeighbors(
  supabase: SupabaseClient,
  splitId: string
): Promise<{
  currentSplit: SplitRecord;
  prevSplit: SplitRecord | null;
  nextSplit: SplitRecord | null;
}> {
  const currentSplit = await getSplitById(supabase, splitId);
  const [prevSplit, nextSplit] = await Promise.all([
    getPrevSplit(supabase, currentSplit),
    getNextSplit(supabase, currentSplit),
  ]);

  return { currentSplit, prevSplit, nextSplit };
}

export async function previewSplitChange(params: {
  supabase: SupabaseClient;
  splitId: string;
  newCounts: SplitCounts;
}): Promise<{
  validation: SplitValidationResult;
  currentSplit: SplitRecord;
  prevSplit: SplitRecord | null;
  nextSplit: SplitRecord | null;
}> {
  const { supabase, splitId } = params;
  const newCounts = normalizeCounts(params.newCounts);

  const { currentSplit, prevSplit, nextSplit } = await loadSplitNeighbors(
    supabase,
    splitId
  );

  const validation = validateSplitChange({
    currentSplit,
    newCurrentCounts: newCounts,
    prevSplit,
    nextSplit,
  });

  return {
    validation,
    currentSplit,
    prevSplit,
    nextSplit,
  };
}

/**
 * Applies the split change and updates the previous split's maintenance count
 * if needed by the rules engine.
 *
 * Best-effort rollback is included, but this is not a true DB transaction.
 */
export async function applySplitChange(
  params: ApplySplitChangeInput
): Promise<ApplySplitChangeResult> {
  const { supabase, splitId } = params;
  const newCounts = normalizeCounts(params.newCounts);

  const { validation, currentSplit, prevSplit, nextSplit } =
    await previewSplitChange({
      supabase,
      splitId,
      newCounts,
    });

  if (!validation.allowed) {
    throw new Error(validation.error || "This split change is not allowed.");
  }

  const originalCurrentCounts = getSplitCounts(currentSplit);
  const originalPrevMaintenance = prevSplit?.maintenance_plate_count ?? null;

  const requiredPrevMaintenance = validation.requiredPrevMaintenance;

  try {
    // 1. Update previous split maintenance if needed
    if (
      prevSplit &&
      prevSplit.maintenance_plate_count !== requiredPrevMaintenance
    ) {
      const { error: prevUpdateError } = await supabase
        .from("splits")
        .update({
          maintenance_plate_count: requiredPrevMaintenance,
        })
        .eq("id", prevSplit.id);

      if (prevUpdateError) {
        throw new Error(
          "Failed to update maintenance plates in the previous split."
        );
      }
    }

    // 2. Update current split counts
    const { error: currentUpdateError } = await supabase
      .from("splits")
      .update({
        actual_plate_count: newCounts.actual,
        flow_plate_count: newCounts.flow,
        maintenance_plate_count: newCounts.maintenance,
      })
      .eq("id", currentSplit.id);

    if (currentUpdateError) {
      throw new Error("Failed to update the current split.");
    }

    // 3. Re-read current row after update
    const refreshedCurrent = await getSplitById(supabase, currentSplit.id);

    return {
      success: true,
      validation,
      currentSplit: refreshedCurrent,
      prevSplit,
      nextSplit,
    };
  } catch (err) {
    // Best-effort rollback
    try {
      await supabase
        .from("splits")
        .update({
          actual_plate_count: originalCurrentCounts.actual,
          flow_plate_count: originalCurrentCounts.flow,
          maintenance_plate_count: originalCurrentCounts.maintenance,
        })
        .eq("id", currentSplit.id);

      if (prevSplit && originalPrevMaintenance !== null) {
        await supabase
          .from("splits")
          .update({
            maintenance_plate_count: originalPrevMaintenance,
          })
          .eq("id", prevSplit.id);
      }
    } catch {
      // swallow rollback error; original error is more useful
    }

    throw err instanceof Error
      ? err
      : new Error("Failed to apply split change.");
  }
}