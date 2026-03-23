"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase";

type MemberRow = {
  id: string;
  full_name: string;
  medium_replacement_calendar_enabled: boolean;
};

export default function SettingsPage() {
  const supabase = createClient();
  const router = useRouter();

  const [member, setMember] = useState<MemberRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError(null);

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user?.email) {
        router.replace("/");
        router.refresh();
        return;
      }

      const { data, error } = await supabase
        .from("members")
        .select("id, full_name, medium_replacement_calendar_enabled")
        .eq("email", user.email)
        .single();

      if (error || !data) {
        setError("Could not load user settings.");
        setLoading(false);
        return;
      }

      setMember(data);
      setLoading(false);
    }

    loadData();
  }, [router, supabase]);

  async function handleToggleCalendar(value: boolean) {
    if (!member) return;

    setSaving(true);
    setError(null);

    const { error } = await supabase
      .from("members")
      .update({ medium_replacement_calendar_enabled: value })
      .eq("id", member.id);

    if (error) {
      setError("Failed to save settings.");
      setSaving(false);
      return;
    }

    setMember({
      ...member,
      medium_replacement_calendar_enabled: value,
    });

    setSaving(false);
  }

  async function handleLogout() {
    setLoggingOut(true);
    setError(null);

    const { error } = await supabase.auth.signOut();

    if (error) {
      setError("Failed to log out.");
      setLoggingOut(false);
      return;
    }

    router.replace("/login");
    router.refresh();
  }

  if (loading) {
    return (
      <main style={pageStyle}>
        <div style={cardStyle}>Loading settings...</div>
      </main>
    );
  }

  return (
    <main style={pageStyle}>
      <div style={containerStyle}>
        <div style={topRowStyle}>
          <h1 style={titleStyle}>Settings</h1>
          <Link href="/" style={backLinkStyle}>
            Back to Home
          </Link>
        </div>

        <div style={cardStyle}>
          <div style={sectionTitleStyle}>Account</div>
          <div style={rowStyle}>
            <div>
              <div style={labelStyle}>Signed in as</div>
              <div style={valueStyle}>{member?.full_name ?? "Unknown user"}</div>
            </div>

            <button
              onClick={handleLogout}
              disabled={loggingOut}
              style={dangerButtonStyle(loggingOut)}
            >
              {loggingOut ? "Logging out..." : "Log out"}
            </button>
          </div>
        </div>

        <div style={cardStyle}>
          <div style={sectionTitleStyle}>Calendar preferences</div>

          <div style={toggleRowStyle}>
            <div>
              <div style={labelStyle}>Add medium replacement events to my calendar</div>
              <div style={hintStyle}>
                When you register as a medium replacement, the app can automatically
                create a calendar event only for your user.
              </div>
            </div>

            <label style={switchLabelStyle}>
              <input
                type="checkbox"
                checked={!!member?.medium_replacement_calendar_enabled}
                onChange={(e) => handleToggleCalendar(e.target.checked)}
                disabled={saving}
                style={checkboxStyle}
              />
              <span>
                {member?.medium_replacement_calendar_enabled ? "On" : "Off"}
              </span>
            </label>
          </div>
        </div>

        {error && <div style={errorStyle}>{error}</div>}
      </div>
    </main>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "#f6f7fb",
  padding: "32px 16px",
};

const containerStyle: React.CSSProperties = {
  maxWidth: 800,
  margin: "0 auto",
  display: "grid",
  gap: 16,
};

const topRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 28,
  fontWeight: 700,
};

const backLinkStyle: React.CSSProperties = {
  textDecoration: "none",
  color: "#334155",
  fontWeight: 600,
};

const cardStyle: React.CSSProperties = {
  background: "#ffffff",
  borderRadius: 16,
  padding: 20,
  boxShadow: "0 6px 24px rgba(15, 23, 42, 0.06)",
  border: "1px solid #e5e7eb",
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 700,
  marginBottom: 16,
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 16,
  flexWrap: "wrap",
};

const toggleRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 16,
  flexWrap: "wrap",
};

const labelStyle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 600,
  color: "#111827",
};

const valueStyle: React.CSSProperties = {
  marginTop: 6,
  fontSize: 15,
  color: "#4b5563",
};

const hintStyle: React.CSSProperties = {
  marginTop: 6,
  fontSize: 14,
  color: "#6b7280",
  maxWidth: 520,
  lineHeight: 1.5,
};

const switchLabelStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  fontWeight: 700,
  color: "#111827",
};

const checkboxStyle: React.CSSProperties = {
  width: 18,
  height: 18,
};

const dangerButtonStyle = (disabled: boolean): React.CSSProperties => ({
  border: "none",
  borderRadius: 10,
  padding: "10px 16px",
  fontWeight: 700,
  cursor: disabled ? "not-allowed" : "pointer",
  background: disabled ? "#fecaca" : "#dc2626",
  color: "#ffffff",
});

const errorStyle: React.CSSProperties = {
  background: "#fee2e2",
  color: "#991b1b",
  border: "1px solid #fecaca",
  padding: "12px 14px",
  borderRadius: 12,
};