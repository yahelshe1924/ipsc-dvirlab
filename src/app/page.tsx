"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

type DutyRow = {
  duty_date: string;
  member_id?: string | null;
  volume_ml?: number | null;
  split_assignee_id?: string | null;
  split_completed?: boolean | null;
};

type MemberRow = {
  id: string;
  full_name: string;
};

type DutyCardData = {
  duty_date: string;
  member_name: string | null;
  volume_ml: number | null;
  split_assignee_id: string | null;
  split_completed: boolean;
};

export default function HomePage() {
  const supabase = createClient();
  const router = useRouter();

  const [todayDuty, setTodayDuty] = useState<DutyCardData | null>(null);
  const [tomorrowDuty, setTomorrowDuty] = useState<DutyCardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void loadDuties();
  }, []);

  async function loadDutyByDate(dateStr: string): Promise<DutyCardData | null> {
    const { data, error } = await supabase
      .from("duty_assignments")
      .select("duty_date, member_id, volume_ml, split_assignee_id, split_completed")
      .eq("duty_date", dateStr)
      .maybeSingle();

    if (error) {
      console.error(`Failed to load duty for ${dateStr}:`, error);
      return null;
    }

    if (!data) return null;

    const duty = data as DutyRow;
    let memberName: string | null = null;

    if (duty.member_id) {
      const { data: memberData, error: memberError } = await supabase
        .from("members")
        .select("id, full_name")
        .eq("id", duty.member_id)
        .maybeSingle();

      if (memberError) {
        console.error("Failed to load member:", memberError);
      } else {
        memberName = (memberData as MemberRow | null)?.full_name ?? null;
      }
    }

    return {
      duty_date: duty.duty_date,
      member_name: memberName,
      volume_ml: duty.volume_ml ?? null,
      split_assignee_id: duty.split_assignee_id ?? null,
      split_completed: Boolean(duty.split_completed),
    };
  }

  async function loadDuties() {
    setLoading(true);

    try {
      const today = new Date();
      const tomorrow = new Date();
      tomorrow.setDate(today.getDate() + 1);

      const todayStr = today.toISOString().slice(0, 10);
      const tomorrowStr = tomorrow.toISOString().slice(0, 10);

      const [todayData, tomorrowData] = await Promise.all([
        loadDutyByDate(todayStr),
        loadDutyByDate(tomorrowStr),
      ]);

      setTodayDuty(todayData);
      setTomorrowDuty(tomorrowData);
    } finally {
      setLoading(false);
    }
  }

  function handleOpenCalendar() {
    router.push("/calendar");
  }

  function handleOpenSplits(e: React.MouseEvent) {
    e.stopPropagation();
    router.push("/splits");
  }

  return (
    <div style={{ maxWidth: 980, margin: "0 auto" }}>
      <section style={{ marginTop: 8 }}>
        <h2 style={sectionTitle}>Quick Actions</h2>

        <div style={quickActionsGrid}>
          <QuickActionCard
            href="/calendar"
            title="Calendar"
            subtitle="Manage daily duties"
            icon={<CalendarIcon />}
          />

          <QuickActionCard
            href="/splits"
            title="Splits"
            subtitle="Register and manage passages"
            icon={<SplitsIcon />}
          />

          <QuickActionCard
            href="/stats"
            title="Stats"
            subtitle="View lab activity summaries"
            icon={<StatsIcon />}
          />

          <QuickActionCard
            href="/people"
            title="People"
            subtitle="Manage lab members"
            icon={<PeopleIcon />}
          />
        </div>
      </section>

      <section style={{ marginTop: 40 }}>
        <div style={dutyGrid}>
          <div
            onClick={handleOpenCalendar}
            style={{
              ...dutyCard,
              cursor: "pointer",
            }}
          >
            <div style={dutyHeader}>
              <div>
                <h2 style={sectionTitle}>Today’s Duty</h2>
                <p style={sectionSubtitle}>Click this card to open the calendar</p>
              </div>

              <div style={headerActionRow}>
                <button
                  onClick={handleOpenSplits}
                  disabled={!todayDuty?.split_assignee_id}
                  style={primaryButton(!todayDuty?.split_assignee_id)}
                >
                  Open Today’s Split
                </button>
              </div>
            </div>

            {loading ? (
              <p style={mutedText}>Loading today’s duty...</p>
            ) : !todayDuty ? (
              <p style={mutedText}>No duty assigned for today</p>
            ) : (
              <>
                <div style={badgeRow}>
                  <Badge label="Medium change completed" variant="green" />
                  <Badge
                    label={todayDuty.split_assignee_id ? "Split duty scheduled" : "No split today"}
                    variant={todayDuty.split_assignee_id ? "blue" : "gray"}
                  />
                  {todayDuty.split_assignee_id && (
                    <Badge
                      label={todayDuty.split_completed ? "Split completed" : "Split pending"}
                      variant={todayDuty.split_completed ? "green" : "amber"}
                    />
                  )}
                </div>

                <div style={infoGrid}>
                  <InfoItem label="Member" value={todayDuty.member_name ?? "—"} />
                  <InfoItem
                    label="Volume changed"
                    value={
                      todayDuty.volume_ml !== null && todayDuty.volume_ml !== undefined
                        ? `${todayDuty.volume_ml} mL`
                        : "—"
                    }
                  />
                  <InfoItem label="Date" value={todayDuty.duty_date} />
                </div>
              </>
            )}
          </div>

          <div style={dutyCard}>
            <div style={dutyHeader}>
              <div>
                <h2 style={sectionTitle}>Tomorrow’s Duty</h2>
                <p style={sectionSubtitle}>Upcoming planned medium change</p>
              </div>
            </div>

            {loading ? (
              <p style={mutedText}>Loading tomorrow’s duty...</p>
            ) : !tomorrowDuty ? (
              <p style={mutedText}>No duty assigned for tomorrow</p>
            ) : (
              <>
                <div style={badgeRow}>
                  <Badge label="Upcoming duty" variant="purple" />
                  <Badge
                    label={tomorrowDuty.split_assignee_id ? "Split duty scheduled" : "No split planned"}
                    variant={tomorrowDuty.split_assignee_id ? "blue" : "gray"}
                  />
                  {tomorrowDuty.split_assignee_id && (
                    <Badge
                      label={tomorrowDuty.split_completed ? "Split completed" : "Split pending"}
                      variant={tomorrowDuty.split_completed ? "green" : "amber"}
                    />
                  )}
                </div>

                <div style={infoGrid}>
                  <InfoItem label="Member" value={tomorrowDuty.member_name ?? "—"} />
                  <InfoItem label="Date" value={tomorrowDuty.duty_date} />
                </div>
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function QuickActionCard({
  href,
  title,
  subtitle,
  icon,
}: {
  href: string;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
}) {
  return (
    <Link href={href} style={quickActionCard}>
      <div style={quickActionIconWrap}>{icon}</div>
      <div>
        <div style={quickActionTitle}>{title}</div>
        <div style={quickActionSubtitle}>{subtitle}</div>
      </div>
    </Link>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div style={infoItem}>
      <div style={infoLabel}>{label}</div>
      <div style={infoValue}>{value}</div>
    </div>
  );
}

function Badge({
  label,
  variant,
}: {
  label: string;
  variant: "green" | "blue" | "amber" | "gray" | "purple";
}) {
  const styles = badgeStyles[variant];

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "6px 10px",
        borderRadius: 999,
        fontSize: 13,
        fontWeight: 700,
        background: styles.background,
        color: styles.color,
        border: `1px solid ${styles.border}`,
      }}
    >
      {label}
    </span>
  );
}

function CalendarIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="3" stroke="#0f172a" strokeWidth="1.8" />
      <path d="M8 3v4M16 3v4M3 10h18" stroke="#0f172a" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function SplitsIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 5h12M6 12h12M6 19h12M9 5v14M15 5v14"
        stroke="#0f172a"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function StatsIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 19V11M12 19V7M19 19V4"
        stroke="#0f172a"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PeopleIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="9" cy="8" r="3" stroke="#0f172a" strokeWidth="1.8" />
      <circle cx="17" cy="9" r="2.5" stroke="#0f172a" strokeWidth="1.8" />
      <path
        d="M4 19c0-2.8 2.5-4.5 5-4.5s5 1.7 5 4.5M14.5 18.5c.4-1.7 1.9-2.8 3.8-2.8 1.1 0 2.2.4 3 1.2"
        stroke="#0f172a"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

const badgeStyles = {
  green: {
    background: "#dcfce7",
    color: "#166534",
    border: "#bbf7d0",
  },
  blue: {
    background: "#dbeafe",
    color: "#1d4ed8",
    border: "#bfdbfe",
  },
  amber: {
    background: "#fef3c7",
    color: "#b45309",
    border: "#fde68a",
  },
  gray: {
    background: "#e5e7eb",
    color: "#374151",
    border: "#d1d5db",
  },
  purple: {
    background: "#ede9fe",
    color: "#6d28d9",
    border: "#ddd6fe",
  },
};

const sectionTitle: React.CSSProperties = {
  margin: 0,
  fontSize: 24,
};

const sectionSubtitle: React.CSSProperties = {
  marginTop: 6,
  marginBottom: 0,
  color: "#64748b",
  fontSize: 14,
};

const mutedText: React.CSSProperties = {
  color: "#64748b",
  marginTop: 10,
};

const quickActionsGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
  gap: 14,
  marginTop: 14,
};

const quickActionCard: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 14,
  padding: 18,
  borderRadius: 16,
  border: "1px solid #e2e8f0",
  background: "#ffffff",
  textDecoration: "none",
  color: "#0f172a",
  boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
};

const quickActionIconWrap: React.CSSProperties = {
  width: 44,
  height: 44,
  borderRadius: 12,
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};

const quickActionTitle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  marginBottom: 4,
};

const quickActionSubtitle: React.CSSProperties = {
  fontSize: 13,
  color: "#64748b",
  lineHeight: 1.35,
};

const dutyGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  gap: 16,
};

const dutyCard: React.CSSProperties = {
  padding: 18,
  borderRadius: 18,
  border: "1px solid #e2e8f0",
  background: "#ffffff",
  boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
};

const dutyHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  marginBottom: 14,
};

const headerActionRow: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const badgeRow: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  marginBottom: 16,
};

const infoGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
  gap: 12,
};

const infoItem: React.CSSProperties = {
  padding: 12,
  borderRadius: 12,
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
};

const infoLabel: React.CSSProperties = {
  fontSize: 12,
  color: "#64748b",
  marginBottom: 6,
  fontWeight: 600,
};

const infoValue: React.CSSProperties = {
  fontSize: 15,
  color: "#0f172a",
  fontWeight: 700,
};

function primaryButton(disabled: boolean): React.CSSProperties {
  return {
    padding: "10px 14px",
    borderRadius: 10,
    border: "1px solid #cbd5e1",
    background: disabled ? "#e5e7eb" : "#0f172a",
    color: disabled ? "#6b7280" : "#ffffff",
    cursor: disabled ? "not-allowed" : "pointer",
    fontWeight: 700,
    whiteSpace: "nowrap",
  };
}