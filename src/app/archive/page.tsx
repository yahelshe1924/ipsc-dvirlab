"use client";
/**
 * src/app/archive/page.tsx
 * ------------------------
 * Read-only archive view by month
 */

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase";
import { getHolidayName } from "@/lib/holidays";
import type { DutyAssignment } from "@/types";

type ArchiveRow = DutyAssignment & {
  member_name?: string | null;
  member_email?: string | null;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function ArchivePage() {
  const supabase = createClient();
  const today = new Date();

  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [rows, setRows] = useState<ArchiveRow[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadArchive(y: number, m: number) {
    setLoading(true);

    const from = `${y}-${String(m + 1).padStart(2, "0")}-01`;
    const lastDay = new Date(y, m + 1, 0).getDate();
    const to = `${y}-${String(m + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

    const { data, error } = await supabase
      .from("calendar_feed")
      .select("*")
      .gte("duty_date", from)
      .lte("duty_date", to)
      .order("duty_date", { ascending: true });

    if (error) {
      console.error("Error loading archive:", error);
      setRows([]);
      setLoading(false);
      return;
    }

    setRows((data as ArchiveRow[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadArchive(year, month);
  }, [year, month]);

  function handleMonthChange(dir: -1 | 1) {
    const d = new Date(year, month + dir, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  }

  const monthDays = useMemo(() => {
    const totalDays = new Date(year, month + 1, 0).getDate();

    const byDate = new Map(rows.map((r) => [r.duty_date, r]));

    const result: Array<{
      duty_date: string;
      row: ArchiveRow | null;
      holiday: string | null;
      dayType: "holiday" | "friday_saturday" | "weekday";
      weekdayLabel: string;
    }> = [];

    for (let day = 1; day <= totalDays; day++) {
      const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const dateObj = new Date(year, month, day);
      const dow = dateObj.getDay();
      const holiday = getHolidayName(year, month, day);

      let dayType: "holiday" | "friday_saturday" | "weekday" = "weekday";
      if (holiday) {
        dayType = "holiday";
      } else if (dow === 5 || dow === 6) {
        dayType = "friday_saturday";
      }

      result.push({
        duty_date: key,
        row: byDate.get(key) ?? null,
        holiday,
        dayType,
        weekdayLabel: dateObj.toLocaleDateString("en-US", { weekday: "long" }),
      });
    }

    return result;
  }, [rows, year, month]);

  return (
    <div style={page}>
      <div style={headerRow}>
        <div>
          <h1 style={title}>Archive</h1>
          <p style={subtitle}>Read-only monthly history of assignments, reported volume, and notes.</p>
        </div>

        <div style={monthNav}>
          <button onClick={() => handleMonthChange(-1)} style={navBtn}>
            ←
          </button>

          <div style={monthLabel}>
            {MONTHS[month]} {year}
          </div>

          <button onClick={() => handleMonthChange(1)} style={navBtn}>
            →
          </button>
        </div>
      </div>

      <div style={card}>
        {loading ? (
          <p style={muted}>Loading archive...</p>
        ) : (
          <div style={tableWrap}>
            <table style={table}>
              <thead>
                <tr>
                  <th style={th}>Date</th>
                  <th style={th}>Day</th>
                  <th style={th}>Type</th>
                  <th style={th}>Assigned person</th>
                  <th style={th}>Volume (mL)</th>
                  <th style={th}>Notes</th>
                </tr>
              </thead>
              <tbody>
                {monthDays.map(({ duty_date, row, holiday, dayType, weekdayLabel }) => (
                  <tr key={duty_date} style={tr}>
                    <td style={td}>{duty_date}</td>
                    <td style={td}>{weekdayLabel}</td>
                    <td style={td}>
                      {holiday ? (
                        <span style={holidayBadge}>{holiday}</span>
                      ) : dayType === "friday_saturday" ? (
                        <span style={weekendBadge}>Friday / Saturday</span>
                      ) : (
                        <span style={weekdayBadge}>Weekday</span>
                      )}
                    </td>
                    <td style={td}>
                      {row?.member_name ? (
                        <span>{row.member_name}</span>
                      ) : (
                        <span style={muted}>Unassigned</span>
                      )}
                    </td>
                    <td style={td}>
                      {row?.volume_ml != null ? (
                        <strong>{row.volume_ml}</strong>
                      ) : (
                        <span style={muted}>—</span>
                      )}
                    </td>
                    <td style={td}>
                      {row?.notes ? row.notes : <span style={muted}>—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const page: React.CSSProperties = {
  padding: 32,
};

const headerRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 16,
  flexWrap: "wrap",
  marginBottom: 24,
};

const title: React.CSSProperties = {
  margin: 0,
  fontSize: 32,
  color: "#0f172a",
};

const subtitle: React.CSSProperties = {
  marginTop: 8,
  color: "#64748b",
  fontSize: 14,
};

const card: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e2e8f0",
  borderRadius: 16,
  padding: 20,
  boxShadow: "0 8px 24px rgba(15,23,42,0.04)",
};

const monthNav: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
};

const navBtn: React.CSSProperties = {
  width: 38,
  height: 38,
  borderRadius: 10,
  border: "1px solid #e2e8f0",
  background: "#fff",
  cursor: "pointer",
  fontSize: 18,
};

const monthLabel: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 700,
  color: "#0f172a",
  minWidth: 120,
  textAlign: "center",
};

const tableWrap: React.CSSProperties = {
  width: "100%",
  overflowX: "auto",
};

const table: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
};

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "12px 10px",
  fontSize: 12,
  color: "#64748b",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  borderBottom: "1px solid #e2e8f0",
};

const tr: React.CSSProperties = {
  borderBottom: "1px solid #f1f5f9",
};

const td: React.CSSProperties = {
  padding: "14px 10px",
  fontSize: 14,
  color: "#0f172a",
  verticalAlign: "top",
};

const muted: React.CSSProperties = {
  color: "#94a3b8",
};

const holidayBadge: React.CSSProperties = {
  display: "inline-block",
  padding: "4px 10px",
  borderRadius: 999,
  background: "#fef3c7",
  color: "#92400e",
  fontSize: 12,
  fontWeight: 700,
};

const weekendBadge: React.CSSProperties = {
  display: "inline-block",
  padding: "4px 10px",
  borderRadius: 999,
  background: "#ede9fe",
  color: "#5b21b6",
  fontSize: 12,
  fontWeight: 700,
};

const weekdayBadge: React.CSSProperties = {
  display: "inline-block",
  padding: "4px 10px",
  borderRadius: 999,
  background: "#e0f2fe",
  color: "#0369a1",
  fontSize: 12,
  fontWeight: 700,
};
