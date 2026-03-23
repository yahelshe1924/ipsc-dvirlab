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
  const [whatsappCopied, setWhatsappCopied] = useState(false);
  const [splitWhatsappCopied, setSplitWhatsappCopied] = useState(false);
  const [nextDaySplitAssigneeName, setNextDaySplitAssigneeName] = useState<string | null>(null);

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

  useEffect(() => {
    fetchNextDaySplitAssignee();
  }, [dateKey, members]);

  async function fetchNextDaySplitAssignee() {
    const [year, month, day] = dateKey.split("-").map(Number);
    const currentDate = new Date(year, month - 1, day);
    const nextDate = new Date(currentDate);
    nextDate.setDate(currentDate.getDate() + 1);

    const nextDateKey = [
      nextDate.getFullYear(),
      String(nextDate.getMonth() + 1).padStart(2, "0"),
      String(nextDate.getDate()).padStart(2, "0"),
    ].join("-");

    const { data, error } = await supabase
      .from("duty_assignments")
      .select("split_assignee_id")
      .eq("duty_date", nextDateKey)
      .maybeSingle();

    if (error || !data?.split_assignee_id) {
      setNextDaySplitAssigneeName(null);
      return;
    }

    const splitMember =
      members.find((m) => m.id === data.split_assignee_id) ?? null;

    setNextDaySplitAssigneeName(splitMember?.full_name ?? null);
  }

  async function handleSave() {
    const payload: Partial<DutyAssignment> = {
      member_id: selectedMemberId || null,
      volume_ml: volumeMl !== "" ? Number(volumeMl) : null,
      notes,

      split_assignee_id: hasSplit ? splitAssigneeId || null : null,

      split_passage_number: hasSplit ? duty?.split_passage_number ?? null : null,
      split_plate_count: hasSplit ? duty?.split_plate_count ?? null : null,
      split_completed: hasSplit ? duty?.split_completed ?? false : false,
      split_completed_at: hasSplit ? duty?.split_completed_at ?? null : null,
    };

    setSaving(true);
    await onSave(dateKey, payload);
    setSaving(false);
    onClose();
  }

  async function handleRemove() {
    await onRemoveAssignment(dateKey);
    onClose();
  }

  async function handleSplitComplete() {
  if (!hasSplit || !splitAssigneeId || !splitPassageNumber || !splitPlateCount) return;

  setSaving(true);

  // 1. עדכון duty_assignments (כמו שיש עכשיו)
  await onSave(dateKey, {
    split_assignee_id: splitAssigneeId,
    split_passage_number: Number(splitPassageNumber),
    split_plate_count: Number(splitPlateCount),
    split_completed: true,
    split_completed_at: new Date().toISOString(),
  });

  // 2. עדכון טבלת splits ← זה החלק שחסר!
  await supabase
    .from("splits")
    .update({
      status: "completed",
      performed_date: dateKey,
      completed_at: new Date().toISOString(),
      completed_by_member_id: loggedInMember.id,
      actual_plate_count: Number(splitPlateCount),
    })
    .eq("duty_date", dateKey); // או לפי split_id אם יש לך

  setSaving(false);
}

  const reporterName =
    members.find((m) => m.id === selectedMemberId)?.full_name ??
    assignedMember?.full_name ??
    loggedInMember.full_name;

  const whatsappText = volumeMl
    ? `Today's iPSC medium change was completed by ${reporterName}. Volume changed: ${volumeMl} mL. ` +
      (tomorrowAssigneeName
        ? `Tomorrow's duty: ${tomorrowAssigneeName}.`
        : `Tomorrow's duty: no one is assigned yet.`) +
      (nextDaySplitAssigneeName
        ? ` ${nextDaySplitAssigneeName} will split the cells tomorrow.`
        : ``)
    : null;

  const splitWhatsappText =
    hasSplit && splitPassageNumber && splitPlateCount
      ? `Passage P${splitPassageNumber} was completed for ${splitPlateCount} plates. ` +
        (tomorrowAssigneeName
          ? `Tomorrow's medium-change duty is ${tomorrowAssigneeName}.`
          : `Tomorrow's medium-change duty is not assigned yet.`)
      : null;

  function copyWhatsapp() {
    if (!whatsappText) return;
    navigator.clipboard.writeText(whatsappText);
    setWhatsappCopied(true);
    setTimeout(() => setWhatsappCopied(false), 2500);
  }

  function openWhatsapp() {
    if (!whatsappText) return;
    window.open(`https://wa.me/?text=${encodeURIComponent(whatsappText)}`, "_blank");
  }

  function copySplitWhatsapp() {
    if (!splitWhatsappText) return;
    navigator.clipboard.writeText(splitWhatsappText);
    setSplitWhatsappCopied(true);
    setTimeout(() => setSplitWhatsappCopied(false), 2500);
  }

  function openSplitWhatsapp() {
    if (!splitWhatsappText) return;
    window.open(`https://wa.me/?text=${encodeURIComponent(splitWhatsappText)}`, "_blank");
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: 20,
          }}
        >
          <div>
            <div
              style={{
                fontFamily: "'DM Serif Display',serif",
                fontSize: 22,
                color: "#0f172a",
              }}
            >
              {WDAYS[dow]}, {day} {MONTHS[month - 1]}
            </div>
            {holiday && <span style={holidayBadge}>{holiday}</span>}
            {!holiday && (dow === 5 || dow === 6) && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#64748b",
                  textTransform: "uppercase",
                }}
              >
                {dow === 5 ? "Friday" : "Saturday"}
              </span>
            )}
          </div>
          <button onClick={onClose} style={closeBtn}>
            ×
          </button>
        </div>

        {isPast ? (
          <div style={{ background: "#f8fafc", borderRadius: 12, padding: 16 }}>
            <div
              style={{
                fontSize: 11,
                color: "#94a3b8",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginBottom: 10,
              }}
            >
              Past date — read only
            </div>

            {assignedMember ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                <div
                  style={{
                    background: getColor(assignedMember.color_index).bg,
                    color: getColor(assignedMember.color_index).text,
                    borderRadius: 999,
                    padding: "2px 10px",
                    fontSize: 13,
                    fontWeight: 700,
                  }}
                >
                  {assignedMember.full_name}
                </div>
                <span style={{ color: "#64748b", fontSize: 13 }}>was assigned for medium change</span>
              </div>
            ) : (
              <p style={{ color: "#cbd5e1", fontSize: 14 }}>No one was assigned for medium change.</p>
            )}

            {splitAssignedMember && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                <div
                  style={{
                    background: getColor(splitAssignedMember.color_index).bg,
                    color: getColor(splitAssignedMember.color_index).text,
                    borderRadius: 999,
                    padding: "2px 10px",
                    fontSize: 13,
                    fontWeight: 700,
                  }}
                >
                  {splitAssignedMember.full_name}
                </div>
                <span style={{ color: "#64748b", fontSize: 13 }}>
                  was assigned for split
                  {duty?.split_passage_number != null ? ` (P${duty.split_passage_number})` : ""}
                </span>
              </div>
            )}

            {duty?.split_plate_count != null && (
              <p style={{ fontSize: 14, color: "#0f172a", margin: "4px 0" }}>
                Split plates: <strong>{duty.split_plate_count}</strong>
              </p>
            )}

            {duty?.split_completed && (
              <p style={{ fontSize: 14, color: "#0f172a", margin: "4px 0" }}>
                Split completed
              </p>
            )}

            {duty?.volume_ml != null && (
              <p style={{ fontSize: 14, color: "#0f172a", margin: "4px 0" }}>
                <strong>{duty.volume_ml} mL</strong> reported
              </p>
            )}

            {duty?.notes && (
              <p style={{ fontSize: 12, color: "#64748b", fontStyle: "italic", margin: "4px 0" }}>
                "{duty.notes}"
              </p>
            )}
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 16 }}>
              <label style={label}>Assigned person</label>
              <select
                value={selectedMemberId}
                onChange={(e) => setSelectedMemberId(e.target.value)}
                style={select}
              >
                <option value="">— Unassigned —</option>
                {activePeople.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name}
                  </option>
                ))}
              </select>

              <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                <button type="button" style={chipButton} onClick={() => setSelectedMemberId(loggedInMember.id)}>
                  Assign me
                </button>

                {selectedMemberId && (
                  <button
                    type="button"
                    style={{ ...chipButton, color: "#ef4444", borderColor: "#fca5a5" }}
                    onClick={handleRemove}
                  >
                    Remove assignment
                  </button>
                )}
              </div>
            </div>

            <div
              style={{
                marginBottom: 16,
                padding: 14,
                border: "1px solid #e2e8f0",
                borderRadius: 12,
                background: "#f8fafc",
              }}
            >
              <label style={{ ...label, marginBottom: 10 }}>Optional split duty</label>

              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 14,
                  color: "#0f172a",
                  marginBottom: 12,
                }}
              >
                <input
                  type="checkbox"
                  checked={hasSplit}
                  onChange={(e) => setHasSplit(e.target.checked)}
                />
                Add split duty for this day
              </label>

              {hasSplit && (
                <>
                  <div style={{ marginBottom: 12 }}>
                    <label style={label}>Split assignee</label>
                    <select
                      value={splitAssigneeId}
                      onChange={(e) => setSplitAssigneeId(e.target.value)}
                      style={select}
                    >
                      <option value="">— Select split assignee —</option>
                      {activePeople.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.full_name}
                        </option>
                      ))}
                    </select>

                    <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                      <button type="button" style={chipButton} onClick={() => setSplitAssigneeId(loggedInMember.id)}>
                        Assign me to split
                      </button>
                    </div>
                  </div>

                  {splitAssigneeId && (
                    <div
                      style={{
                        marginTop: 16,
                        padding: 12,
                        background: "#fff",
                        borderRadius: 10,
                        border: "1px solid #e2e8f0",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 800,
                          color: "#0e7490",
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                          marginBottom: 10,
                        }}
                      >
                        Split execution
                      </div>

                      <div style={{ marginBottom: 12 }}>
                        <label style={label}>Passage number</label>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={prefixBadge}>P</span>
                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={splitPassageNumber}
                            onChange={(e) => setSplitPassageNumber(e.target.value)}
                            placeholder="e.g. 4"
                            style={{ ...input, width: 120 }}
                          />
                        </div>
                      </div>

                      <div style={{ marginBottom: 12 }}>
                        <label style={label}>Plates count (after split)</label>
                        <input
                          type="number"
                          min="0"
                          value={splitPlateCount}
                          onChange={(e) => setSplitPlateCount(e.target.value)}
                          placeholder="e.g. 6"
                          style={{ ...input, width: 120 }}
                        />
                      </div>

                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button
                          type="button"
                          onClick={handleSplitComplete}
                          style={{
                            ...chipButton,
                            background: "#ecfeff",
                            borderColor: "#67e8f9",
                            color: "#0e7490",
                          }}
                        >
                          Mark split as completed
                        </button>

                        {duty?.split_completed && (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              padding: "5px 12px",
                              borderRadius: 999,
                              background: "#ecfdf5",
                              color: "#166534",
                              fontSize: 12,
                              fontWeight: 700,
                            }}
                          >
                            Completed
                          </span>
                        )}
                      </div>

                      {splitWhatsappText && (
                        <div style={{ ...whatsappBox, marginTop: 12 }}>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              marginBottom: 8,
                            }}
                          >
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 800,
                                color: "#15803d",
                                textTransform: "uppercase",
                                letterSpacing: "0.06em",
                              }}
                            >
                              Split WhatsApp message
                            </span>
                            <div style={{ display: "flex", gap: 6 }}>
                              <button onClick={copySplitWhatsapp} style={waBtn} type="button">
                                {splitWhatsappCopied ? "Copied" : "Copy"}
                              </button>
                              <button
                                onClick={openSplitWhatsapp}
                                type="button"
                                style={{
                                  ...waBtn,
                                  background: "#16a34a",
                                  color: "#fff",
                                  borderColor: "#16a34a",
                                }}
                              >
                                Open WA
                              </button>
                            </div>
                          </div>
                          <p style={{ fontSize: 12, color: "#166534", lineHeight: 1.7, margin: 0 }}>
                            {splitWhatsappText}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={label}>Volume changed (mL)</label>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={volumeMl}
                  onChange={(e) => setVolumeMl(e.target.value)}
                  placeholder="e.g. 50"
                  style={{ ...input, width: 120 }}
                />
                <span style={{ fontSize: 13, color: "#94a3b8" }}>mL</span>
              </div>
            </div>

            <div style={{ marginBottom: 18 }}>
              <label style={label}>
                Notes{" "}
                <span style={{ color: "#94a3b8", fontWeight: 400, textTransform: "none" }}>
                  (optional)
                </span>
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any notes…"
                rows={2}
                style={{ ...input, width: "100%", resize: "vertical" }}
              />
            </div>

            {whatsappText && (
              <div style={whatsappBox}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 8,
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      color: "#15803d",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                    }}
                  >
                    WhatsApp message
                  </span>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={copyWhatsapp} style={waBtn} type="button">
                      {whatsappCopied ? "Copied" : "Copy"}
                    </button>
                    <button
                      onClick={openWhatsapp}
                      type="button"
                      style={{
                        ...waBtn,
                        background: "#16a34a",
                        color: "#fff",
                        borderColor: "#16a34a",
                      }}
                    >
                      Open WA
                    </button>
                  </div>
                </div>
                <p style={{ fontSize: 12, color: "#166534", lineHeight: 1.7, margin: 0 }}>
                  {whatsappText}
                </p>
              </div>
            )}

            <button onClick={handleSave} disabled={saving} style={saveBtn}>
              {saving ? "Saving..." : "Save changes"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

const overlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(10,15,30,0.55)",
  backdropFilter: "blur(4px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 200,
  padding: 16,
};

