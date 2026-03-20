"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase";

type Member = {
  id: string;
  full_name: string;
  email: string;
};

type SplitRow = {
  id: string;
  split_number: number;
  flow_plate_count: number;
  maintenance_plate_count: number;
  status: "open" | "completed" | "cancelled";
};

type SplitSummary = {
  user_plates: number;
  maintenance: number;
  flow: number;
  total: number;
};

type SplitCardData = SplitRow & {
  summary: SplitSummary;
  myRegistration: number | null;
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
      .select("id, split_number, flow_plate_count, maintenance_plate_count, status")
      .eq("status", "open")
      .order("split_number", { ascending: true });

    if (splitsError) {
      console.error("Could not load open passages:", splitsError);
      setSplits([]);
      return;
    }

    const rows = (splitRows ?? []) as SplitRow[];

    const cards = await Promise.all(
      rows.map(async (row) => {
        const summary = await loadSplitSummary(row.id);
        const myRegistration = member ? await loadMyRegistration(row.id, member.id) : null;

        return {
          ...row,
          summary,
          myRegistration,
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

  async function saveRegistration(splitId: string) {
    if (!loggedInMember) {
      alert("You must be signed in to register plates.");
      return;
    }

    const count = Number(platesInput);

    if (!Number.isInteger(count) || count <= 0) {
      alert("Please enter a whole number greater than 0.");
      return;
    }

    setSavingSplitId(splitId);

    const { error } = await supabase.rpc("upsert_split_registration", {
      p_split_id: splitId,
      p_member_id: loggedInMember.id,
      p_plates_count: count,
    });

    if (error) {
      console.error("Could not save registration:", error);
      alert("Failed to save registration.");
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

    setSavingSplitId(splitId);

    const { error } = await supabase.rpc("delete_split_registration", {
      p_split_id: splitId,
      p_member_id: loggedInMember.id,
    });

    if (error) {
      console.error("Could not delete registration:", error);
      alert("Failed to delete registration.");
      setSavingSplitId(null);
      return;
    }

    await loadOpenSplits(loggedInMember);
    closeRegistrationEditor();
    setSavingSplitId(null);
  }

  async function saveFlow(splitId: string) {
    const count = Number(flowInput);

    if (!Number.isInteger(count) || count < 0) {
      alert("Please enter a whole number of 0 or more.");
      return;
    }

    setSavingSplitId(splitId);

    const { error } = await supabase.rpc("update_split_flow", {
      p_split_id: splitId,
      p_flow_count: count,
    });

    if (error) {
      console.error("Could not update flow:", error);
      alert("Failed to update flow.");
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
          <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 10 }}>
            Passage #{split.split_number}
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
    flowInput,
    loading,
    loggedInMember,
    platesInput,
    savingSplitId,
    splits,
  ]);

  return (
    <div style={{ padding: 20, maxWidth: 900, margin: "0 auto" }}>
      <h1 style={{ marginBottom: 8 }}>Open Passages</h1>
      <p style={{ marginTop: 0, marginBottom: 24, color: "#555" }}>
        Register plates for each passage and manage flow plates.
      </p>

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

      <div
        style={{
          border: "1px solid #d0d7de",
          borderRadius: 12,
          padding: 16,
          marginBottom: 24,
          background: "#fff",
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>Reset Passages</div>

        <label
          htmlFor="resetStartNumber"
          style={{ display: "block", marginBottom: 8, fontWeight: 600 }}
        >
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

        <div style={{ marginTop: 12 }}>
          <button
            onClick={() => void handleReset()}
            disabled={!loggedInMember || resetting}
            style={buttonStyle(!loggedInMember || resetting)}
          >
            {resetting ? "Resetting..." : "Reset Passages"}
          </button>
        </div>
      </div>

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

const inputStyle: React.CSSProperties = {
  width: 140,
  padding: 8,
  borderRadius: 8,
  border: "1px solid #ccc",
};