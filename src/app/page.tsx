"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

type DutyCardData = {
  duty_date: string;
  member_name: string | null;
  volume_ml: number | null;
  split_assignee_id: string | null;
  split_passage_number: number | null;
  split_completed: boolean;
};

type SplitRegistrationCardData = {
  split_id: string;
  split_number: number;
  plates_count: number;
};

type TodaySplitRegistrationItem = {
  member_id: string;
  member_name: string;
  plates_count: number;
};

type TodaySplitSummary = {
  split_number: number;
  user_plates: number;
  maintenance: number;
  flow: number;
  total: number;
};

type LatestCompletedSplitRow = {
  actual_plate_count?: number | null;
};

type DutyAssignmentWithMember = {
  duty_date: string;
  volume_ml?: number | null;
  split_assignee_id?: string | null;
  split_passage_number?: number | null;
  split_completed?: boolean | null;
  members?: { full_name?: string | null } | { full_name?: string | null }[] | null;
};

export default function HomePage() {
  const supabase = createClient();
  const router = useRouter();

  const [todayDuty, setTodayDuty] = useState<DutyCardData | null>(null);
  const [tomorrowDuty, setTomorrowDuty] = useState<DutyCardData | null>(null);
  const [todayMediumChangePlateCount, setTodayMediumChangePlateCount] = useState<number | null>(
    null
  );
  const [mySplitRegistrations, setMySplitRegistrations] = useState<
    SplitRegistrationCardData[]
  >([]);
  const [todaySplitModalOpen, setTodaySplitModalOpen] = useState(false);
  const [todaySplitModalLoading, setTodaySplitModalLoading] = useState(false);
  const [todaySplitRegistrations, setTodaySplitRegistrations] = useState<
    TodaySplitRegistrationItem[]
  >([]);
  const [todaySplitSummary, setTodaySplitSummary] = useState<TodaySplitSummary | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [dutiesLoading, setDutiesLoading] = useState(true);
  const [registrationsLoading, setRegistrationsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    void loadHomeData();
  }, []);

  function normalizeDutyRow(row: DutyAssignmentWithMember): DutyCardData {
    const member = Array.isArray(row.members) ? row.members[0] : row.members;

    return {
      duty_date: row.duty_date,
      member_name: member?.full_name ?? null,
      volume_ml: row.volume_ml ?? null,
      split_assignee_id: row.split_assignee_id ?? null,
      split_passage_number: row.split_passage_number ?? null,
      split_completed: Boolean(row.split_completed),
    };
  }

  async function loadHomeData() {
    setAuthLoading(true);
    setDutiesLoading(true);
    setRegistrationsLoading(true);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        console.error("Failed to get authenticated user:", userError);
        setIsAuthenticated(false);
        setTodayDuty(null);
        setTomorrowDuty(null);
        setTodayMediumChangePlateCount(null);
        setMySplitRegistrations([]);
        setAuthLoading(false);
        setDutiesLoading(false);
        setRegistrationsLoading(false);
        return;
      }

      if (!user?.email) {
        setIsAuthenticated(false);
        setTodayDuty(null);
        setTomorrowDuty(null);
        setTodayMediumChangePlateCount(null);
        setMySplitRegistrations([]);
        setAuthLoading(false);
        setDutiesLoading(false);
        setRegistrationsLoading(false);
        return;
      }

      setIsAuthenticated(true);
      setAuthLoading(false);

      const today = new Date();
      const tomorrow = new Date();
      tomorrow.setDate(today.getDate() + 1);

      const todayStr = today.toISOString().slice(0, 10);
      const tomorrowStr = tomorrow.toISOString().slice(0, 10);

      const memberPromise = supabase
        .from("members")
        .select("id")
        .eq("email", user.email)
        .maybeSingle();

      const dutiesPromise = supabase
        .from("duty_assignments")
        .select(`
          duty_date,
          volume_ml,
          split_assignee_id,
          split_passage_number,
          split_completed,
          members:members!duty_assignments_member_id_fkey (
              full_name
            )
        `)
        .in("duty_date", [todayStr, tomorrowStr]);

      const latestCompletedSplitPromise = supabase
        .from("splits")
        .select("actual_plate_count")
        .eq("status", "completed")
        .not("actual_plate_count", "is", null)
        .order("performed_date", { ascending: false })
        .order("completed_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const [
        { data: memberData, error: memberError },
        { data: dutiesData, error: dutiesError },
        { data: latestCompletedSplitData, error: latestCompletedSplitError },
      ] = await Promise.all([memberPromise, dutiesPromise, latestCompletedSplitPromise]);

      if (dutiesError) {
        console.error("Failed to load duties:", dutiesError);
        setTodayDuty(null);
        setTomorrowDuty(null);
      } else {
        const duties = (dutiesData ?? []) as DutyAssignmentWithMember[];

        const todayRow = duties.find((row) => row.duty_date === todayStr) ?? null;
        const tomorrowRow = duties.find((row) => row.duty_date === tomorrowStr) ?? null;

        setTodayDuty(todayRow ? normalizeDutyRow(todayRow) : null);
        setTomorrowDuty(tomorrowRow ? normalizeDutyRow(tomorrowRow) : null);
      }

      if (latestCompletedSplitError) {
        console.error("Failed to load latest completed split:", latestCompletedSplitError);
        setTodayMediumChangePlateCount(null);
      } else {
        const latestCompletedSplit = latestCompletedSplitData as LatestCompletedSplitRow | null;
        setTodayMediumChangePlateCount(latestCompletedSplit?.actual_plate_count ?? null);
      }

      setDutiesLoading(false);

      if (memberError) {
        console.error("Failed to load current member:", memberError);
        setMySplitRegistrations([]);
        setRegistrationsLoading(false);
        return;
      }

      if (!memberData?.id) {
        setMySplitRegistrations([]);
        setRegistrationsLoading(false);
        return;
      }

      const { data: registrationData, error: registrationError } = await supabase
        .from("split_registrations")
        .select(`
          split_id,
          plates_count,
          splits!inner (
            id,
            split_number,
            status
          )
        `)
        .eq("member_id", memberData.id)
        .neq("splits.status", "completed")
        .order("split_number", { ascending: true, foreignTable: "splits" })
        .limit(5);

      if (registrationError) {
        console.error("Failed to load split registrations:", registrationError);
        setMySplitRegistrations([]);
        setRegistrationsLoading(false);
        return;
      }

      const parsed: SplitRegistrationCardData[] = (registrationData ?? [])
        .map((row: any) => {
          const split = Array.isArray(row.splits) ? row.splits[0] : row.splits;

          if (!split?.id || split?.split_number == null) return null;

          return {
            split_id: split.id,
            split_number: split.split_number,
            plates_count: row.plates_count ?? 0,
          };
        })
        .filter(Boolean) as SplitRegistrationCardData[];

      setMySplitRegistrations(parsed);
      setRegistrationsLoading(false);
    } catch (error) {
      console.error("Failed to load home data:", error);
      setIsAuthenticated(false);
      setTodayDuty(null);
      setTomorrowDuty(null);
      setTodayMediumChangePlateCount(null);
      setMySplitRegistrations([]);
      setAuthLoading(false);
      setDutiesLoading(false);
      setRegistrationsLoading(false);
    }
  }

  async function handleLogin() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: "https://ipsc-dvirlab.vercel.app/calendar",
        scopes: "openid email profile https://www.googleapis.com/auth/calendar",
        queryParams: {
          access_type: "offline",
          prompt: "consent select_account",
        },
      },
    });

    if (error) {
      console.error("Login failed:", error);
    }
  }

  function handleOpenCalendar() {
    router.push("/calendar");
  }

  async function handleOpenTodaysSplit(e: React.MouseEvent<HTMLButtonElement>) {
    e.stopPropagation();

    if (!todayDuty?.split_assignee_id) return;

    setTodaySplitModalOpen(true);
    setTodaySplitModalLoading(true);
    setTodaySplitSummary(null);

    let splitData: { id: string; split_number: number } | null = null;
    let splitError: any = null;

    if (todayDuty.split_passage_number != null) {
      const result = await supabase
        .from("splits")
        .select("id, split_number")
        .eq("split_number", todayDuty.split_passage_number)
        .in("status", ["open", "completed"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      splitData = result.data;
      splitError = result.error;
    }

    if (!splitData?.id && !splitError) {
      const fallbackResult = await supabase
        .from("splits")
        .select("id, split_number")
        .eq("status", "open")
        .order("split_number", { ascending: true })
        .limit(1)
        .maybeSingle();

      splitData = fallbackResult.data;
      splitError = fallbackResult.error;
    }

    if (splitError || !splitData?.id) {
      console.error("Failed to load today's split:", splitError);
      setTodaySplitRegistrations([]);
      setTodaySplitSummary(null);
      setTodaySplitModalLoading(false);
      return;
    }

    const [registrationsResult, summaryResult] = await Promise.all([
      supabase
        .from("split_registrations")
        .select("member_id, plates_count, members(full_name)")
        .eq("split_id", splitData.id)
        .order("plates_count", { ascending: false }),
      supabase.rpc("get_split_summary", {
        p_split_id: splitData.id,
      }),
    ]);

    if (registrationsResult.error) {
      console.error(
        "Failed to load today's split registrations:",
        registrationsResult.error
      );
      setTodaySplitRegistrations([]);
    } else {
      const parsed: TodaySplitRegistrationItem[] = (registrationsResult.data ?? []).map(
        (row: any) => {
          const member = Array.isArray(row.members) ? row.members[0] : row.members;

          return {
            member_id: row.member_id,
            member_name: member?.full_name ?? "Unknown member",
            plates_count: row.plates_count ?? 0,
          };
        }
      );

      setTodaySplitRegistrations(parsed);
    }

    if (summaryResult.error) {
      console.error("Failed to load today's split summary:", summaryResult.error);
      setTodaySplitSummary(null);
    } else {
      const summaryRow = Array.isArray(summaryResult.data)
        ? summaryResult.data[0]
        : summaryResult.data;

      setTodaySplitSummary({
        split_number: Number(splitData.split_number ?? todayDuty.split_passage_number),
        user_plates: Number(summaryRow?.user_plates ?? 0),
        maintenance: Number(summaryRow?.maintenance ?? 1),
        flow: Number(summaryRow?.flow ?? 0),
        total: Number(summaryRow?.total ?? 1),
      });
    }

    setTodaySplitModalLoading(false);
  }

  if (authLoading || isAuthenticated === null) {
    return (
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <div style={topBar}>
          <div style={pageTitle}>Home</div>
        </div>

        <div style={loginCard}>
          <h2 style={sectionTitle}>Loading...</h2>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <div style={topBar}>
          <div style={pageTitle}>Home</div>
        </div>

        <div style={loginCard}>
          <h2 style={sectionTitle}>Sign in</h2>
          <p style={mutedText}>
            Please sign in with your Google account to access the duty system.
          </p>

          <button onClick={handleLogin} style={loginButton}>
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 980, margin: "0 auto" }}>
      <div style={topBar}>
        <div style={pageTitle}>Home</div>

        <Link href="/settings" style={gearButton} aria-label="Settings">
          ⚙
        </Link>
      </div>

      <section style={{ marginTop: 16 }}>
        <div style={splitRegistrationCard}>
          <div style={splitRegistrationHeader}>
            <div>
              <h2 style={sectionTitle}>My Split Plate Registrations</h2>
            </div>

            <button
              type="button"
              onClick={() => router.push("/splits")}
              style={secondaryButton}
            >
              Open Splits
            </button>
          </div>

          {registrationsLoading ? (
            <p style={mutedText}>Loading your split registrations...</p>
          ) : mySplitRegistrations.length === 0 ? (
            <p style={mutedText}>You are not registered for any upcoming splits.</p>
          ) : (
            <div style={splitRegistrationList}>
              {mySplitRegistrations.map((item) => (
                <div key={item.split_id} style={splitRegistrationRow}>
                  <div style={splitRegistrationLeft}>
                    <span style={splitNumberBadge}>P{item.split_number}</span>
                  </div>

                  <div style={splitRegistrationRight}>
                    {item.plates_count} {item.plates_count === 1 ? "plate" : "plates"}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section style={{ marginTop: 24 }}>
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
  onClick={handleOpenTodaysSplit}
  disabled={!todayDuty?.split_assignee_id}
  style={primaryButton(!todayDuty?.split_assignee_id)}
>
  Open Today’s Split
</button>
              </div>
            </div>

            {dutiesLoading ? (
              <p style={mutedText}>Loading today’s duty...</p>
            ) : !todayDuty ? (
              <p style={mutedText}>No duty assigned for today</p>
            ) : (
              <>
                <div style={badgeRow}>
                  <Badge label="Medium change completed" variant="green" />
                  <Badge
                    label={
                      todayDuty.split_assignee_id
                        ? "Split duty scheduled"
                        : "No split today"
                    }
                    variant={todayDuty.split_assignee_id ? "blue" : "gray"}
                  />
                  {todayDuty.split_assignee_id && (
                    <Badge
                      label={
                        todayDuty.split_completed
                          ? "Split completed"
                          : "Split pending"
                      }
                      variant={todayDuty.split_completed ? "green" : "amber"}
                    />
                  )}
                </div>

                <div style={infoGrid}>
                  <InfoItem label="Member" value={todayDuty.member_name ?? "--"} />
                  <InfoItem
                    label="Plates to change"
                    value={
                      todayMediumChangePlateCount !== null &&
                      todayMediumChangePlateCount !== undefined
                        ? `${todayMediumChangePlateCount} ${
                            todayMediumChangePlateCount === 1 ? "plate" : "plates"
                          }`
                        : "--"
                    }
                  />
                  <InfoItem
                    label="Volume changed"
                    value={
                      todayDuty.volume_ml !== null &&
                      todayDuty.volume_ml !== undefined
                        ? `${todayDuty.volume_ml} mL`
                        : "--"
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

            {dutiesLoading ? (
              <p style={mutedText}>Loading tomorrow’s duty...</p>
            ) : !tomorrowDuty ? (
              <p style={mutedText}>No duty assigned for tomorrow</p>
            ) : (
              <>
                <div style={badgeRow}>
                  <Badge label="Upcoming duty" variant="purple" />
                  <Badge
                    label={
                      tomorrowDuty.split_assignee_id
                        ? "Split duty scheduled"
                        : "No split planned"
                    }
                    variant={tomorrowDuty.split_assignee_id ? "blue" : "gray"}
                  />
                  {tomorrowDuty.split_assignee_id && (
                    <Badge
                      label={
                        tomorrowDuty.split_completed
                          ? "Split completed"
                          : "Split pending"
                      }
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
      {todaySplitModalOpen && (
  <div style={modalOverlay}>
    <div style={modalCard}>
      <div style={modalHeader}>
        <div>
          <h3 style={modalTitle}>Today’s Split Registrations</h3>
          <p style={modalSubtitle}>
            View the current registrations for today’s split.
          </p>
        </div>

        <button
          onClick={() => setTodaySplitModalOpen(false)}
          style={modalCloseButton}
        >
          Close
        </button>
      </div>

      {todaySplitModalLoading ? (
        <p style={mutedText}>Loading registrations...</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {todaySplitSummary && (
            <div style={splitSummaryGrid}>
              <div style={splitSummaryItem}>
                <div style={infoLabel}>Passage</div>
                <div style={infoValue}>P{todaySplitSummary.split_number}</div>
              </div>
              <div style={splitSummaryItem}>
                <div style={infoLabel}>User plates</div>
                <div style={infoValue}>{todaySplitSummary.user_plates}</div>
              </div>
              <div style={splitSummaryItem}>
                <div style={infoLabel}>Maintenance plates</div>
                <div style={infoValue}>{todaySplitSummary.maintenance}</div>
              </div>
              <div style={splitSummaryItem}>
                <div style={infoLabel}>Flow plates</div>
                <div style={infoValue}>{todaySplitSummary.flow}</div>
              </div>
              <div style={splitSummaryItem}>
                <div style={infoLabel}>Total plates</div>
                <div style={infoValue}>{todaySplitSummary.total}</div>
              </div>
            </div>
          )}

          <div style={registrationsBoxStyle}>
            <div style={{ fontWeight: 700, marginBottom: 10 }}>
              Registrations
            </div>

            {todaySplitRegistrations.length === 0 ? (
              <div style={{ color: "#64748b" }}>No registrations yet.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {todaySplitRegistrations.map((registration) => (
                  <div
                    key={registration.member_id}
                    style={registrationRowStyle}
                  >
                    <span>{registration.member_name}</span>
                    <strong>{registration.plates_count} plates</strong>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  </div>
)}
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
      <path
        d="M8 3v4M16 3v4M3 10h18"
        stroke="#0f172a"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
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

const topBar: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginTop: 16,
  marginBottom: 12,
};

const pageTitle: React.CSSProperties = {
  fontSize: 28,
  fontWeight: 700,
  color: "#0f172a",
};

const gearButton: React.CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: "50%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  textDecoration: "none",
  fontSize: 20,
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  boxShadow: "0 1px 2px rgba(15, 23, 42, 0.06)",
  cursor: "pointer",
};

const loginCard: React.CSSProperties = {
  marginTop: 24,
  padding: 24,
  borderRadius: 18,
  border: "1px solid #e2e8f0",
  background: "#ffffff",
  boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
  maxWidth: 480,
};

const loginButton: React.CSSProperties = {
  marginTop: 12,
  padding: "12px 16px",
  borderRadius: 10,
  border: "1px solid #cbd5e1",
  background: "#0f172a",
  color: "#ffffff",
  cursor: "pointer",
  fontWeight: 700,
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

const splitSummaryGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
  gap: 10,
};

const infoItem: React.CSSProperties = {
  padding: 12,
  borderRadius: 12,
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
};

const splitSummaryItem: React.CSSProperties = {
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

const splitRegistrationCard: React.CSSProperties = {
  padding: 18,
  borderRadius: 18,
  border: "1px solid #fde68a",
  background: "#fffbeb",
  boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
};

const splitRegistrationHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  marginBottom: 14,
};

const splitRegistrationList: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
  marginTop: 8,
};

const splitRegistrationRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  padding: "12px 14px",
  borderRadius: 12,
  background: "#ffffff",
  border: "1px solid #fde68a",
};

const splitRegistrationLeft: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
};

const splitRegistrationRight: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  color: "#92400e",
};

const splitNumberBadge: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: 52,
  padding: "6px 12px",
  borderRadius: 999,
  background: "#fef3c7",
  color: "#92400e",
  border: "1px solid #fcd34d",
  fontSize: 14,
  fontWeight: 800,
};

const secondaryButton: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid #fcd34d",
  background: "#ffffff",
  color: "#92400e",
  cursor: "pointer",
  fontWeight: 700,
  whiteSpace: "nowrap",
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

const modalOverlay: React.CSSProperties = {
  position: "fixed",
  top: 0,
  left: 0,
  width: "100vw",
  height: "100vh",
  backgroundColor: "rgba(0,0,0,0.4)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
};

const modalCard: React.CSSProperties = {
  background: "white",
  borderRadius: 16,
  padding: 20,
  width: "90%",
  maxWidth: 500,
  boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
};

const modalHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  marginBottom: 16,
};

const modalTitle: React.CSSProperties = {
  margin: 0,
  fontSize: 18,
  fontWeight: 700,
};

const modalSubtitle: React.CSSProperties = {
  margin: "4px 0 0",
  fontSize: 13,
  color: "#64748b",
};

const modalCloseButton: React.CSSProperties = {
  border: "none",
  background: "#e2e8f0",
  padding: "6px 10px",
  borderRadius: 8,
  cursor: "pointer",
};

const registrationRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  padding: "8px 12px",
  background: "#f8fafc",
  borderRadius: 8,
};

const registrationsBoxStyle: React.CSSProperties = {
  marginTop: 8,
  padding: 12,
  borderRadius: 12,
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
};

