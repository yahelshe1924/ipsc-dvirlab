"use client";
/**
 * src/app/people/page.tsx
 * -----------------------
 * Enhanced People management page
 */

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase";
import { getColor } from "@/lib/colors";
import type { Member } from "@/types";

type EditableMember = Member & {
  isEditing?: boolean;
  draft_name?: string;
  draft_email?: string;
  draft_color_index?: number;
};

const COLOR_OPTIONS = Array.from({ length: 16 }, (_, i) => i);

export default function PeoplePage() {
  const supabase = createClient();

  const [members, setMembers] = useState<EditableMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newColorIndex, setNewColorIndex] = useState(0);

  const [savingNew, setSavingNew] = useState(false);

  async function loadMembers() {
    setLoading(true);

    const { data, error } = await supabase
      .from("members")
      .select("*")
      .order("full_name");

    if (error) {
      console.error("Error loading members:", error);
    }

    if (data) {
      setMembers(
        (data as Member[]).map((m) => ({
          ...m,
          isEditing: false,
          draft_name: m.full_name,
          draft_email: m.email,
          draft_color_index: m.color_index,
        }))
      );
    }

    setLoading(false);
  }

  useEffect(() => {
    loadMembers();
  }, []);

  const filteredMembers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return members;

    return members.filter(
      (m) =>
        m.full_name.toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q)
    );
  }, [members, search]);

  function startEdit(id: string) {
    setMembers((prev) =>
      prev.map((m) =>
        m.id === id
          ? {
              ...m,
              isEditing: true,
              draft_name: m.full_name,
              draft_email: m.email,
              draft_color_index: m.color_index,
            }
          : m
      )
    );
  }

  function cancelEdit(id: string) {
    setMembers((prev) =>
      prev.map((m) =>
        m.id === id
          ? {
              ...m,
              isEditing: false,
              draft_name: m.full_name,
              draft_email: m.email,
              draft_color_index: m.color_index,
            }
          : m
      )
    );
  }

  function updateDraft(
    id: string,
    field: "draft_name" | "draft_email" | "draft_color_index",
    value: string | number
  ) {
    setMembers((prev) =>
      prev.map((m) =>
        m.id === id
          ? {
              ...m,
              [field]: value,
            }
          : m
      )
    );
  }

  async function saveEdit(member: EditableMember) {
    const full_name = (member.draft_name ?? "").trim();
    const email = (member.draft_email ?? "").trim().toLowerCase().replace(/\s/g, "");
    const color_index = Number(member.draft_color_index ?? 0);

    if (!full_name || !email) {
      alert("Name and email are required.");
      return;
    }

    const { error } = await supabase
      .from("members")
      .update({
        full_name,
        email,
        color_index,
      })
      .eq("id", member.id);

    if (error) {
      console.error("Error updating member:", error);
      alert(error.message || "Failed to update member.");
      return;
    }

    await loadMembers();
  }

  async function addMember() {
    const full_name = newName.trim();
    const email = newEmail.trim().toLowerCase().replace(/\s/g, "");

    if (!full_name || !email) {
      alert("Please fill in both name and email.");
      return;
    }

    setSavingNew(true);

    const { error } = await supabase.from("members").insert({
      full_name,
      email,
      active: true,
      color_index: Number(newColorIndex),
    });

    setSavingNew(false);

    if (error) {
      console.error("Error adding member:", error);
      alert(error.message || "Failed to add member.");
      return;
    }

    setNewName("");
    setNewEmail("");
    setNewColorIndex(0);

    await loadMembers();
  }

  async function toggleActive(member: EditableMember) {
    const { error } = await supabase
      .from("members")
      .update({ active: !member.active })
      .eq("id", member.id);

    if (error) {
      console.error("Error toggling active status:", error);
      alert(error.message || "Failed to update active status.");
      return;
    }

    await loadMembers();
  }

  if (loading) {
    return (
      <div style={page}>
        <h1 style={title}>People</h1>
        <p style={muted}>Loading...</p>
      </div>
    );
  }

  return (
    <div style={page}>
      <div style={headerRow}>
        <div>
          <h1 style={title}>Lab Members</h1>
          <p style={subtitle}>
            Manage active members, emails, and fixed display colors.
          </p>
        </div>
      </div>

      <div style={card}>
        <div style={sectionTitle}>Add new member</div>

        <div style={formRow}>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Full name"
            style={input}
          />

          <input
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="Email"
            style={input}
          />

          <select
            value={newColorIndex}
            onChange={(e) => setNewColorIndex(Number(e.target.value))}
            style={select}
          >
            {COLOR_OPTIONS.map((idx) => (
              <option key={idx} value={idx}>
                Color {idx}
              </option>
            ))}
          </select>

          <div style={colorPreviewWrap}>
            <span style={labelSmall}>Preview</span>
            <span
              style={{
                ...pill,
                background: getColor(newColorIndex).bg,
                color: getColor(newColorIndex).text,
              }}
            >
              {newName || "New member"}
            </span>
          </div>

          <button onClick={addMember} style={primaryButton} disabled={savingNew}>
            {savingNew ? "Adding..." : "Add member"}
          </button>
        </div>
      </div>

      <div style={card}>
        <div style={toolbar}>
          <div style={sectionTitle}>Members</div>

          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email"
            style={{ ...input, maxWidth: 260 }}
          />
        </div>

        <div style={tableWrap}>
          <table style={table}>
            <thead>
              <tr>
                <th style={th}>Color</th>
                <th style={th}>Name</th>
                <th style={th}>Email</th>
                <th style={th}>Color Index</th>
                <th style={th}>Status</th>
                <th style={th}>Actions</th>
              </tr>
            </thead>

            <tbody>
              {filteredMembers.map((member) => {
                const previewColor = getColor(
                  member.isEditing
                    ? Number(member.draft_color_index ?? member.color_index)
                    : member.color_index
                );

                return (
                  <tr key={member.id} style={tr}>
                    <td style={td}>
                      <span
                        style={{
                          ...pill,
                          background: previewColor.bg,
                          color: previewColor.text,
                        }}
                      >
                        {member.isEditing
                          ? member.draft_name || "Preview"
                          : member.full_name}
                      </span>
                    </td>

                    <td style={td}>
                      {member.isEditing ? (
                        <input
                          value={member.draft_name ?? ""}
                          onChange={(e) =>
                            updateDraft(member.id, "draft_name", e.target.value)
                          }
                          style={input}
                        />
                      ) : (
                        member.full_name
                      )}
                    </td>

                    <td style={td}>
                      {member.isEditing ? (
                        <input
                          value={member.draft_email ?? ""}
                          onChange={(e) =>
                            updateDraft(member.id, "draft_email", e.target.value)
                          }
                          style={input}
                        />
                      ) : (
                        member.email
                      )}
                    </td>

                    <td style={td}>
                      {member.isEditing ? (
                        <select
                          value={member.draft_color_index ?? member.color_index}
                          onChange={(e) =>
                            updateDraft(
                              member.id,
                              "draft_color_index",
                              Number(e.target.value)
                            )
                          }
                          style={select}
                        >
                          {COLOR_OPTIONS.map((idx) => (
                            <option key={idx} value={idx}>
                              {idx}
                            </option>
                          ))}
                        </select>
                      ) : (
                        member.color_index
                      )}
                    </td>

                    <td style={td}>
                      {member.active ? (
                        <span style={activeBadge}>Active</span>
                      ) : (
                        <span style={inactiveBadge}>Inactive</span>
                      )}
                    </td>

                    <td style={td}>
                      <div style={actions}>
                        {member.isEditing ? (
                          <>
                            <button
                              onClick={() => saveEdit(member)}
                              style={primaryButtonSmall}
                            >
                              Save
                            </button>
                            <button
                              onClick={() => cancelEdit(member.id)}
                              style={secondaryButtonSmall}
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => startEdit(member.id)}
                              style={secondaryButtonSmall}
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => toggleActive(member)}
                              style={secondaryButtonSmall}
                            >
                              {member.active ? "Deactivate" : "Reactivate"}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredMembers.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ ...td, color: "#94a3b8", textAlign: "center" }}>
                    No members found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const page: React.CSSProperties = {
  padding: 32,
  maxWidth: 1200,
  margin: "0 auto",
};

const headerRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  marginBottom: 24,
  gap: 16,
  flexWrap: "wrap",
};

const title: React.CSSProperties = {
  fontSize: 32,
  margin: 0,
  color: "#0f172a",
};

const subtitle: React.CSSProperties = {
  marginTop: 8,
  color: "#64748b",
  fontSize: 14,
};

const muted: React.CSSProperties = {
  color: "#64748b",
};

const card: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e2e8f0",
  borderRadius: 16,
  padding: 20,
  marginBottom: 20,
  boxShadow: "0 8px 24px rgba(15,23,42,0.04)",
};

const sectionTitle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 700,
  color: "#0f172a",
  marginBottom: 14,
};

