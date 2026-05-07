/**
 * supabase/functions/assignment-notify/index.ts
 *
 * Sends email and calendar notifications after an assignment_audit insert.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const VERSION = "V6-REMOVAL-EMAIL-DEFAULTS";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FROM_EMAIL = Deno.env.get("FROM_EMAIL")!;
const DUTY_CALENDAR_ID = Deno.env.get("DUTY_CALENDAR_ID")!;

console.log(`[${VERSION}] DUTY_CALENDAR_ID=`, DUTY_CALENDAR_ID);

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

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

  if (!res.ok || !json.access_token) {
    console.error(`[${VERSION}] OAuth token request failed`, json);
    throw new Error("Failed to obtain Google OAuth access token");
  }

  return json.access_token;
}

async function sendEmail(
  to: string,
  subject: string,
  body: string,
  accessToken: string
) {
  console.log(`[${VERSION}] Sending email to ${to}`);

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
    const text = await res.text();
    console.error(`[${VERSION}] Gmail send failed`, text);
    throw new Error(`Failed to send email to ${to}`);
  }
}

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

async function cancelCalendarEvent(eventId: string, accessToken: string) {
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

Deno.serve(async (req) => {
  try {
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

    const ids = [old_member_id, new_member_id, changed_by_id].filter(Boolean);

    const { data: members, error: membersError } = await supabase
      .from("members")
      .select("*")
      .in("id", ids);

    if (membersError) {
      console.error(`[${VERSION}] Failed to fetch members`, membersError);
      throw new Error("Failed to fetch notification members");
    }

    const byId = Object.fromEntries((members ?? []).map((m) => [m.id, m]));
    const oldMember = old_member_id ? byId[old_member_id] : null;
    const newMember = new_member_id ? byId[new_member_id] : null;
    const changer = changed_by_id ? byId[changed_by_id] : null;
    const changerName = changer?.full_name ?? "A lab member";

    console.log(`[${VERSION}] Members resolved`, {
      old: oldMember?.full_name,
      new: newMember?.full_name,
      changer: changerName,
    });

    const { data: assignment } = await supabase
      .from("duty_assignments")
      .select("gcal_event_id")
      .eq("duty_date", duty_date)
      .single();

    let gmailToken: string | null = null;
    let gcalToken: string | null = null;

    async function getGmailToken() {
      gmailToken ??= await getAccessToken(
        Deno.env.get("GMAIL_CLIENT_ID")!,
        Deno.env.get("GMAIL_CLIENT_SECRET")!,
        Deno.env.get("GMAIL_REFRESH_TOKEN")!
      );
      return gmailToken;
    }

    async function getGcalToken() {
      gcalToken ??= await getAccessToken(
        Deno.env.get("GOOGLE_CALENDAR_CLIENT_ID")!,
        Deno.env.get("GOOGLE_CALENDAR_CLIENT_SECRET")!,
        Deno.env.get("GOOGLE_CALENDAR_REFRESH_TOKEN")!
      );
      return gcalToken;
    }

    if (oldMember) {
      const shouldSendRemovalEmail =
        old_member_id === changed_by_id
          ? oldMember.email_on_self_assignment === true &&
            oldMember.email_on_removal !== false
          : oldMember.email_on_removal !== false;

      if (!shouldSendRemovalEmail) {
        console.log(`[${VERSION}] Skipping removal email (user preference)`);
      } else {
        await sendEmail(
          oldMember.email,
          `iPSC duty change for ${duty_date}`,
          `Hi ${oldMember.full_name},

Your iPSC medium-change duty on ${duty_date} has been reassigned by ${changerName}.

- iPSC-DvirLab`,
          await getGmailToken()
        );
      }

      if (assignment?.gcal_event_id) {
        await cancelCalendarEvent(assignment.gcal_event_id, await getGcalToken());
      }
    }

    let newEventId: string | null = null;

    if (newMember) {
      const shouldSendAssignmentEmail =
        new_member_id === changed_by_id
          ? newMember.email_on_self_assignment === true &&
            newMember.email_on_assignment !== false
          : newMember.email_on_assignment !== false;

      if (!shouldSendAssignmentEmail) {
        console.log(`[${VERSION}] Skipping assignment email (user preference)`);
      } else {
        await sendEmail(
          newMember.email,
          `You're assigned: iPSC medium change on ${duty_date}`,
          `Hi ${newMember.full_name},

You have been assigned the iPSC medium-change duty on ${duty_date} by ${changerName}.

Please log in to iPSC-DvirLab to confirm and report when done.

- iPSC-DvirLab`,
          await getGmailToken()
        );
      }

      if (newMember.medium_replacement_calendar_enabled === false) {
        console.log(`[${VERSION}] Skipping calendar event (user preference OFF)`);
      } else {
        newEventId = await createCalendarEvent(
          newMember.email,
          duty_date,
          await getGcalToken()
        );
      }
    }

    await supabase
      .from("duty_assignments")
      .update({ gcal_event_id: newEventId })
      .eq("duty_date", duty_date);

    console.log(`[${VERSION}] Finished`);

    return new Response(JSON.stringify({ ok: true, version: VERSION }), {
      status: 200,
    });
  } catch (error) {
    console.error(`[${VERSION}] Failed`, error);
    return new Response(
      JSON.stringify({
        ok: false,
        version: VERSION,
        error: error instanceof Error ? error.message : String(error),
      }),
      { status: 500 }
    );
  }
});
