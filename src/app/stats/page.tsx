"use client";
/**
 * app/stats/page.tsx
 * ------------------
 * Monthly duty statistics per member.
 * Medium duties are counted separately from split duties.
 * Weekdays vs Fri/Sat/Holiday apply to medium duties.
 * Includes CSV export.
 */

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import { getDayCategory } from "@/lib/holidays";
import { getColor } from "@/lib/colors";
import type { DutyAssignment, Member, MemberStats } from "@/types";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function StatsPage() {
  const supabase = createClient();
  const now = new Date();

  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [duties, setDuties] = useState<DutyAssignment[]>([]);
  const [members, setMembers] = useState<Member[]>([]);

  useEffect(() => {
    supabase
      .from("members")
      .select("*")
      .then(({ data }) => {
        if (data) setMembers(data as Member[]);
      });
  }, [supabase]);

  useEffect(() => {
    const from = `${year}-${String(month + 1).padStart(2, "0")}-01`;
    const days = new Date(year, month + 1, 0).getDate();
    const to = `${year}-${String(month + 1).padStart(2, "0")}-${String(days).padStart(2, "0")}`;

    supabase
      .from("duty_assignments")
      .select("*")
      .gte("duty_date", from)
      .lte("duty_date", to)
      .then(({ data }) => {
        if (data) setDuties(data as DutyAssignment[]);
      });
  }, [year, month, supabase]);

  // Build stats
  const stats: MemberStats[] = (() => {
    const map: Record<string, MemberStats> = {};

    members.forEach((m) => {
      map[m.id] = {
        member: m,

        medium_weekdays: 0,
        medium_weekend_holiday: 0,
        medium_total: 0,

        split_assigned_total: 0,
        split_completed_total: 0,
        split_plates_total: 0,
      };
    });

    duties.forEach((d) => {
      // Medium stats
      if (d.member_id) {
        const s = map[d.member_id];
        if (s) {
          const [y, mo, da] = d.duty_date.split("-").map(Number);
          const cat = getDayCategory(y, mo - 1, da);

          if (cat === "weekday") s.medium_weekdays++;
          else s.medium_weekend_holiday++;

          s.medium_total++;
        }
      }

      // Split stats
      if (d.split_assignee_id) {
        const s = map[d.split_assignee_id];
        if (s) {
          s.split_assigned_total++;

          if (d.split_completed) {
            s.split_completed_total++;
          }

          if (d.split_plate_count != null) {
            s.split_plates_total += d.split_plate_count;
          }
        }
      }
    });

    return Object.values(map)
      .filter(
        (s) =>
          s.medium_total > 0 ||
          s.split_assigned_total > 0 ||
          s.split_completed_total > 0 ||
          s.split_plates_total > 0
      )
      .sort((a, b) => {
        const aScore = a.medium_total + a.split_assigned_total;
        const bScore = b.medium_total + b.split_assigned_total;
        return bScore - aScore;
      });
  })();

  const splitStats = stats.filter((s) => s.split_assigned_total > 0);

  const maxMediumTotal = Math.max(...stats.map((s) => s.medium_total), 1);
  const maxSplitAssigned = Math.max(...splitStats.map((s) => s.split_assigned_total), 1);

  function exportCSV() {
    const header = [
      "date",
      "medium_assignee_name",
      "medium_assignee_email",
      "volume_ml",
      "notes",
      "medium_completed",
      "day_type",
      "split_assignee_name",
      "split_assignee_email",
      "split_passage_number",
      "split_plate_count",
      "split_completed",
    ];

    const rows = duties.map((d) => {
      const mediumMember = members.find((m) => m.id === d.member_id);
      const splitMember = members.find((m) => m.id === d.split_assignee_id);

      const [y, mo, da] = d.duty_date.split("-").map(Number);
      const cat = getDayCategory(y, mo - 1, da);

      return [
        d.duty_date,
        mediumMember?.full_name ?? "",
        mediumMember?.email ?? "",
        d.volume_ml ?? "",
        `"${(d.notes ?? "").replace(/"/g, "\"\"")}"`,
        d.volume_ml != null ? "yes" : "no",
        cat,
        splitMember?.full_name ?? "",
        splitMember?.email ?? "",
        d.split_passage_number ?? "",
        d.split_plate_count ?? "",
        d.split_completed ? "yes" : "no",
      ].join(",");
    });

    const csv = [header.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `duties-${year}-${String(month + 1).padStart(2, "0")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function changeMonth(dir: -1 | 1) {
    const d = new Date(year, month + dir, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  }

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 20,
        }}
      >
        <h2 style={h2}>Statistics</h2>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button style={navBtn} onClick={() => changeMonth(-1)}>‹</button>
          <span style={{ fontSize: 14, fontWeight: 600, minWidth: 130, textAlign: "center" }}>
            {MONTHS[month]} {year}
          </span>
          <button style={navBtn} onClick={() => changeMonth(1)}>›</button>
        </div>
      </div>

      {/* Medium duties bar chart */}
      <div style={card}>
        <div style={sectionLabel}>Medium duties this month</div>
        {stats.length === 0 ? (
          <p style={{ color: "#94a3b8", fontSize: 13 }}>No assignments recorded yet.</p>
        ) : (
          stats.map((s) => {
            const c = getColor(s.member.color_index);
            return (
              <div
                key={`medium-${s.member.id}`}
                style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}
              >
                <div
                  style={{
                    width: 88,
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#475569",
                    textAlign: "right",
                    flexShrink: 0,
                  }}
                >
                  {s.member.full_name.split(" ")[0]}
                </div>

                <div
                  style={{
                    flex: 1,
                    background: "#f1f5f9",
                    borderRadius: 999,
                    height: 24,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${(s.medium_total / maxMediumTotal) * 100}%`,
                      height: "100%",
                      background: c.bg,
                      borderRadius: 999,
                      minWidth: s.medium_total > 0 ? 28 : 0,
                      display: "flex",
                      alignItems: "center",
                      paddingLeft: s.medium_total > 0 ? 10 : 0,
                      transition: "width 0.6s ease",
                    }}
                  >
                    {s.medium_total > 0 && (
                      <span style={{ color: "#fff", fontSize: 11, fontWeight: 700 }}>
                        {s.medium_total}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Split duties bar chart */}
      <div style={card}>
        <div style={sectionLabel}>Split duties this month</div>
        {splitStats.length === 0 ? (
          <p style={{ color: "#94a3b8", fontSize: 13 }}>No split assignments recorded yet.</p>
        ) : (
          splitStats.map((s) => {
            const c = getColor(s.member.color_index);
            return (
              <div
                key={`split-${s.member.id}`}
                style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}
              >
                <div
                  style={{
                    width: 88,
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#475569",
                    textAlign: "right",
                    flexShrink: 0,
                  }}
                >
                  {s.member.full_name.split(" ")[0]}
                </div>

                <div
                  style={{
                    flex: 1,
                    background: "#f1f5f9",
                    borderRadius: 999,
                    height: 24,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${(s.split_assigned_total / maxSplitAssigned) * 100}%`,
                      height: "100%",
                      background: c.bg,
                      borderRadius: 999,
                      minWidth: s.split_assigned_total > 0 ? 28 : 0,
                      display: "flex",
                      alignItems: "center",
                      paddingLeft: s.split_assigned_total > 0 ? 10 : 0,
                      transition: "width 0.6s ease",
                    }}
                  >
                    {s.split_assigned_total > 0 && (
                      <span style={{ color: "#fff", fontSize: 11, fontWeight: 700 }}>
                        {s.split_assigned_total}/{s.split_completed_total}
                      </span>
                    )}
                  </div>
                </div>

                <div
                  style={{
                    width: 64,
                    textAlign: "right",
                    fontSize: 11,
                    color: "#64748b",
                    flexShrink: 0,
                  }}
                >
                  {s.split_plates_total} plates
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Stats table */}
      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#f8fafc" }}>
              {[
                "Person",
                "Medium weekdays",
                "Medium Fri / Sat / Holiday",
                "Medium total",
                "Split assigned",
                "Split completed",
                "Split plates",
              ].map((h) => (
                <th key={h} style={th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {stats.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", padding: 20, color: "#94a3b8" }}>
                  No data
                </td>
              </tr>
            )}

            {stats.map((s, i) => {
              const c = getColor(s.member.color_index);

              return (
                <tr
                  key={s.member.id}
                  style={{
                    borderTop: "1px solid #f1f5f9",
                    background: i % 2 === 0 ? "#fff" : "#fafafa",
                  }}
                >
                  <td style={td}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: 999,
                          background: c.bg,
                          flexShrink: 0,
                        }}
                      />
                      {s.member.full_name}
                    </div>
                  </td>

                  <td style={{ ...td, textAlign: "center" }}>{s.medium_weekdays}</td>
                  <td style={{ ...td, textAlign: "center" }}>{s.medium_weekend_holiday}</td>
                  <td style={{ ...td, textAlign: "center", fontWeight: 700 }}>{s.medium_total}</td>
                  <td style={{ ...td, textAlign: "center" }}>{s.split_assigned_total}</td>
                  <td style={{ ...td, textAlign: "center" }}>{s.split_completed_total}</td>
                  <td style={{ ...td, textAlign: "center" }}>{s.split_plates_total}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
        <button onClick={exportCSV} style={exportBtn}>↓ Export CSV</button>
      </div>
    </div>
  );
}

const h2: React.CSSProperties = {
  fontFamily: "'DM Serif Display',serif",
  fontSize: 22,
  fontWeight: 400,
  color: "#0f172a",
  margin: 0,
};

const card: React.CSSProperties = {
  background: "#fff",
  borderRadius: 14,
  border: "1.5px solid #e2e8f0",
  padding: 20,
  marginBottom: 16,
};

const sectionLabel: React.CSSProperties = {
  fontWeight: 700,
  fontSize: 11,
  color: "#64748b",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  marginBottom: 14,
};

const navBtn: React.CSSProperties = {
  background: "#f1f5f9",
  border: "none",
  borderRadius: 8,
  width: 34,
  height: 34,
  fontSize: 18,
  cursor: "pointer",
  color: "#475569",
};

const th: React.CSSProperties = {
  padding: "10px 14px",
  textAlign: "left",
  fontSize: 11,
  fontWeight: 700,
  color: "#64748b",
  textTransform: "uppercase",
  letterSpacing: "0.07em",
};

const td: React.CSSProperties = {
  padding: "11px 14px",
  color: "#0f172a",
};

const exportBtn: React.CSSProperties = {
  padding: "8px 16px",
  borderRadius: 10,
  border: "1.5px solid #e2e8f0",
  background: "#f8fafc",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
  color: "#475569",
};