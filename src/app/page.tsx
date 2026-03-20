"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase";

type Duty = {
  duty_date: string;
  member_name?: string | null;
  split_assignee_id?: string | null;
  split_completed?: boolean;
};

export default function HomePage() {
  const supabase = createClient();

  const [todayDuty, setTodayDuty] = useState<Duty | null>(null);

  useEffect(() => {
    loadTodayDuty();
  }, []);

  async function loadTodayDuty() {
    const today = new Date().toISOString().slice(0, 10);

    const { data, error } = await supabase
      .from("duty_assignments")
      .select("duty_date, member_name, split_assignee_id, split_completed")
      .eq("duty_date", today)
      .maybeSingle();

    if (error) {
      console.error(error);
      return;
    }

    setTodayDuty(data);
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <h1 style={{ marginBottom: 4 }}>iPSC-DvirLab</h1>
      <p style={{ marginTop: 0, color: "#555" }}>
        Stem Cell Lab Management Platform
      </p>

      {/* Quick Actions */}
      <div style={{ marginTop: 30 }}>
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

      {/* Today’s Duty */}
      <div style={{ marginTop: 40 }}>
        <h2>Today’s Duty</h2>

        {!todayDuty ? (
          <p style={{ color: "#555" }}>No duty assigned for today</p>
        ) : (
          <div style={box}>
            <div style={{ marginBottom: 6 }}>
              <strong>Member:</strong> {todayDuty.member_name ?? "—"}
            </div>

            <div style={{ marginBottom: 6 }}>
              <strong>Split duty:</strong>{" "}
              {todayDuty.split_assignee_id ? "Yes" : "No"}
            </div>

            {todayDuty.split_assignee_id && (
              <div>
                <strong>Status:</strong>{" "}
                {todayDuty.split_completed ? "Completed" : "Pending"}
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