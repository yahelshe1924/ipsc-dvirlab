"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase";

type DutyRow = {
  duty_date: string;
  member_id?: string | null;
  volume_ml?: number | null;
  split_assignee_id?: string | null;
  split_completed?: boolean;
};

type MemberRow = {
  id: string;
  full_name: string;
};

type TodayDutyData = {
  duty_date: string;
  member_name: string | null;
  volume_ml: number | null;
  split_assignee_id: string | null;
  split_completed: boolean;
};

export default function HomePage() {
  const supabase = createClient();

  const [todayDuty, setTodayDuty] = useState<TodayDutyData | null>(null);

  useEffect(() => {
    void loadTodayDuty();
  }, []);

  async function loadTodayDuty() {
    const today = new Date().toISOString().slice(0, 10);

    const { data, error } = await supabase
      .from("duty_assignments")
      .select("duty_date, member_id, volume_ml, split_assignee_id, split_completed")
      .eq("duty_date", today)
      .maybeSingle();

    if (error) {
      console.error("Failed to load today's duty:", error);
      return;
    }

    if (!data) {
      setTodayDuty(null);
      return;
    }

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

    setTodayDuty({
      duty_date: duty.duty_date,
      member_name: memberName,
      volume_ml: duty.volume_ml ?? null,
      split_assignee_id: duty.split_assignee_id ?? null,
      split_completed: Boolean(duty.split_completed),
    });
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <div style={{ marginTop: 8 }}>
        <h2>Quick Actions</h2>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 10 }}>
          <Link href="/calendar" style={card}>
            Calendar
          </Link>

          <Link href="/splits" style={card}>
            Splits
          </Link>

          <Link href="/stats" style={card}>
            Stats
          </Link>

          <Link href="/people" style={card}>
            People
          </Link>
        </div>
      </div>

      <div style={{ marginTop: 40 }}>
        <h2>Today’s Duty</h2>

        {!todayDuty ? (
          <p style={{ color: "#555" }}>No duty assigned for today</p>
        ) : (
          <div style={box}>
            <div style={{ marginBottom: 6 }}>
              <strong>Medium change:</strong> Completed
            </div>

            <div style={{ marginBottom: 6 }}>
              <strong>Member:</strong> {todayDuty.member_name ?? "—"}
            </div>

            <div style={{ marginBottom: 6 }}>
              <strong>Volume changed:</strong>{" "}
              {todayDuty.volume_ml !== null && todayDuty.volume_ml !== undefined
                ? `${todayDuty.volume_ml} mL`
                : "—"}
            </div>

            <div style={{ marginBottom: 6 }}>
              <strong>Split duty:</strong> {todayDuty.split_assignee_id ? "Yes" : "No"}
            </div>

            {todayDuty.split_assignee_id && (
              <div>
                <strong>Split status:</strong> {todayDuty.split_completed ? "Completed" : "Pending"}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const card: React.CSSProperties = {
  display: "inline-block",
  padding: "14px 20px",
  borderRadius: 12,
  border: "1px solid #e2e8f0",
  background: "#ffffff",
  textDecoration: "none",
  color: "#0f172a",
  fontWeight: 600,
};

const box: React.CSSProperties = {
  marginTop: 10,
  padding: 16,
  borderRadius: 12,
  border: "1px solid #e2e8f0",
  background: "#ffffff",
};