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
 * Behavior:
 *   • If someone assigns themselves, no email is sent to themselves
 *   • But a Google Calendar event is still created for them
 *
 * Required env vars (set in Supabase Dashboard → Edge Functions → Secrets):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   GMAIL_CLIENT_ID
 *   GMAIL_CLIENT_SECRET
 *   GMAIL_REFRESH_TOKEN
 *   GOOGLE_CALENDAR_CLIENT_ID
 *   GOOGLE_CALENDAR_CLIENT_SECRET
 *   GOOGLE_CALENDAR_REFRESH_TOKEN
 *   FROM_EMAIL
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FROM_EMAIL = Deno.env.get("FROM_EMAIL")!;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// ── OAuth helper ──────────────────────────────────────────────────────────────
async function getAccessToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string
): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const json = await res.json();

  if (!res.ok || !json.access_token) {
    throw new Error(`Failed to get access token: ${JSON.stringify(json)}`);
  }

  return json.access_token;
}

// ── Send email via Gmail API ─────────────────────────────────────────────────
async function sendEmail(
  to: string,
  subject: string,
  body: string,
  accessToken: string
) {
  const message = [
    `From: iPSC Lab <${FROM_EMAIL}>`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    body,
  ].join("\r\n");

  const encoded = btoa(unescape(encodeURIComponent(message)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const res = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw: encoded }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to send email: ${err}`);
  }
}

// ── Google Calendar helpers ──────────────────────────────────────────────────
async function createCalendarEvent(
  attendeeEmail: string,
  dutyDate: string,
  accessToken: string
): Promise<string | null> {
  const res = await fetch(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        summary: "iPSC medium change",
        start: {
          dateTime: `${dutyDate}T09:00:00`,
          timeZone: "Asia/Jerusalem",
        },
        end: {
          dateTime: `${dutyDate}T11:00:00`,
          timeZone: "Asia/Jerusalem",
        },
        attendees: [{ email: attendeeEmail }],
        reminders: {
          useDefault: false,
          overrides: [{ method: "email", minutes: 60 }],
        },
      }),
    }
  );

  const data = await res.json();

  if (!res.ok) {
    throw new Error(`Failed to create calendar event: ${JSON.stringify(data)}`);
  }

  return data.id ?? null;
}

async function cancelCalendarEvent(eventId: string, accessToken: string) {
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!res.ok && res.status !== 404) {
    const err = await res.text();
    throw new Error(`Failed to cancel calendar event: ${err}`);
  }
}

// ── Main handler ─────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    const record = payload.record;

    const {
      duty_date,
      old_member_id,
      new_member_id,
      changed_by_id,
    } = record;

    const ids = [old_member_id, new_member_id, changed_by_id].filter(Boolean);

    const { data: members, error: membersError } = await supabase
      .from("members")
      .select("*")
      .in("id", ids);

    if (membersError) {
      throw new Error(`Failed to load members: ${membersError.message}`);
    }

    const byId = Object.fromEntries((members ?? []).map((m) => [m.id, m]));

    const oldMember = old_member_id ? byId[old_member_id] : null;
    const newMember = new_member_id ? byId[new_member_id] : null;
    const changedByMember = changed_by_id ? byId[changed_by_id] : null;
    const changer = changedByMember?.full_name ?? "A lab member";

    const { data: assignment, error: assignmentError } = await supabase
      .from("duty_assignments")
      .select("gcal_event_id")
      .eq("duty_date", duty_date)
      .single();

    if (assignmentError) {
      throw new Error(
        `Failed to load duty assignment for ${duty_date}: ${assignmentError.message}`
      );
    }

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

    // 1. Handle OLD assignee
    // No email to self, but still cancel old calendar event if one exists.
    if (oldMember) {
      if (old_member_id !== changed_by_id) {
        await sendEmail(
          oldMember.email,
          `iPSC duty change for ${duty_date}`,
          `Hi ${oldMember.full_name},\n\nYour iPSC medium-change duty on ${duty_date} has been reassigned by ${changer}.\n\n— iPSC-DvirLab`,
          gmailToken
        );
      }

      if (assignment?.gcal_event_id) {
        await cancelCalendarEvent(assignment.gcal_event_id, gcalToken);
      }
    }

    // 2. Handle NEW assignee
    // No email to self, but still create a calendar event.
    let newEventId: string | null = null;

    if (newMember) {
      if (new_member_id !== changed_by_id) {
        await sendEmail(
          newMember.email,
          `You're assigned: iPSC medium change on ${duty_date}`,
          `Hi ${newMember.full_name},\n\nYou have been assigned the iPSC medium-change duty on ${duty_date} by ${changer}.\n\nPlease log in to iPSC-DvirLab to confirm and report when done.\n\n— iPSC-DvirLab`,
          gmailToken
        );
      }

      newEventId = await createCalendarEvent(
        newMember.email,
        duty_date,
        gcalToken
      );
    }

    // 3. Persist new gcal_event_id
    const { error: updateError } = await supabase
      .from("duty_assignments")
      .update({ gcal_event_id: newEventId })
      .eq("duty_date", duty_date);

    if (updateError) {
      throw new Error(`Failed to update gcal_event_id: ${updateError.message}`);
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (err) {
    console.error("assignment-notify error:", err);

    return new Response(
      JSON.stringify({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      }),
      { status: 500 }
    );
  }
});