const modal: React.CSSProperties = {
  background: "#fff",
  borderRadius: 18,
  padding: 28,
  width: "100%",
  maxWidth: 440,
  boxShadow: "0 24px 64px rgba(0,0,0,0.18)",
  maxHeight: "90vh",
  overflowY: "auto",
};

const closeBtn: React.CSSProperties = {
  background: "#f1f5f9",
  border: "none",
  borderRadius: 8,
  width: 32,
  height: 32,
  fontSize: 20,
  cursor: "pointer",
  color: "#64748b",
};

const holidayBadge: React.CSSProperties = {
  display: "inline-block",
  marginTop: 4,
  fontSize: 11,
  fontWeight: 700,
  color: "#92400e",
  background: "#fef3c7",
  borderRadius: 6,
  padding: "2px 8px",
  letterSpacing: "0.04em",
};

const label: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 700,
  color: "#475569",
  textTransform: "uppercase",
  letterSpacing: "0.07em",
  marginBottom: 6,
};

const input: React.CSSProperties = {
  border: "1.5px solid #e2e8f0",
  borderRadius: 8,
  padding: "8px 12px",
  fontSize: 14,
  color: "#0f172a",
  outline: "none",
  boxSizing: "border-box",
  fontFamily: "inherit",
};

const select: React.CSSProperties = {
  ...input,
  width: "100%",
  background: "#fff",
  cursor: "pointer",
};

const chipButton: React.CSSProperties = {
  padding: "5px 12px",
  borderRadius: 999,
  border: "1.5px solid #e2e8f0",
  background: "#f8fafc",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  color: "#475569",
};

const prefixBadge: React.CSSProperties = {
  minWidth: 32,
  height: 36,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  border: "1.5px solid #e2e8f0",
  borderRadius: 8,
  background: "#fff",
  color: "#334155",
  fontSize: 14,
  fontWeight: 700,
};

const whatsappBox: React.CSSProperties = {
  background: "#f0fdf4",
  borderRadius: 12,
  padding: 14,
  marginBottom: 18,
  border: "1px solid #bbf7d0",
};

const waBtn: React.CSSProperties = {
  padding: "4px 10px",
  borderRadius: 8,
  border: "1.5px solid #86efac",
  background: "#fff",
  fontSize: 11,
  fontWeight: 700,
  cursor: "pointer",
  color: "#15803d",
};

const saveBtn: React.CSSProperties = {
  width: "100%",
  padding: "13px 0",
  background: "#0e7490",
  color: "#fff",
  border: "none",
  borderRadius: 12,
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
};