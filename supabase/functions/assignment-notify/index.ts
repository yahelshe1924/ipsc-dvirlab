/**
 * supabase/functions/assignment-notify/index.ts
 * ------------------------------------------------
 * VERSION: V4-SECONDARY-CALENDAR
 *
 * Behavior:
 * - No email is sent if the user changed their own assignment
 * - Calendar events ARE still created for self-assignments
 * - All Google Calendar events are created in a secondary calendar
 * - No reminders are set on the organizer side
 * - Extensive logs included for debugging
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const VERSION = "V4-SECONDARY-CALENDAR";

const SUPABASE_URL = Deno.env.get("https://nlllwkeqslhctrwqeugu.supabase.co")!;
const SERVICE_KEY = Deno.env.get("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5sbGx3a2Vxc2xoY3Ryd3FldWd1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzE0NDIzNywiZXhwIjoyMDg4NzIwMjM3fQ.YRtfeICq5z_3rE_MpqHnuf3hOgiyAW4Pl5rP6de6aLI")!;
const FROM_EMAIL = Deno.env.get("yahelshe@gmail.com")!;
const DUTY_CALENDAR_ID = Deno.env.get("31f938925d214c153f9f09512952c24a7ed82156743472e0ecdc279ff26f9988@group.calendar.google.com")!;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

/* ───────────────── OAuth token helper ───────────────── */

async function getAccessToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string
): Promise<string> {
  console.log(`[${VERSION}] Requesting OAuth token`);

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
  return json.access_token;
}

/* ───────────────── Gmail sender ───────────────── */

async function sendEmail(
  to: string,
  subject: string,
  body: string,
  accessToken: string
) {
  console.log(`[${VERSION}] Sending email → ${to}`);

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

  await fetch(
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
}

/* ───────────────── Google Calendar helpers ───────────────── */

async function createCalendarEvent(
  attendeeEmail: string,
  dutyDate: string,
  accessToken: string
): Promise<string | null> {
  console.log(
    `[${VERSION}] Creating calendar event for ${attendeeEmail} in ${DUTY_CALENDAR_ID}`
  );

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(DUTY_CALENDAR_ID)}/events`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        summary: "iPSC medium change",
        start: { dateTime: `${dutyDate}T09:00:00`, timeZone: "Asia/Jerusalem" },
        end: { dateTime: `${dutyDate}T11:00:00`, timeZone: "Asia/Jerusalem" },
        attendees: [{ email: attendeeEmail }],
        reminders: {
          useDefault: false,
          overrides: [],
        },
      }),
    }
  );

  const data = await res.json();

  if (!res.ok) {
    console.error(`[${VERSION}] Failed to create calendar event`, data);
    return null;
  }

  console.log(`[${VERSION}] Calendar event created:`, data.id);
  return data.id ?? null;
}

async function cancelCalendarEvent(
  eventId: string,
  accessToken: string
) {
  console.log(
    `[${VERSION}] Cancelling calendar event ${eventId} from ${DUTY_CALENDAR_ID}`
  );

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(DUTY_CALENDAR_ID)}/events/${encodeURIComponent(eventId)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!res.ok) {
    const text = await res.text();
    console.error(`[${VERSION}] Failed to cancel calendar event`, text);
  }
}

/* ───────────────── Main handler ───────────────── */

Deno.serve(async (req) => {
  console.log(`[${VERSION}] Function triggered`);

  const payload = await req.json();
  const record = payload.record;

  console.log(`[${VERSION}] Webhook payload`, record);

  const {
    duty_date,
    old_member_id,
    new_member_id,
    changed_by_id,
  } = record;

  console.log(`[${VERSION}] IDs`, {
    old_member_id,
    new_member_id,
    changed_by_id,
  });

  /* ── Fetch members ── */

  const ids = [old_member_id, new_member_id, changed_by_id].filter(Boolean);

  const { data: members } = await supabase
    .from("members")
    .select("*")
    .in("id", ids);

  const byId = Object.fromEntries(
    (members ?? []).map((m) => [m.id, m])
  );

  const oldMember = old_member_id ? byId[old_member_id] : null;
  const newMember = new_member_id ? byId[new_member_id] : null;
  const changer = changed_by_id ? byId[changed_by_id] : null;

  const changerName = changer?.full_name ?? "A lab member";

  console.log(`[${VERSION}] Members resolved`, {
    old: oldMember?.full_name,
    new: newMember?.full_name,
    changer: changerName,
  });

  /* ── Fetch assignment row ── */

  const { data: assignment } = await supabase
    .from("duty_assignments")
    .select("gcal_event_id")
    .eq("duty_date", duty_date)
    .single();

  /* ── OAuth tokens ── */

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

  /* ───────────────────────────── */
  /* OLD ASSIGNEE REMOVAL         */
  /* ───────────────────────────── */

  if (oldMember) {
    if (old_member_id === changed_by_id) {
      console.log(`[${VERSION}] Skipping removal email (self-change)`);
    } else {
      await sendEmail(
        oldMember.email,
        `iPSC duty change for ${duty_date}`,
        `Hi ${oldMember.full_name},

VERSION ${VERSION}

Your iPSC medium-change duty on ${duty_date} has been reassigned by ${changerName}.

You no longer need to come in on that date.

— iPSC-DvirLab`,
        gmailToken
      );
    }

    if (assignment?.gcal_event_id) {
      await cancelCalendarEvent(
        assignment.gcal_event_id,
        gcalToken
      );
    }
  }

  /* ───────────────────────────── */
  /* NEW ASSIGNEE                  */
  /* ───────────────────────────── */

  let newEventId: string | null = null;

  if (newMember) {
    if (new_member_id === changed_by_id) {
      console.log(`[${VERSION}] Self assignment → no email`);
    } else {
      await sendEmail(
        newMember.email,
        `You're assigned: iPSC medium change on ${duty_date}`,
        `Hi ${newMember.full_name},

VERSION ${VERSION}

You have been assigned the iPSC medium-change duty on ${duty_date} by ${changerName}.

Please log in to iPSC-DvirLab to confirm and report when done.

— iPSC-DvirLab`,
        gmailToken
      );
    }

    newEventId = await createCalendarEvent(
      newMember.email,
      duty_date,
      gcalToken
    );
  }

  /* ── Save calendar event id ── */

  await supabase
    .from("duty_assignments")
    .update({ gcal_event_id: newEventId })
    .eq("duty_date", duty_date);

  console.log(`[${VERSION}] Finished`);

  return new Response(
    JSON.stringify({ ok: true, version: VERSION }),
    { status: 200 }
  );
});