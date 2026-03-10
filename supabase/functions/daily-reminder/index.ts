/**
 * supabase/functions/daily-reminder/index.ts
 * -------------------------------------------
 * Called by a cron job at 10:45 Asia/Jerusalem every day.
 *
 * Free-tier scheduling options:
 *   A) Supabase pg_cron (Database → Extensions → pg_cron) — call via HTTP or RPC
 *   B) GitHub Actions cron (free, reliable)
 *   C) cron-job.org (free external cron service)
 *
 * Cron expression for 10:45 Jerusalem (UTC+2 in winter / UTC+3 summer):
 *   UTC 08:45 winter  → "45 8 * * *"
 *   UTC 07:45 summer  → "45 7 * * *"
 * Simplest: use two GitHub Actions workflows (one for each DST period)
 * OR use cron-job.org with a fixed UTC offset.
 *
 * What this function does:
 *   1. Checks today's duty assignment.
 *   2. If volume_ml is still null → send reminder email + build WhatsApp text.
 *   3. Fetches responsible_contact from settings for CC.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FROM_EMAIL   = Deno.env.get("FROM_EMAIL")!;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function getAccessToken(clientId: string, clientSecret: string, refreshToken: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }),
  });
  return (await res.json()).access_token;
}

async function sendEmail(to: string, cc: string | null, subject: string, body: string, accessToken: string) {
  const headers = [`From: iPSC Lab <${FROM_EMAIL}>`, `To: ${to}`];
  if (cc) headers.push(`Cc: ${cc}`);
  headers.push(`Subject: ${subject}`, "Content-Type: text/plain; charset=utf-8", "", body);
  const raw = btoa(unescape(encodeURIComponent(headers.join("\r\n"))))
    .replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
  await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method:"POST",
    headers:{ Authorization:`Bearer ${accessToken}`, "Content-Type":"application/json" },
    body: JSON.stringify({ raw }),
  });
}

Deno.serve(async (_req) => {
  // Today's date in Jerusalem timezone
  const todayISO = new Date().toLocaleDateString("en-CA", { timeZone:"Asia/Jerusalem" }); // "YYYY-MM-DD"

  const [{ data: duty }, { data: settings }] = await Promise.all([
    supabase.from("calendar_feed").select("*").eq("duty_date", todayISO).single(),
    supabase.from("settings").select("*").eq("id", 1).single(),
  ]);

  // No assignment today — nothing to remind
  if (!duty?.member_id) return new Response(JSON.stringify({ skipped: "no assignee" }), { status: 200 });

  // Already reported — nothing to do
  if (duty.volume_ml != null) return new Response(JSON.stringify({ skipped: "already reported" }), { status: 200 });

  const gmailToken = await getAccessToken(
    Deno.env.get("GMAIL_CLIENT_ID")!, Deno.env.get("GMAIL_CLIENT_SECRET")!, Deno.env.get("GMAIL_REFRESH_TOKEN")!
  );

  const responsible = settings?.responsible_email ?? null;
  const assigneeName = duty.member_name ?? "Lab member";
  const assigneeEmail = duty.member_email;

  await sendEmail(
    assigneeEmail,
    responsible,
    `Reminder: iPSC medium change due today (${todayISO})`,
    `Hi ${assigneeName},\n\nThis is a reminder that the iPSC medium change for today (${todayISO}) has not yet been reported.\n\nPlease complete the change and log the volume in iPSC-DvirLab.\n\n— iPSC-DvirLab`,
    gmailToken
  );

  return new Response(JSON.stringify({ ok: true, reminded: assigneeEmail }), { status: 200 });
});