const formRow: React.CSSProperties = {
  display: "flex",
  gap: 12,
  flexWrap: "wrap",
  alignItems: "center",
};

const toolbar: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
  marginBottom: 16,
};

const input: React.CSSProperties = {
  padding: "10px 12px",
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  fontSize: 14,
  minWidth: 180,
  outline: "none",
  boxSizing: "border-box",
};

const select: React.CSSProperties = {
  padding: "10px 12px",
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  fontSize: 14,
  minWidth: 100,
  background: "#fff",
  outline: "none",
};

const labelSmall: React.CSSProperties = {
  fontSize: 12,
  color: "#64748b",
};

const colorPreviewWrap: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  minWidth: 140,
};

const pill: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 999,
  padding: "4px 10px",
  fontSize: 13,
  fontWeight: 700,
  whiteSpace: "nowrap",
};

const activeBadge: React.CSSProperties = {
  display: "inline-block",
  padding: "4px 10px",
  borderRadius: 999,
  background: "#dcfce7",
  color: "#166534",
  fontSize: 12,
  fontWeight: 700,
};

const inactiveBadge: React.CSSProperties = {
  display: "inline-block",
  padding: "4px 10px",
  borderRadius: 999,
  background: "#fee2e2",
  color: "#991b1b",
  fontSize: 12,
  fontWeight: 700,
};

const primaryButton: React.CSSProperties = {
  padding: "10px 14px",
  background: "#0ea5e9",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  cursor: "pointer",
  fontWeight: 700,
};

const primaryButtonSmall: React.CSSProperties = {
  padding: "8px 12px",
  background: "#0ea5e9",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  cursor: "pointer",
  fontWeight: 700,
};

const secondaryButtonSmall: React.CSSProperties = {
  padding: "8px 12px",
  background: "#f8fafc",
  color: "#334155",
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  cursor: "pointer",
  fontWeight: 600,
};

const actions: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
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
  fontSize: 12,
  color: "#64748b",
  fontWeight: 700,
  padding: "12px 10px",
  borderBottom: "1px solid #e2e8f0",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const tr: React.CSSProperties = {
  borderBottom: "1px solid #f1f5f9",
};

const td: React.CSSProperties = {
  padding: "14px 10px",
  fontSize: 14,
  color: "#0f172a",
  verticalAlign: "middle",
};