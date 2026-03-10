"use client";
/**
 * app/stats/page.tsx
 * ------------------
 * Monthly duty statistics per member.
 * Weekdays vs Fri/Sat/Holiday (holidays take precedence over Fri/Sat).
 * Includes CSV export.
 */

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import { getDayCategory } from "@/lib/holidays";
import { getColor } from "@/lib/colors";
import type { DutyAssignment, Member, MemberStats } from "@/types";

const MONTHS = ["January","February","March","April","May","June",
  "July","August","September","October","November","December"];

export default function StatsPage() {
  const supabase = createClient();
  const now = new Date();

  const [year,    setYear]    = useState(now.getFullYear());
  const [month,   setMonth]   = useState(now.getMonth());
  const [duties,  setDuties]  = useState<DutyAssignment[]>([]);
  const [members, setMembers] = useState<Member[]>([]);

  useEffect(() => {
    supabase.from("members").select("*").then(({ data }) => { if (data) setMembers(data as Member[]); });
  }, []);

  useEffect(() => {
    const from = `${year}-${String(month + 1).padStart(2,"00")}-01`;
    const days = new Date(year, month + 1, 0).getDate();
    const to   = `${year}-${String(month + 1).padStart(2,"00")}-${days}`;
    supabase.from("calendar_feed").select("*").gte("duty_date",from).lte("duty_date",to)
      .then(({ data }) => { if (data) setDuties(data as DutyAssignment[]); });
  }, [year, month]);

  // ── Build stats ────────────────────────────────────────────────────────────
  const stats: MemberStats[] = (() => {
    const map: Record<string, MemberStats> = {};
    members.forEach(m => { map[m.id] = { member: m, weekdays: 0, weekend_holiday: 0, total: 0 }; });

    duties.forEach(d => {
      if (!d.member_id) return;
      const s = map[d.member_id];
      if (!s) return;
      const [y, mo, da] = d.duty_date.split("-").map(Number);
      const cat = getDayCategory(y, mo - 1, da);
      if (cat === "weekday") s.weekdays++;
      else                   s.weekend_holiday++;
      s.total++;
    });

    return Object.values(map).filter(s => s.total > 0).sort((a,b) => b.total - a.total);
  })();

  const maxTotal = Math.max(...stats.map(s => s.total), 1);

  // ── CSV export ─────────────────────────────────────────────────────────────
  function exportCSV() {
    const header = ["date","assignee_name","assignee_email","volume_ml","notes","completed","day_type"];
    const rows   = duties.map(d => {
      const m = members.find(m => m.id === d.member_id);
      const [y, mo, da] = d.duty_date.split("-").map(Number);
      const cat = getDayCategory(y, mo - 1, da);
      return [
        d.duty_date,
        m?.full_name ?? "",
        m?.email ?? "",
        d.volume_ml ?? "",
        `"${(d.notes ?? "").replace(/"/g, "\"\"")}"`,
        d.volume_ml != null ? "yes" : "no",
        cat,
      ].join(",");
    });
    const csv  = [header.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type:"text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `duties-${year}-${String(month+1).padStart(2,"0")}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  function changeMonth(dir: -1 | 1) {
    const d = new Date(year, month + dir, 1);
    setYear(d.getFullYear()); setMonth(d.getMonth());
  }

  return (
    <div>
      {/* Header + nav */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20 }}>
        <h2 style={h2}>Statistics</h2>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <button style={navBtn} onClick={() => changeMonth(-1)}>‹</button>
          <span style={{ fontSize:14, fontWeight:600, minWidth:130, textAlign:"center" }}>{MONTHS[month]} {year}</span>
          <button style={navBtn} onClick={() => changeMonth(1)}>›</button>
        </div>
      </div>

      {/* Bar chart */}
      <div style={card}>
        <div style={sectionLabel}>Duties this month</div>
        {stats.length === 0
          ? <p style={{ color:"#94a3b8", fontSize:13 }}>No assignments recorded yet.</p>
          : stats.map(s => {
              const c = getColor(s.member.color_index);
              return (
                <div key={s.member.id} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
                  <div style={{ width:88, fontSize:12, fontWeight:600, color:"#475569", textAlign:"right", flexShrink:0 }}>
                    {s.member.full_name.split(" ")[0]}
                  </div>
                  <div style={{ flex:1, background:"#f1f5f9", borderRadius:999, height:24, overflow:"hidden" }}>
                    <div style={{
                      width:`${(s.total / maxTotal) * 100}%`, height:"100%",
                      background: c.bg, borderRadius:999, minWidth:28,
                      display:"flex", alignItems:"center", paddingLeft:10,
                      transition:"width 0.6s ease",
                    }}>
                      <span style={{ color:"#fff", fontSize:11, fontWeight:700 }}>{s.total}</span>
                    </div>
                  </div>
                </div>
              );
            })
        }
      </div>

      {/* Table */}
      <div style={{ ...card, padding:0, overflow:"hidden" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
          <thead>
            <tr style={{ background:"#f8fafc" }}>
              {["Person","Weekdays","Fri / Sat / Holiday","Total"].map(h => (
                <th key={h} style={th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {stats.length === 0 && (
              <tr><td colSpan={4} style={{ textAlign:"center", padding:20, color:"#94a3b8" }}>No data</td></tr>
            )}
            {stats.map((s, i) => {
              const c = getColor(s.member.color_index);
              return (
                <tr key={s.member.id} style={{ borderTop:"1px solid #f1f5f9", background: i%2===0?"#fff":"#fafafa" }}>
                  <td style={td}>
                    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                      <div style={{ width:10, height:10, borderRadius:999, background:c.bg, flexShrink:0 }}/>
                      {s.member.full_name}
                    </div>
                  </td>
                  <td style={{ ...td, textAlign:"center" }}>{s.weekdays}</td>
                  <td style={{ ...td, textAlign:"center" }}>{s.weekend_holiday}</td>
                  <td style={{ ...td, textAlign:"center", fontWeight:700 }}>{s.total}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Export */}
      <div style={{ marginTop:16, display:"flex", justifyContent:"flex-end" }}>
        <button onClick={exportCSV} style={exportBtn}>↓ Export CSV</button>
      </div>
    </div>
  );
}

const h2: React.CSSProperties = { fontFamily:"'DM Serif Display',serif", fontSize:22, fontWeight:400, color:"#0f172a", margin:0 };
const card: React.CSSProperties = { background:"#fff", borderRadius:14, border:"1.5px solid #e2e8f0", padding:20, marginBottom:16 };
const sectionLabel: React.CSSProperties = { fontWeight:700, fontSize:11, color:"#64748b", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:14 };
const navBtn: React.CSSProperties = { background:"#f1f5f9", border:"none", borderRadius:8, width:34, height:34, fontSize:18, cursor:"pointer", color:"#475569" };
const th: React.CSSProperties = { padding:"10px 14px", textAlign:"left", fontSize:11, fontWeight:700, color:"#64748b", textTransform:"uppercase", letterSpacing:"0.07em" };
const td: React.CSSProperties = { padding:"11px 14px", color:"#0f172a" };
const exportBtn: React.CSSProperties = { padding:"8px 16px", borderRadius:10, border:"1.5px solid #e2e8f0", background:"#f8fafc", fontSize:12, fontWeight:700, cursor:"pointer", color:"#475569" };
