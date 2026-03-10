/**
 * supabase/functions/monthly-alert/index.ts
 * ------------------------------------------
 * Runs on the last day of each month (cron: "0 8 28-31 * *" + date check inside).
 * Sends an email to the responsible contact listing next-month days with no assignee.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const FROM_EMAIL = Deno.env.get("FROM_EMAIL")!;

async function getAccessToken(clientId: string, clientSecret: string, refreshToken: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }),
  });
  return (await res.json()).access_token;
}

Deno.serve(async (_req) => {
  const now       = new Date(new Date().toLocaleString("en-US", { timeZone:"Asia/Jerusalem" }));
  const lastDay   = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  // Only run on last day of month
  if (now.getDate() !== lastDay) {
    return new Response(JSON.stringify({ skipped:"not last day of month" }), { status:200 });
  }

  // Next month date range
  const nextMonth      = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const nextMonthDays  = new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0).getDate();
  const fromDate       = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth()+1).padStart(2,"0")}-01`;
  const toDate         = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth()+1).padStart(2,"0")}-${nextMonthDays}`;

  // Fetch existing assignments for next month
  const { data: assignments } = await supabase
    .from("duty_assignments").select("duty_date, member_id")
    .gte("duty_date", fromDate).lte("duty_date", toDate);

  const coveredDates = new Set((assignments ?? []).filter(a => a.member_id).map(a => a.duty_date));

  // Find unassigned dates
  const unassigned: string[] = [];
  for (let d = 1; d <= nextMonthDays; d++) {
    const key = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth()+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    if (!coveredDates.has(key)) unassigned.push(key);
  }

  if (unassigned.length === 0) {
    return new Response(JSON.stringify({ ok:true, message:"All dates covered" }), { status:200 });
  }

  const { data: settings } = await supabase.from("settings").select("*").eq("id",1).single();
  if (!settings?.responsible_email) {
    return new Response(JSON.stringify({ error:"No responsible contact set" }), { status:200 });
  }

  const token = await getAccessToken(
    Deno.env.get("GMAIL_CLIENT_ID")!, Deno.env.get("GMAIL_CLIENT_SECRET")!, Deno.env.get("GMAIL_REFRESH_TOKEN")!
  );

  const monthName = nextMonth.toLocaleString("en-US", { month:"long" });
  const subject   = `iPSC Lab: ${unassigned.length} unassigned days in ${monthName}`;
  const body      = [
    `Hi ${settings.responsible_name},`,
    ``,
    `The following ${unassigned.length} day(s) in ${monthName} ${nextMonth.getFullYear()} have no iPSC medium-change assignee:`,
    ``,
    ...unassigned.map(d => `  • ${d}`),
    ``,
    `Please log in to iPSC-DvirLab to assign coverage.`,
    ``,
    `— iPSC-DvirLab`,
  ].join("\n");

  const headers = [
    `From: iPSC Lab <${FROM_EMAIL}>`,
    `To: ${settings.responsible_email}`,
    `Subject: ${subject}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    body,
  ].join("\r\n");

  const raw = btoa(unescape(encodeURIComponent(headers))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
  await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method:"POST",
    headers:{ Authorization:`Bearer ${token}`, "Content-Type":"application/json" },
    body: JSON.stringify({ raw }),
  });

  return new Response(JSON.stringify({ ok:true, unassigned }), { status:200 });
});
