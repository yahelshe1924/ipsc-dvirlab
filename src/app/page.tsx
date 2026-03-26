"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

type Member = {
  id: string;
  full_name: string;
  email: string;
};

type SplitRow = {
  id: string;
  batch_id: string;
  split_number: number;
  status: "open" | "completed" | "cancelled";
  performed_date: string | null;
  completed_at: string | null;
  completed_by_member_id: string | null;
  duty_assignment_id: string | null;
  maintenance_plate_count: number;
  flow_plate_count: number;
  actual_plate_count: number | null;
  created_at: string;
};

type SplitSummary = {
  user_plates: number;
  maintenance: number;
  flow: number;
  total: number;
};

type SplitRegistrationRow = {
  member_id: string;
  plates_count: number;
  members: {
    full_name: string;
  } | null;
};

type SplitRegistrationItem = {
  member_id: string;
  member_name: string;
  plates_count: number;
};

type SplitCardData = SplitRow & {
  summary: SplitSummary;
  myRegistration: number | null;
  registrations: SplitRegistrationItem[];
};

export default function SplitsPage() {
  const supabase = createClient();

  const [loggedInMember, setLoggedInMember] = useState<Member | null>(null);
  const [splits, setSplits] = useState<SplitCardData[]>([]);
  const [loading, setLoading] = useState(true);

  const [savingSplitId, setSavingSplitId] = useState<string | null>(null);

  const [editingSplitId, setEditingSplitId] = useState<string | null>(null);
  const [platesInput, setPlatesInput] = useState<string>("1");

  const [editingFlowSplitId, setEditingFlowSplitId] = useState<string | null>(null);
  const [flowInput, setFlowInput] = useState<string>("0");

  const [expandedRegistrationsSplitId, setExpandedRegistrationsSplitId] = useState<string | null>(null);

  const [resetting, setResetting] = useState(false);
  const [resetStartNumber, setResetStartNumber] = useState<string>("11");

  useEffect(() => {
    void initializePage();
  }, []);

  async function initializePage() {
    setLoading(true);
    try {
      const member = await loadLoggedInMember();
      setLoggedInMember(member);
      await loadOpenSplits(member);
    } finally {
      setLoading(false);
    }
  }

  async function loadLoggedInMember(): Promise<Member | null> {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user?.email) {
      console.error("Could not get auth user:", authError);
      return null;
    }

    const { data, error } = await supabase
      .from("members")
      .select("id, full_name, email")
      .eq("email", user.email)
      .maybeSingle();

    if (error) {
      console.error("Could not load member:", error);
      return null;
    }

    return data ?? null;
  }

  async function loadOpenSplits(member: Member | null) {
    const { data: splitRows, error: splitsError } = await supabase
      .from("splits")
      .select(
        [
          "id",
          "batch_id",
          "split_number",
          "status",
          "performed_date",
          "completed_at",
          "completed_by_member_id",
          "duty_assignment_id",
          "maintenance_plate_count",
          "flow_plate_count",
          "actual_plate_count",
          "created_at",
        ].join(", ")
      )
      .eq("status", "open")
      .order("split_number", { ascending: true })
      .returns<SplitRow[]>();

    if (splitsError) {
      console.error("Could not load open passages:", splitsError);
      setSplits([]);
      return;
    }

    const rows = splitRows ?? [];

    const cards = await Promise.all(
      rows.map(async (row) => {
        const [summary, myRegistration, registrations] = await Promise.all([
          loadSplitSummary(row.id),
          member ? loadMyRegistration(row.id, member.id) : Promise.resolve(null),
          loadSplitRegistrations(row.id),
        ]);

        return {
          ...row,
          summary,
          myRegistration,
          registrations,
        } satisfies SplitCardData;
      })
    );

    setSplits(cards);
  }

  async function loadSplitSummary(splitId: string): Promise<SplitSummary> {
    const { data, error } = await supabase.rpc("get_split_summary", {
      p_split_id: splitId,
    });

    if (error) {
      console.error(`Could not load summary for split ${splitId}:`, error);
      return {
        user_plates: 0,
        maintenance: 1,
        flow: 0,
        total: 1,
      };
    }

    const row = Array.isArray(data) ? data[0] : data;

    return {
      user_plates: Number(row?.user_plates ?? 0),
      maintenance: Number(row?.maintenance ?? 1),
      flow: Number(row?.flow ?? 0),
      total: Number(row?.total ?? 1),
    };
  }

  async function loadMyRegistration(splitId: string, memberId: string): Promise<number | null> {
    const { data, error } = await supabase
      .from("split_registrations")
      .select("plates_count")
      .eq("split_id", splitId)
      .eq("member_id", memberId)
      .maybeSingle();

    if (error) {
      console.error(`Could not load registration for split ${splitId}:`, error);
      return null;
    }

    return data?.plates_count ?? null;
  }

  async function loadSplitRegistrations(splitId: string): Promise<SplitRegistrationItem[]> {
    const { data, error } = await supabase
      .from("split_registrations")
      .select("member_id, plates_count, members(full_name)")
      .eq("split_id", splitId)
      .order("plates_count", { ascending: false })
      .returns<SplitRegistrationRow[]>();

    if (error) {
      console.error(`Could not load registrations for split ${splitId}:`, error);
      return [];
    }

    return (data ?? []).map((row) => ({
      member_id: row.member_id,
      member_name: row.members?.full_name ?? "Unknown member",
      plates_count: row.plates_count,
    }));
  }

  function openRegistrationEditor(splitId: string, currentCount: number | null) {
    setEditingSplitId(splitId);
    setPlatesInput(String(currentCount ?? 1));
  }

  function closeRegistrationEditor() {
    setEditingSplitId(null);
    setPlatesInput("1");
  }

  function openFlowEditor(splitId: string, currentFlow: number) {
    setEditingFlowSplitId(splitId);
    setFlowInput(String(currentFlow));
  }

  function closeFlowEditor() {
    setEditingFlowSplitId(null);
    setFlowInput("0");
  }

  function toggleRegistrations(splitId: string) {
    setExpandedRegistrationsSplitId((prev) => (prev === splitId ? null : splitId));
  }

  function findSplitCard(splitId: string): SplitCardData | null {
    return splits.find((s) => s.id === splitId) ?? null;
  }

  function findPrevSplitCard(split: SplitCardData): SplitCardData | null {
    return (
      splits.find(
        (s) =>
          s.batch_id === split.batch_id &&
          s.split_number === split.split_number - 1
      ) ?? null
    );
  }

  function findNextSplitCard(split: SplitCardData): SplitCardData | null {
    return (
      splits.find(
        (s) =>
          s.batch_id === split.batch_id &&
          s.split_number === split.split_number + 1
      ) ?? null
    );
  }


  function parsePositiveInt(value: string): number | null {
    const n = Number(value);
    if (!Number.isInteger(n) || n <= 0) return null;
    return n;
  }

  function parseNonNegativeInt(value: string): number | null {
    const n = Number(value);
    if (!Number.isInteger(n) || n < 0) return null;
    return n;
  }

  function previewRegistrationChange(
    splitId: string,
    desiredMyRegistration: number
  ): SplitValidationResult | null {
    const split = findSplitCard(splitId);
    if (!split) return null;

    const prevSplit = findPrevSplitCard(split);
    const nextSplit = findNextSplitCard(split);

    const currentMyRegistration = split.myRegistration ?? 0;
    const currentUserPlates = split.summary.user_plates;

    const newActual =
      currentUserPlates - currentMyRegistration + desiredMyRegistration;

    const newCounts: SplitCounts = {
      actual: Math.max(0, newActual),
      flow: split.summary.flow,
      maintenance: split.summary.maintenance,
    };

    return validateSplitChange({
      currentSplit: cardToSplitRecord(split),
      newCurrentCounts: newCounts,
      prevSplit: prevSplit ? cardToSplitRecord(prevSplit) : null,
      nextSplit: nextSplit ? cardToSplitRecord(nextSplit) : null,
    });
  }

  function previewFlowChange(
    splitId: string,
    desiredFlowCount: number
  ): SplitValidationResult | null {
    const split = findSplitCard(splitId);
    if (!split) return null;

    const prevSplit = findPrevSplitCard(split);
    const nextSplit = findNextSplitCard(split);

    const newCounts: SplitCounts = {
      actual: split.summary.user_plates,
      flow: desiredFlowCount,
      maintenance: split.summary.maintenance,
    };

    return validateSplitChange({
      currentSplit: cardToSplitRecord(split),
      newCurrentCounts: newCounts,
      prevSplit: prevSplit ? cardToSplitRecord(prevSplit) : null,
      nextSplit: nextSplit ? cardToSplitRecord(nextSplit) : null,
    });
  }

  async function saveRegistration(splitId: string) {
    if (!loggedInMember) {
      alert("You must be signed in to register plates.");
      return;
    }

    const count = parsePositiveInt(platesInput);

    if (count === null) {
      alert("Please enter a whole number greater than 0.");
      return;
    }

    const preview = previewRegistrationChange(splitId, count);

    if (preview && !preview.allowed) {
      alert(preview.error || "This change is not allowed.");
      return;
    }

    if (preview?.warning) {
      const confirmed = window.confirm(preview.warning);
      if (!confirmed) return;
    }

    setSavingSplitId(splitId);

    const { error } = await supabase.rpc("upsert_split_registration", {
      p_split_id: splitId,
      p_member_id: loggedInMember.id,
      p_plates_count: count,
    });

    if (error) {
      console.error("Could not save registration:", error);
      alert(error.message || "Failed to save registration.");
      setSavingSplitId(null);
      return;
    }

    await loadOpenSplits(loggedInMember);
    closeRegistrationEditor();
    setSavingSplitId(null);
  }

  async function deleteRegistration(splitId: string) {
    if (!loggedInMember) {
      alert("You must be signed in to delete a registration.");
      return;
    }

    const preview = previewRegistrationChange(splitId, 0);

    if (preview && !preview.allowed) {
      alert(preview.error || "This change is not allowed.");
      return;
    }

    if (preview?.warning) {
      const confirmed = window.confirm(preview.warning);
      if (!confirmed) return;
    }

    setSavingSplitId(splitId);

    const { error } = await supabase.rpc("delete_split_registration", {
      p_split_id: splitId,
      p_member_id: loggedInMember.id,
    });

    if (error) {
      console.error("Could not delete registration:", error);
      alert(error.message || "Failed to delete registration.");
      setSavingSplitId(null);
      return;
    }

    await loadOpenSplits(loggedInMember);
    closeRegistrationEditor();
    setSavingSplitId(null);
  }

  async function saveFlow(splitId: string) {
    const count = parseNonNegativeInt(flowInput);

    if (count === null) {
      alert("Please enter a whole number of 0 or more.");
      return;
    }

    const preview = previewFlowChange(splitId, count);

    if (preview && !preview.allowed) {
      alert(preview.error || "This change is not allowed.");
      return;
    }

    if (preview?.warning) {
      const confirmed = window.confirm(preview.warning);
      if (!confirmed) return;
    }

    setSavingSplitId(splitId);

    const { error } = await supabase.rpc("update_split_flow", {
      p_split_id: splitId,
      p_flow_count: count,
    });

    if (error) {
      console.error("Could not update flow:", error);
      alert(error.message || "Failed to update flow.");
      setSavingSplitId(null);
      return;
    }

    await loadOpenSplits(loggedInMember);
    closeFlowEditor();
    setSavingSplitId(null);
  }

  async function handleReset() {
    if (!loggedInMember) {
      alert("You must be signed in to reset passages.");
      return;
    }

    const startNumber = Number(resetStartNumber);

    if (!Number.isInteger(startNumber) || startNumber <= 0 || startNumber > 40) {
      alert("Please enter a valid start passage number between 1 and 40.");
      return;
    }

    const confirmed = window.confirm(
      `Resetting passages will close the current active batch and cancel all open passages that were not completed.\n\nA new batch will be created from Passage #${startNumber} to Passage #40.\n\nAre you sure you want to continue?`
    );

    if (!confirmed) return;

    setResetting(true);

    const { error } = await supabase.rpc("create_split_batch", {
      start_number: startNumber,
      user_id: loggedInMember.id,
    });

    if (error) {
      console.error("Could not reset passages:", error);
      alert("Failed to reset passages.");
      setResetting(false);
      return;
    }

    await loadOpenSplits(loggedInMember);
    setResetting(false);
  }

  const content = useMemo(() => {
    if (loading) {
      return <p>Loading open passages...</p>;
    }

    if (splits.length === 0) {
      return <p>No open passages found.</p>;
    }

    return splits.map((split) => {
      const isRegistrationEditing = editingSplitId === split.id;
      const isFlowEditing = editingFlowSplitId === split.id;
      const isSaving = savingSplitId === split.id;
      const isRegistrationsExpanded = expandedRegistrationsSplitId === split.id;

      const registrationPreview =
        isRegistrationEditing && parsePositiveInt(platesInput) !== null
          ? previewRegistrationChange(split.id, Number(platesInput))
          : null;

      const flowPreview =
        isFlowEditing && parseNonNegativeInt(flowInput) !== null
          ? previewFlowChange(split.id, Number(flowInput))
          : null;

      return (
        <div
          key={split.id}
          style={{
            border: "1px solid #d0d7de",
            borderRadius: 12,
            padding: 16,
            marginBottom: 16,
            background: "#fff",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: 12,
              marginBottom: 12,
            }}
          >
            <div style={{ fontSize: 20, fontWeight: 700 }}>
              Passage #{split.split_number}
            </div>

            <button
              onClick={() => toggleRegistrations(split.id)}
              style={buttonStyle(false)}
            >
              {isRegistrationsExpanded ? "Hide Registrations" : "View Registrations"}
            </button>
          </div>

          <div style={{ marginBottom: 6 }}>User plates: {split.summary.user_plates}</div>
          <div style={{ marginBottom: 6 }}>Maintenance: {split.summary.maintenance}</div>
          <div style={{ marginBottom: 6 }}>Flow: {split.summary.flow}</div>
          <div style={{ marginBottom: 12, fontWeight: 700 }}>Total: {split.summary.total}</div>

          <div style={{ marginBottom: 12 }}>
            My registration:{" "}
            <strong>
              {split.myRegistration !== null ? `${split.myRegistration} plates` : "Not registered"}
            </strong>
          </div>

          {isRegistrationsExpanded && (
            <div style={registrationsBoxStyle}>
              <div style={{ fontWeight: 700, marginBottom: 10 }}>Registrations</div>

              {split.registrations.length === 0 ? (
                <div style={{ color: "#64748b" }}>No registrations yet.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {split.registrations.map((registration) => (
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
          )}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            <button
              onClick={() => openRegistrationEditor(split.id, split.myRegistration)}
              disabled={!loggedInMember || isSaving}
              style={buttonStyle(!loggedInMember || isSaving)}
            >
              {split.myRegistration !== null ? "Edit Registration" : "Register Plates"}
            </button>

            <button
              onClick={() => openFlowEditor(split.id, split.flow_plate_count)}
              disabled={isSaving}
              style={buttonStyle(isSaving)}
            >
              Update Flow
            </button>
          </div>

          {isRegistrationEditing && (
            <div
              style={{
                marginTop: 10,
                padding: 12,
                border: "1px solid #e5e7eb",
                borderRadius: 10,
                background: "#fafafa",
                marginBottom: 12,
              }}
            >
              <label
                htmlFor={`plates-${split.id}`}
                style={{ display: "block", marginBottom: 8, fontWeight: 600 }}
              >
                Number of plates
              </label>

              <input
                id={`plates-${split.id}`}
                type="number"
                min={1}
                step={1}
                value={platesInput}
                onChange={(e) => setPlatesInput(e.target.value)}
                style={inputStyle}
              />

              {registrationPreview?.error && (
                <div style={errorBoxStyle}>{registrationPreview.error}</div>
              )}

              {!registrationPreview?.error && registrationPreview?.warning && (
                <div style={warningBoxStyle}>{registrationPreview.warning}</div>
              )}

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                <button
                  onClick={() => void saveRegistration(split.id)}
                  disabled={isSaving}
                  style={buttonStyle(isSaving)}
                >
                  {isSaving ? "Saving..." : "Save"}
                </button>

                {split.myRegistration !== null && (
                  <button
                    onClick={() => void deleteRegistration(split.id)}
                    disabled={isSaving}
                    style={buttonStyle(isSaving)}
                  >
                    Delete Registration
                  </button>
                )}

                <button
                  onClick={closeRegistrationEditor}
                  disabled={isSaving}
                  style={buttonStyle(isSaving)}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {isFlowEditing && (
            <div
              style={{
                marginTop: 10,
                padding: 12,
                border: "1px solid #e5e7eb",
                borderRadius: 10,
                background: "#fafafa",
              }}
            >
              <label
                htmlFor={`flow-${split.id}`}
                style={{ display: "block", marginBottom: 8, fontWeight: 600 }}
              >
                Flow plates
              </label>

              <input
                id={`flow-${split.id}`}
                type="number"
                min={0}
                step={1}
                value={flowInput}
                onChange={(e) => setFlowInput(e.target.value)}
                style={inputStyle}
              />

              {flowPreview?.error && <div style={errorBoxStyle}>{flowPreview.error}</div>}

              {!flowPreview?.error && flowPreview?.warning && (
                <div style={warningBoxStyle}>{flowPreview.warning}</div>
              )}

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                <button
                  onClick={() => void saveFlow(split.id)}
                  disabled={isSaving}
                  style={buttonStyle(isSaving)}
                >
                  {isSaving ? "Saving..." : "Save Flow"}
                </button>

                <button
                  onClick={closeFlowEditor}
                  disabled={isSaving}
                  style={buttonStyle(isSaving)}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      );
    });
  }, [
    editingFlowSplitId,
    editingSplitId,
    expandedRegistrationsSplitId,
    flowInput,
    loading,
    loggedInMember,
    platesInput,
    savingSplitId,
    splits,
  ]);

  return (
    <div style={{ padding: 20, maxWidth: 900, margin: "0 auto" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 16,
          marginBottom: 24,
        }}
      >
        <div>
          <h1 style={{ margin: 0 }}>Open Passages</h1>
          <p style={{ marginTop: 8, marginBottom: 0, color: "#555" }}>
            Register plates for each passage and manage flow plates.
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
          <button
            onClick={() => void handleReset()}
            disabled={!loggedInMember || resetting}
            style={resetButtonStyle(!loggedInMember || resetting)}
          >
            {resetting ? "Resetting..." : "Reset Passages"}
          </button>

          <label htmlFor="resetStartNumber" style={{ fontWeight: 600 }}>
            New start passage number
          </label>

          <input
            id="resetStartNumber"
            type="number"
            min={1}
            max={40}
            step={1}
            value={resetStartNumber}
            onChange={(e) => setResetStartNumber(e.target.value)}
            style={inputStyle}
          />
        </div>
      </div>

      {!loggedInMember && (
        <div
          style={{
            marginBottom: 16,
            padding: 12,
            borderRadius: 10,
            background: "#fff8e1",
            border: "1px solid #f0d98a",
          }}
        >
          You are not mapped to a member record, so some actions are currently disabled.
        </div>
      )}

      {content}
    </div>
  );
}

function buttonStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid #ccc",
    cursor: disabled ? "not-allowed" : "pointer",
    background: disabled ? "#eee" : "#f6f8fa",
  };
}

function resetButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: "10px 16px",
    borderRadius: 8,
    border: "1px solid #b91c1c",
    cursor: disabled ? "not-allowed" : "pointer",
    background: disabled ? "#fca5a5" : "#dc2626",
    color: "#ffffff",
    fontWeight: 700,
    whiteSpace: "nowrap",
  };
}

const inputStyle: React.CSSProperties = {
  width: 140,
  padding: 8,
  borderRadius: 8,
  border: "1px solid #ccc",
};

const warningBoxStyle: React.CSSProperties = {
  marginTop: 12,
  padding: 10,
  borderRadius: 8,
  background: "#fff8e1",
  border: "1px solid #f0d98a",
  color: "#7a5d00",
  lineHeight: 1.4,
};

const errorBoxStyle: React.CSSProperties = {
  marginTop: 12,
  padding: 10,
  borderRadius: 8,
  background: "#fef2f2",
  border: "1px solid #fecaca",
  color: "#b91c1c",
  lineHeight: 1.4,
};

const registrationsBoxStyle: React.CSSProperties = {
  marginBottom: 12,
  padding: 12,
  border: "1px solid #e5e7eb",
  borderRadius: 10,
  background: "#fafafa",
};

const registrationRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  padding: "8px 10px",
  borderRadius: 8,
  background: "#ffffff",
  border: "1px solid #e5e7eb",
};