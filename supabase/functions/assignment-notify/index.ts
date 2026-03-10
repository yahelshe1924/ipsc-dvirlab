/**
 * supabase/functions/assignment-notify/index.ts
 * ----------------------------------------------
 * Triggered by a Supabase Database Webhook on INSERT to assignment_audit.
 * Sends:
 *   1. Email to old assignee (if any)  – "you've been removed"
 *   2. Email to new assignee (if any)  – "you've been assigned"
 *   3. Cancels old Google Calendar event
 *   4. Creates new Google Calendar event for new assignee
 *
 * Required env vars (set in Supabase Dashboard → Edge Functions → Secrets):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   GMAIL_CLIENT_ID
 *   GMAIL_CLIENT_SECRET
 *   GMAIL_REFRESH_TOKEN          ← obtain via OAuth Playground once
 *   GOOGLE_CALENDAR_CLIENT_ID    (can reuse GMAIL creds)
 *   GOOGLE_CALENDAR_CLIENT_SECRET
 *   GOOGLE_CALENDAR_REFRESH_TOKEN
 *   FROM_EMAIL                   ← e.g. lab-noreply@gmail.com
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL  = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FROM_EMAIL    = Deno.env.get("FROM_EMAIL")!;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// ── OAuth helper – get Gmail/Calendar access token via refresh token ──────────
async function getAccessToken(clientId: string, clientSecret: string, refreshToken: string): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId, client_secret: clientSecret,
      refresh_token: refreshToken, grant_type: "refresh_token",
    }),
  });
  const json = await res.json();
  return json.access_token;
}

// ── Send email via Gmail API ──────────────────────────────────────────────────
async function sendEmail(to: string, subject: string, body: string, accessToken: string) {
  const message = [
    `From: iPSC Lab <${FROM_EMAIL}>`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    body,
  ].join("\r\n");

  const encoded = btoa(unescape(encodeURIComponent(message)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw: encoded }),
  });
}

// ── Google Calendar helpers ──────────────────────────────────────────────────
async function createCalendarEvent(
  attendeeEmail: string,
  dutyDate: string,  // "YYYY-MM-DD"
  accessToken: string
): Promise<string | null> {
  const res = await fetch(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        summary: "iPSC medium change",
        start: { dateTime: `${dutyDate}T09:00:00`, timeZone: "Asia/Jerusalem" },
        end:   { dateTime: `${dutyDate}T11:00:00`, timeZone: "Asia/Jerusalem" },
        attendees: [{ email: attendeeEmail }],
        reminders: { useDefault: false, overrides: [{ method: "email", minutes: 60 }] },
      }),
    }
  );
  const data = await res.json();
  return data.id ?? null;
}

async function cancelCalendarEvent(eventId: string, accessToken: string) {
  await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } }
  );
}

// ── Main handler ─────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  const payload = await req.json();
  const record  = payload.record; // new assignment_audit row

  const { duty_date, old_member_id, new_member_id, changed_by_id } = record;

  // Fetch member details
  const ids = [old_member_id, new_member_id, changed_by_id].filter(Boolean);
  const { data: members } = await supabase.from("members").select("*").in("id", ids);
  const byId = Object.fromEntries((members ?? []).map(m => [m.id, m]));

  const oldMember     = old_member_id ? byId[old_member_id]     : null;
  const newMember     = new_member_id ? byId[new_member_id]     : null;
  const changedByMember = changed_by_id ? byId[changed_by_id] : null;
  const changer       = changedByMember?.full_name ?? "A lab member";

  // Current assignment row (for gcal_event_id)
  const { data: assignment } = await supabase
    .from("duty_assignments").select("gcal_event_id").eq("duty_date", duty_date).single();

  const gmailToken = await getAccessToken(
    Deno.env.get("GMAIL_CLIENT_ID")!,
    Deno.env.get("GMAIL_CLIENT_SECRET")!,
    Deno.env.get("GMAIL_REFRESH_TOKEN")!
  );
  const gcalToken = await getAccessToken(
    Deno.env.get("GOOGLE_CALENDAR_CLIENT_ID")!,
    Deno.env.get("GOOGLE_CALENDAR_CLIENT_SECRET")!,
    Deno.env.get("GOOGLE_CALENDAR_REFRESH_TOKEN")!
  );

  // 1. Email + cancel calendar for OLD assignee
  if (oldMember) {
    await sendEmail(
      oldMember.email,
      `iPSC duty change for ${duty_date}`,
      `Hi ${oldMember.full_name},\n\nYour iPSC medium-change duty on ${duty_date} has been reassigned by ${changer}.\n\nYou no longer need to come in on that date.\n\n— iPSC-DvirLab`,
      gmailToken
    );
    if (assignment?.gcal_event_id) {
      await cancelCalendarEvent(assignment.gcal_event_id, gcalToken);
    }
  }

  // 2. Email + create calendar event for NEW assignee
  let newEventId: string | null = null;
  if (newMember) {
    await sendEmail(
      newMember.email,
      `You're assigned: iPSC medium change on ${duty_date}`,
      `Hi ${newMember.full_name},\n\nYou have been assigned the iPSC medium-change duty on ${duty_date} by ${changer}.\n\nPlease log in to iPSC-DvirLab to confirm and report when done.\n\n— iPSC-DvirLab`,
      gmailToken
    );
    newEventId = await createCalendarEvent(newMember.email, duty_date, gcalToken);
  }

  // 3. Persist new gcal_event_id
  await supabase.from("duty_assignments")
    .update({ gcal_event_id: newEventId })
    .eq("duty_date", duty_date);

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
});
