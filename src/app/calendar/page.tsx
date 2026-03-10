"use client";
/**
 * app/calendar/page.tsx
 */

import { useEffect, useState, useCallback } from "react";
import Calendar from "@/components/Calendar";
import DayModal from "@/components/DayModal";
import { createClient } from "@/lib/supabase";
import type { DutyAssignment, Member } from "@/types";

export default function CalendarPage() {
  const supabase = createClient();
  const today = new Date();

  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [duties, setDuties] = useState<Record<string, DutyAssignment>>({});
  const [members, setMembers] = useState<Member[]>([]);
  const [loggedIn, setLoggedIn] = useState<Member | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Load members + logged-in user
  useEffect(() => {
    supabase
      .from("members")
      .select("*")
      .order("full_name")
      .then(({ data }) => {
        if (data) setMembers(data as Member[]);
      });

    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user?.email) return;

      const { data } = await supabase
        .from("members")
        .select("*")
        .eq("email", user.email)
        .eq("active", true)
        .single();

      if (data) {
        setLoggedIn(data as Member);
      } else {
        await supabase.auth.signOut();
        alert("Your email is not authorized to use this application.");
      }
    });
  }, [supabase]);

  // Load duties for visible month (+1 extra day for tomorrow lookups)
  const loadDuties = useCallback(
    async (y: number, m: number) => {
      setLoading(true);

      const from = `${y}-${String(m + 1).padStart(2, "0")}-01`;
      const nextMonth = new Date(y, m + 1, 2);
      const to = `${nextMonth.getFullYear()}-${String(
        nextMonth.getMonth() + 1
      ).padStart(2, "0")}-02`;

      const { data, error } = await supabase
        .from("calendar_feed")
        .select("*")
        .gte("duty_date", from)
        .lte("duty_date", to);

      if (error) {
        console.error("Error loading calendar_feed:", error);
      }

      const map: Record<string, DutyAssignment> = {};
      if (data) {
        (data as DutyAssignment[]).forEach((d) => {
          map[d.duty_date] = d;
        });
      }

      setDuties(map);
      setLoading(false);
    },
    [supabase]
  );

  useEffect(() => {
    loadDuties(year, month);
  }, [year, month, loadDuties]);

  function handleMonthChange(dir: -1 | 1) {
    const d = new Date(year, month + dir, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  }

  async function handleGoogleSignIn() {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: "http://localhost:3000/calendar",
      },
    });
  }

  // Save / upsert a duty
  async function handleSave(dateKey: string, patch: Partial<DutyAssignment>) {
    const old = duties[dateKey];
    const oldMemberId = old?.member_id ?? null;
    const newMemberId = patch.member_id ?? null;

    const { data, error } = await supabase
      .from("duty_assignments")
      .upsert({ duty_date: dateKey, ...patch }, { onConflict: "duty_date" })
      .select()
      .single();

    if (error) {
      console.error("Error saving duty:", error);
      return;
    }

    setDuties((prev) => ({ ...prev, [dateKey]: data as DutyAssignment }));

    if (oldMemberId !== newMemberId && loggedIn) {
      await supabase.from("assignment_audit").insert({
        duty_date: dateKey,
        old_member_id: oldMemberId,
        new_member_id: newMemberId,
        changed_by_id: loggedIn.id,
      });
    }
  }

  async function handleRemoveAssignment(dateKey: string) {
    await handleSave(dateKey, { member_id: null, volume_ml: null, notes: "" });
  }

  // Tomorrow assignee for WhatsApp message
  function getTomorrowAssigneeName(dateKey: string): string | null {
    const [y, m, d] = dateKey.split("-").map(Number);
    const tmr = new Date(y, m - 1, d + 1);
    const tmrKey = `${tmr.getFullYear()}-${String(
      tmr.getMonth() + 1
    ).padStart(2, "0")}-${String(tmr.getDate()).padStart(2, "0")}`;

    const tmrDuty = duties[tmrKey];
    if (!tmrDuty?.member_id) return null;

    return members.find((m) => m.id === tmrDuty.member_id)?.full_name ?? null;
  }

  if (loading && members.length === 0) {
    return <div style={{ padding: 32, color: "#94a3b8" }}>Loading...</div>;
  }

  if (!loggedIn) {
    return (
      <div style={{ padding: 32 }}>
        <h1 style={{ marginBottom: 16 }}>iPSC-DvirLab</h1>
        <p style={{ marginBottom: 16, color: "#64748b" }}>
          Please sign in with Google to manage calendar assignments.
        </p>
        <button
          onClick={handleGoogleSignIn}
          style={{
            padding: "10px 16px",
            borderRadius: 8,
            border: "1px solid #cbd5e1",
            background: "white",
            cursor: "pointer",
            fontSize: 14,
          }}
        >
          Sign in with Google
        </button>
      </div>
    );
  }

  return (
    <div>
      {loading && (
        <div
          style={{
            textAlign: "center",
            color: "#94a3b8",
            fontSize: 13,
            padding: "8px 0",
          }}
        >
          Loading...
        </div>
      )}

      <Calendar
        year={year}
        month={month}
        duties={duties}
        members={members}
        loggedInMemberId={loggedIn?.id ?? ""}
        onMonthChange={handleMonthChange}
        onDayClick={setOpenKey}
      />

      {openKey && loggedIn && (
        <DayModal
          dateKey={openKey}
          duty={duties[openKey] ?? null}
          members={members}
          loggedInMember={loggedIn}
          tomorrowAssigneeName={getTomorrowAssigneeName(openKey)}
          onClose={() => setOpenKey(null)}
          onSave={handleSave}
          onRemoveAssignment={handleRemoveAssignment}
        />
      )}
    </div>
  );
}