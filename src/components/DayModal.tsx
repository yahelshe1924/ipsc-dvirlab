"use client";
/**
 * components/DayModal.tsx
 */

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import { getHolidayName } from "@/lib/holidays";
import { getColor } from "@/lib/colors";
import type { DutyAssignment, Member } from "@/types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

interface Props {
  dateKey: string;
  duty: DutyAssignment | null;
  members: Member[];
  loggedInMember: Member;
  tomorrowAssigneeName: string | null;
  onClose: () => void;
  onSave: (dateKey: string, patch: Partial<DutyAssignment>) => Promise<void>;
  onRemoveAssignment: (dateKey: string) => Promise<void>;
}

export default function DayModal({
  dateKey,
  duty,
  members,
  loggedInMember,
  tomorrowAssigneeName,
  onClose,
  onSave,
  onRemoveAssignment,
}: Props) {
  const supabase = createClient();

  const [year, month, day] = dateKey.split("-").map(Number);
  const dateObj = new Date(year, month - 1, day);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isPast = dateObj < today;
  const holiday = getHolidayName(year, month - 1, day);
  const dow = dateObj.getDay();

  const assignedMember = duty?.member_id
    ? members.find((m) => m.id === duty.member_id) ?? null
    : null;

  const splitAssignedMember = duty?.split_assignee_id
    ? members.find((m) => m.id === duty.split_assignee_id) ?? null
    : null;

  const [selectedMemberId, setSelectedMemberId] = useState<string>(duty?.member_id ?? "");
  const [volumeMl, setVolumeMl] = useState<string>(
    duty?.volume_ml != null ? String(duty.volume_ml) : ""
  );
  const [notes, setNotes] = useState<string>(duty?.notes ?? "");

  const [hasSplit, setHasSplit] = useState<boolean>(!!duty?.split_assignee_id);
  const [splitAssigneeId, setSplitAssigneeId] = useState<string>(duty?.split_assignee_id ?? "");
  const [splitPassageNumber, setSplitPassageNumber] = useState<string>(
    duty?.split_passage_number != null ? String(duty.split_passage_number) : ""
  );
  const [splitPlateCount, setSplitPlateCount] = useState<string>(
    duty?.split_plate_count != null ? String(duty.split_plate_count) : ""
  );

  const [saving, setSaving] = useState(false);

  const activePeople = members.filter((m) => m.active);

  useEffect(() => {
    setSelectedMemberId(duty?.member_id ?? "");
    setVolumeMl(duty?.volume_ml != null ? String(duty.volume_ml) : "");
    setNotes(duty?.notes ?? "");

    setHasSplit(!!duty?.split_assignee_id);
    setSplitAssigneeId(duty?.split_assignee_id ?? "");
    setSplitPassageNumber(
      duty?.split_passage_number != null ? String(duty.split_passage_number) : ""
    );
    setSplitPlateCount(
      duty?.split_plate_count != null ? String(duty.split_plate_count) : ""
    );
  }, [duty, dateKey]);

  async function handleSave() {
    const payload: Partial<DutyAssignment> = {
      member_id: selectedMemberId || null,
      volume_ml: volumeMl !== "" ? Number(volumeMl) : null,
      notes,

      split_assignee_id: hasSplit ? splitAssigneeId || null : null,
      split_passage_number:
        hasSplit && splitPassageNumber !== "" ? Number(splitPassageNumber) : null,
      split_plate_count:
        hasSplit && splitPlateCount !== "" ? Number(splitPlateCount) : null,

      split_completed: hasSplit ? duty?.split_completed ?? false : false,
      split_completed_at: hasSplit ? duty?.split_completed_at ?? null : null,
    };

    setSaving(true);
    await onSave(dateKey, payload);
    setSaving(false);
    onClose();
  }

  async function handleSplitComplete() {
    if (!hasSplit || !splitAssigneeId || !splitPassageNumber || !splitPlateCount || !duty?.id) return;

    setSaving(true);

    try {
      const { error } = await supabase.rpc("complete_next_split", {
        p_duty_assignment_id: duty.id,
        p_user_id: loggedInMember.id,
        p_performed_date: dateKey,
        p_actual_plate_count: Number(splitPlateCount),
      });

      if (error) {
        console.error("Error completing split:", error);
        alert("Failed to complete split.");
        return;
      }

      // רענון UI
      await onSave(dateKey, {
        split_completed: true,
        split_completed_at: new Date().toISOString(),
      });

    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      {/* שאר ה-UI שלך נשאר ללא שינוי */}
      <button onClick={handleSplitComplete} disabled={saving}>
        {saving ? "Saving..." : "Mark split as completed"}
      </button>
    </div>
  );
}