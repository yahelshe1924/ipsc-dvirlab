"use client";
/**
 * components/Calendar.tsx
 * -----------------------
 * Monthly calendar — the primary screen.
 * Each cell shows:
 *   • Day number
 *   • Duty holiday name (if any)
 *   • Medium-change assignee name pill
 *   • Split assignee pill + passage number (if exists)
 *   • Volume reported badge (✓ N mL)
 *   • "pending" badge for today if no volume yet
 */

import { getDutyHolidayLabel, isDutyHoliday } from "@/lib/dutyHolidays";
import { getColor } from "@/lib/colors";
import type { DutyAssignment, Member } from "@/types";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function daysInMonth(y: number, m: number) {
  return new Date(y, m + 1, 0).getDate();
}

function firstDow(y: number, m: number) {
  return new Date(y, m, 1).getDay();
}

function toKey(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

interface Props {
  year: number;
  month: number;
  duties: Record<string, DutyAssignment>;
  members: Member[];
  loggedInMemberId: string;
  onMonthChange: (dir: -1 | 1) => void;
  onDayClick: (dateKey: string) => void;
}

export default function Calendar({
  year,
  month,
  duties,
  members,
  loggedInMemberId,
  onMonthChange,
  onDayClick,
}: Props) {
  const today = new Date();
  const todayKey = toKey(today.getFullYear(), today.getMonth(), today.getDate());

  const totalDays = daysInMonth(year, month);
  const startDow = firstDow(year, month);

  const cells: (number | null)[] = [
    ...Array(startDow).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1),
  ];

  while (cells.length % 7) cells.push(null);

  return (
    <div>
      <div style={styles.monthNav}>
        <button style={styles.navBtn} onClick={() => onMonthChange(-1)}>
          ‹
        </button>
        <span style={styles.monthTitle}>
          {MONTHS[month]} {year}
        </span>
        <button style={styles.navBtn} onClick={() => onMonthChange(1)}>
          ›
        </button>
      </div>

      <div style={styles.grid7}>
        {WDAYS.map((w) => (
          <div key={w} style={styles.wdayHeader}>
            {w}
          </div>
        ))}
      </div>

      <div style={styles.grid7}>
        {cells.map((d, i) => {
          if (d === null) return <div key={`empty-${i}`} />;

          const key = toKey(year, month, d);
          const duty = duties[key];

          const member = duty?.member_id
            ? members.find((m) => m.id === duty.member_id) ?? null
            : null;

          const splitMember = duty?.split_assignee_id
            ? members.find((m) => m.id === duty.split_assignee_id) ?? null
            : null;

          const dateObj = new Date(year, month, d);
          const holiday = getDutyHolidayLabel(dateObj);
          const isHoliday = isDutyHoliday(dateObj);

          const isToday = key === todayKey;
          const isPast =
            dateObj < new Date(today.getFullYear(), today.getMonth(), today.getDate());
          const dow = dateObj.getDay();
          const isWeekend = dow === 5 || dow === 6;
          const reported = duty?.volume_ml != null;
          const color = member ? getColor(member.color_index) : null;
          const splitColor = splitMember ? getColor(splitMember.color_index) : null;

          let bgColor = "#fff";
          if (isToday) bgColor = "#ecfdf5";
          else if (isHoliday) bgColor = "#fffbeb";
          else if (isWeekend) bgColor = "#f9fafb";
          else if (isPast) bgColor = "#f8fafc";

          let borderStyle = "1.5px solid #e2e8f0";
          if (isToday) borderStyle = "2px solid #059669";
          else if (isHoliday) borderStyle = "1.5px solid #fcd34d";

          return (
            <div
              key={key}
              onClick={() => onDayClick(key)}
              style={{
                ...styles.cell,
                background: bgColor,
                border: borderStyle,
                opacity: isPast && !duty ? 0.45 : 1,
                cursor: "pointer",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.boxShadow = "0 4px 14px rgba(0,0,0,0.10)")
              }
              onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "none")}
            >
              <div style={styles.cellHeader}>
                <span
                  style={{
                    ...styles.dayNum,
                    color: isToday ? "#059669" : isHoliday ? "#92400e" : "#0f172a",
                    fontWeight: isToday ? 800 : 600,
                  }}
                >
                  {d}
                </span>

                {holiday && <span style={styles.holidayTag}>{holiday}</span>}
              </div>

              {member && (
                <div
                  style={{
                    ...styles.assigneePill,
                    background: color!.bg,
                    color: color!.text,
                  }}
                  title={`Medium change: ${member.full_name}`}
                >
                  M: {member.full_name.split(" ")[0]}
                </div>
              )}

              {splitMember && (
                <div
                  style={{
                    ...styles.splitPill,
                    background: splitColor!.bg,
                    color: splitColor!.text,
                  }}
                  title={`Split: ${splitMember.full_name}${
                    duty?.split_passage_number != null ? ` (P${duty.split_passage_number})` : ""
                  }`}
                >
                  S: {splitMember.full_name.split(" ")[0]}
                  {duty?.split_passage_number != null ? ` · P${duty.split_passage_number}` : ""}
                </div>
              )}

              {duty?.split_completed && (
                <div style={styles.splitDoneBadge}>
                  split done
                </div>
              )}

              {reported && <div style={styles.volumeBadge}>✓ {duty!.volume_ml} mL</div>}

              {isToday && duty?.member_id && !reported && (
                <div style={styles.pendingBadge}>pending</div>
              )}
            </div>
          );
        })}
      </div>

      <div style={styles.legend}>
        {[
          { bg: "#ecfdf5", border: "2px solid #059669", label: "Today" },
          { bg: "#fffbeb", border: "1.5px solid #fcd34d", label: "Holiday" },
          { bg: "#f9fafb", border: "1.5px solid #e2e8f0", label: "Fri / Sat" },
          { bg: "#f8fafc", border: "1.5px solid #f1f5f9", label: "Past" },
        ].map((l) => (
          <div
            key={l.label}
            style={{ display: "flex", alignItems: "center", gap: 5 }}
          >
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: 3,
                background: l.bg,
                border: l.border,
              }}
            />
            <span style={{ fontSize: 11, color: "#64748b" }}>{l.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  monthNav: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  navBtn: {
    background: "#f1f5f9",
    border: "none",
    borderRadius: 8,
    width: 36,
    height: 36,
    fontSize: 20,
    cursor: "pointer",
    color: "#475569",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  monthTitle: {
    fontFamily: "'DM Serif Display', serif",
    fontSize: 22,
    color: "#0f172a",
    fontWeight: 400,
  },
  grid7: {
    display: "grid",
    gridTemplateColumns: "repeat(7, 1fr)",
    gap: 4,
    marginBottom: 4,
  },
  wdayHeader: {
    textAlign: "center",
    fontSize: 10,
    fontWeight: 700,
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    padding: "4px 0",
  },
  cell: {
    minHeight: 96,
    borderRadius: 10,
    padding: "6px 7px",
    transition: "box-shadow 0.15s",
    position: "relative",
    overflow: "hidden",
  },
  cellHeader: {
    display: "flex",
    alignItems: "flex-start",
    gap: 4,
    flexWrap: "wrap",
  },
  dayNum: {
    fontSize: 13,
    lineHeight: 1,
    flexShrink: 0,
  },
  holidayTag: {
    fontSize: 9,
    fontWeight: 700,
    color: "#92400e",
    background: "#fef3c7",
    borderRadius: 4,
    padding: "1px 4px",
    lineHeight: 1.4,
    maxWidth: "100%",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  assigneePill: {
    marginTop: 3,
    display: "inline-block",
    borderRadius: 999,
    padding: "1px 7px",
    fontSize: 10,
    fontWeight: 700,
    maxWidth: "100%",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  splitPill: {
    marginTop: 3,
    display: "inline-block",
    borderRadius: 999,
    padding: "1px 7px",
    fontSize: 10,
    fontWeight: 700,
    maxWidth: "100%",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    border: "1px dashed rgba(15,23,42,0.12)",
  },
  splitDoneBadge: {
    marginTop: 3,
    fontSize: 9,
    color: "#0891b2",
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
  },
  volumeBadge: {
    marginTop: 3,
    fontSize: 10,
    color: "#059669",
    fontWeight: 700,
  },
  pendingBadge: {
    marginTop: 2,
    fontSize: 9,
    color: "#f59e0b",
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
  },
  legend: {
    marginTop: 16,
    display: "flex",
    gap: 14,
    flexWrap: "wrap",
  },
};