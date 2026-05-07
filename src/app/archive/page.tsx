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

type ArchiveRow = Partial<DutyAssignment> & {
  duty_date: string;
  member_name?: string | null;
  member_email?: string | null;
  split_assignee_name?: string | null;
  split_assignee_email?: string | null;
  performed_split_id?: string | null;
  performed_split_number?: number | null;
  performed_split_member_id?: string | null;
  performed_split_member_name?: string | null;
  performed_split_member_email?: string | null;
  performed_split_completed_at?: string | null;
};

type SplitArchiveRow = {
  id: string;
  split_number: number | null;
  status: string | null;
  performed_date: string | null;
  completed_at: string | null;
  completed_by_member_id: string | null;
};

type MemberRow = {
  id: string;
  full_name: string;
  email: string;
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

    const archivePromise = supabase
      .from("calendar_feed")
      .select("*")
      .gte("duty_date", from)
      .lte("duty_date", to)
      .order("duty_date", { ascending: true });

    const splitsPromise = supabase
      .from("splits")
      .select("id, split_number, status, performed_date, completed_at, completed_by_member_id")
      .gte("performed_date", from)
      .lte("performed_date", to)
      .order("performed_date", { ascending: true });

    const membersPromise = supabase
      .from("members")
      .select("id, full_name, email");

    const [
      { data: archiveData, error: archiveError },
      { data: splitsData, error: splitsError },
      { data: membersData, error: membersError },
    ] = await Promise.all([archivePromise, splitsPromise, membersPromise]);

    if (archiveError || splitsError || membersError) {
      console.error("Error loading archive:", {
        archiveError,
        splitsError,
        membersError,
      });
      setRows([]);
      setLoading(false);
      return;
    }

    const membersById = new Map(
      ((membersData as MemberRow[] | null) ?? []).map((member) => [member.id, member])
    );

    const byDate = new Map(
      ((archiveData as ArchiveRow[] | null) ?? []).map((row) => [row.duty_date, row])
    );

    const completedSplits = ((splitsData as SplitArchiveRow[] | null) ?? [])
      .filter((split) => {
        if (!split.performed_date) return false;
        return split.status === "completed" || split.status === "הושלם";
      })
      .sort((a, b) => {
        const aTime = a.completed_at ? new Date(a.completed_at).getTime() : 0;
        const bTime = b.completed_at ? new Date(b.completed_at).getTime() : 0;
        return aTime - bTime;
      });

    for (const split of completedSplits) {
      if (!split.performed_date) continue;

      const dateKey = split.performed_date.slice(0, 10);
      const existing = byDate.get(dateKey) ?? { duty_date: dateKey };
      const member = split.completed_by_member_id
        ? membersById.get(split.completed_by_member_id)
        : null;

      byDate.set(dateKey, {
        ...existing,
        performed_split_id: split.id,
        performed_split_number: split.split_number,
        performed_split_member_id: split.completed_by_member_id,
        performed_split_member_name: member?.full_name ?? null,
        performed_split_member_email: member?.email ?? null,
        performed_split_completed_at: split.completed_at,
      });
    }

    setRows(Array.from(byDate.values()));
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
          <p style={subtitle}>Read-only monthly history of assignments, split duties, reported volume, and notes.</p>
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
                  <th style={th}>Split</th>
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
                      {row?.performed_split_id ? (
                        <div style={splitCell}>
                          <span>
                            {row.performed_split_number != null
                              ? `P${row.performed_split_number}`
                              : "Split"}
                            {row.performed_split_member_name
                              ? ` - ${row.performed_split_member_name}`
                              : ""}
                          </span>
                          <span style={completedBadge}>Completed</span>
                        </div>
                      ) : (
                        <span style={muted}>No split</span>
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

const splitCell: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: 6,
};

const completedBadge: React.CSSProperties = {
  display: "inline-block",
  padding: "3px 8px",
  borderRadius: 999,
  background: "#dcfce7",
  color: "#166534",
  fontSize: 11,
  fontWeight: 700,
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
