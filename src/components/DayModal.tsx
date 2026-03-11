"use client";
/**
 * components/DayModal.tsx
 * -----------------------
 * Opens when user clicks a calendar day.
 * • Past days: read-only view
 * • Current / future days: full edit (assign, volume, notes, WhatsApp compose)
 */

import { useState } from "react";
import { getHolidayName } from "@/lib/holidays";
import { getColor } from "@/lib/colors";
import type { DutyAssignment, Member } from "@/types";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const WDAYS  = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

interface Props {
  dateKey: string;         // "YYYY-MM-DD"
  duty: DutyAssignment | null;
  members: Member[];
  loggedInMember: Member;
  tomorrowAssigneeName: string | null;
  onClose: () => void;
  onSave: (dateKey: string, patch: Partial<DutyAssignment>) => Promise<void>;
  onRemoveAssignment: (dateKey: string) => Promise<void>;
}

export default function DayModal({
  dateKey, duty, members, loggedInMember, tomorrowAssigneeName,
  onClose, onSave, onRemoveAssignment,
}: Props) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const dateObj = new Date(year, month - 1, day);
  const today   = new Date();
  today.setHours(0, 0, 0, 0);
  const isPast  = dateObj < today;
  const holiday = getHolidayName(year, month - 1, day);
  const dow     = dateObj.getDay();

  const assignedMember = duty?.member_id
    ? members.find(m => m.id === duty.member_id) ?? null
    : null;

  const [selectedMemberId, setSelectedMemberId] = useState<string>(duty?.member_id ?? "");
  const [volumeMl, setVolumeMl]   = useState<string>(duty?.volume_ml != null ? String(duty.volume_ml) : "");
  const [notes, setNotes]         = useState<string>(duty?.notes ?? "");
  const [saving, setSaving]       = useState(false);
  const [whatsappCopied, setWhatsappCopied] = useState(false);

  const activePeople = members.filter(m => m.active);

  async function handleSave() {
  const payload = {
    member_id: selectedMemberId || null,
    volume_ml: volumeMl !== "" ? Number(volumeMl) : null,
    notes,
  };

  console.log("DayModal save payload:", payload);

  setSaving(true);
  await onSave(dateKey, payload);
  setSaving(false);
  onClose();
}

  async function handleRemove() {
    await onRemoveAssignment(dateKey);
    onClose();
  }

  // Build WhatsApp completion message
  const reporterName = members.find(m => m.id === selectedMemberId)?.full_name
    ?? assignedMember?.full_name ?? loggedInMember.full_name;
  const whatsappText = volumeMl
    ? `Today's iPSC medium change was completed by ${reporterName}. Volume changed: ${volumeMl} mL. ` +
      (tomorrowAssigneeName
        ? `Tomorrow's duty: ${tomorrowAssigneeName}.`
        : `Tomorrow's duty: no one is assigned yet.`)
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

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20 }}>
          <div>
            <div style={{ fontFamily:"'DM Serif Display',serif", fontSize:22, color:"#0f172a" }}>
              {WDAYS[dow]}, {day} {MONTHS[month-1]}
            </div>
            {holiday && (
              <span style={holidayBadge}>{holiday}</span>
            )}
            {!holiday && (dow === 5 || dow === 6) && (
              <span style={{ fontSize:11, fontWeight:600, color:"#64748b", textTransform:"uppercase" }}>
                {dow === 5 ? "Friday" : "Saturday"}
              </span>
            )}
          </div>
          <button onClick={onClose} style={closeBtn}>×</button>
        </div>

        {isPast ? (
          /* ── READ-ONLY ──────────────────────────────────── */
          <div style={{ background:"#f8fafc", borderRadius:12, padding:16 }}>
            <div style={{ fontSize:11, color:"#94a3b8", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:10 }}>
              🔒 Past date — read only
            </div>
            {assignedMember ? (
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                <div style={{
                  background: getColor(assignedMember.color_index).bg,
                  color: getColor(assignedMember.color_index).text,
                  borderRadius:999, padding:"2px 10px", fontSize:13, fontWeight:700,
                }}>
                  {assignedMember.full_name}
                </div>
                <span style={{ color:"#64748b", fontSize:13 }}>was assigned</span>
              </div>
            ) : (
              <p style={{ color:"#cbd5e1", fontSize:14 }}>No one was assigned.</p>
            )}
            {duty?.volume_ml != null && (
              <p style={{ fontSize:14, color:"#0f172a", margin:"4px 0" }}>
                ✓ <strong>{duty.volume_ml} mL</strong> reported
              </p>
            )}
            {duty?.notes && (
              <p style={{ fontSize:12, color:"#64748b", fontStyle:"italic", margin:"4px 0" }}>
                "{duty.notes}"
              </p>
            )}
          </div>
        ) : (
          /* ── EDITABLE ───────────────────────────────────── */
          <>
            {/* Assignee */}
            <div style={{ marginBottom:16 }}>
              <label style={label}>Assigned person</label>
              <select
                value={selectedMemberId}
                onChange={e => setSelectedMemberId(e.target.value)}
                style={select}
              >
                <option value="">— Unassigned —</option>
                {activePeople.map(p => (
                  <option key={p.id} value={p.id}>{p.full_name}</option>
                ))}
              </select>
              <div style={{ display:"flex", gap:8, marginTop:8, flexWrap:"wrap" }}>
                <button
                  style={chipButton}
                  onClick={() => setSelectedMemberId(loggedInMember.id)}
                >
                  Assign me
                </button>
                {selectedMemberId && (
                  <button
                    style={{ ...chipButton, color:"#ef4444", borderColor:"#fca5a5" }}
                    onClick={handleRemove}
                  >
                    Remove assignment
                  </button>
                )}
              </div>
            </div>

            {/* Volume */}
            <div style={{ marginBottom:16 }}>
              <label style={label}>Volume changed (mL)</label>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <input
                  type="number" min="0" step="5"
                  value={volumeMl}
                  onChange={e => setVolumeMl(e.target.value)}
                  placeholder="e.g. 50"
                  style={{ ...input, width:120 }}
                />
                <span style={{ fontSize:13, color:"#94a3b8" }}>mL</span>
              </div>
            </div>

            {/* Notes */}
            <div style={{ marginBottom:18 }}>
              <label style={label}>
                Notes <span style={{ color:"#94a3b8", fontWeight:400, textTransform:"none" }}>(optional)</span>
              </label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Any notes…"
                rows={2}
                style={{ ...input, width:"100%", resize:"vertical" }}
              />
            </div>

            {/* WhatsApp message – appears once volume is entered */}
            {whatsappText && (
              <div style={whatsappBox}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                  <span style={{ fontSize:11, fontWeight:800, color:"#15803d", textTransform:"uppercase", letterSpacing:"0.06em" }}>
                    📱 WhatsApp message
                  </span>
                  <div style={{ display:"flex", gap:6 }}>
                    <button onClick={copyWhatsapp} style={waBtn}>
                      {whatsappCopied ? "✓ Copied!" : "Copy"}
                    </button>
                    <button onClick={openWhatsapp} style={{ ...waBtn, background:"#16a34a", color:"#fff", borderColor:"#16a34a" }}>
                      Open WA ↗
                    </button>
                  </div>
                </div>
                <p style={{ fontSize:12, color:"#166534", lineHeight:1.7, margin:0 }}>
                  {whatsappText}
                </p>
              </div>
            )}

            <button
              onClick={handleSave}
              disabled={saving}
              style={saveBtn}
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const overlay: React.CSSProperties = {
  position:"fixed", inset:0, background:"rgba(10,15,30,0.55)",
  backdropFilter:"blur(4px)", display:"flex", alignItems:"center",
  justifyContent:"center", zIndex:200, padding:16,
};
const modal: React.CSSProperties = {
  background:"#fff", borderRadius:18, padding:28, width:"100%", maxWidth:440,
  boxShadow:"0 24px 64px rgba(0,0,0,0.18)", maxHeight:"90vh", overflowY:"auto",
};
const closeBtn: React.CSSProperties = {
  background:"#f1f5f9", border:"none", borderRadius:8,
  width:32, height:32, fontSize:20, cursor:"pointer", color:"#64748b",
};
const holidayBadge: React.CSSProperties = {
  display:"inline-block", marginTop:4, fontSize:11, fontWeight:700,
  color:"#92400e", background:"#fef3c7", borderRadius:6,
  padding:"2px 8px", letterSpacing:"0.04em",
};
const label: React.CSSProperties = {
  display:"block", fontSize:11, fontWeight:700, color:"#475569",
  textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:6,
};
const input: React.CSSProperties = {
  border:"1.5px solid #e2e8f0", borderRadius:8, padding:"8px 12px",
  fontSize:14, color:"#0f172a", outline:"none", boxSizing:"border-box",
  fontFamily:"inherit",
};
const select: React.CSSProperties = { ...input, width:"100%", background:"#fff", cursor:"pointer" };
const chipButton: React.CSSProperties = {
  padding:"5px 12px", borderRadius:999, border:"1.5px solid #e2e8f0",
  background:"#f8fafc", fontSize:12, fontWeight:600, cursor:"pointer", color:"#475569",
};
const whatsappBox: React.CSSProperties = {
  background:"#f0fdf4", borderRadius:12, padding:14, marginBottom:18,
  border:"1px solid #bbf7d0",
};
const waBtn: React.CSSProperties = {
  padding:"4px 10px", borderRadius:8, border:"1.5px solid #86efac",
  background:"#fff", fontSize:11, fontWeight:700, cursor:"pointer", color:"#15803d",
};
const saveBtn: React.CSSProperties = {
  width:"100%", padding:"13px 0", background:"#0e7490", color:"#fff",
  border:"none", borderRadius:12, fontSize:14, fontWeight:700, cursor:"pointer",
};

