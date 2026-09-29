/**
 * Sends one private email to active Flow Team members when a split containing
 * flow plates is completed. Trigger from a Database Webhook on splits UPDATE.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const VERSION = "V1-FLOW-READY-NOTIFICATION";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FROM_EMAIL = Deno.env.get("FROM_EMAIL")!;
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

function addCalendarDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const result = new Date(Date.UTC(year, month - 1, day + days));
  return result.toISOString().slice(0, 10);
}

async function getAccessToken(): Promise<string> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GMAIL_CLIENT_ID")!,
      client_secret: Deno.env.get("GMAIL_CLIENT_SECRET")!,
      refresh_token: Deno.env.get("GMAIL_REFRESH_TOKEN")!,
      grant_type: "refresh_token",
    }),
  });

  const data = await response.json();
  if (!response.ok || !data.access_token) {
    console.error(`[${VERSION}] OAuth token request failed`, data);
    throw new Error("Failed to obtain Google OAuth access token");
  }

  return data.access_token;
}

async function sendEmail(
  recipients: string[],
  subject: string,
  body: string,
  accessToken: string
) {
  const message = [
    `From: iPSC Lab <${FROM_EMAIL}>`,
    `To: ${FROM_EMAIL}`,
    `Bcc: ${recipients.join(", ")}`,
    `Subject: ${subject}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    body,
  ].join("\r\n");

  const encoded = btoa(unescape(encodeURIComponent(message)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const response = await fetch(
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

  if (!response.ok) {
    console.error(`[${VERSION}] Gmail send failed`, await response.text());
    throw new Error("Failed to send the Flow Team notification");
  }
}

Deno.serve(async (request) => {
  try {
    const payload = await request.json();
    const splitId = payload?.record?.id;
    if (!splitId) throw new Error("Webhook payload does not contain a split id");

    // Read fresh state instead of trusting a possibly stale webhook payload.
    const { data: split, error: splitError } = await supabase
      .from("splits")
      .select(
        "id, split_number, status, performed_date, flow_plate_count, flow_notification_sent_at"
      )
      .eq("id", splitId)
      .single();

    if (splitError) throw splitError;

    if (split.status !== "completed" || Number(split.flow_plate_count ?? 0) <= 0) {
      return Response.json({ ok: true, skipped: "not-a-completed-flow-split" });
    }

    if (split.flow_notification_sent_at) {
      return Response.json({ ok: true, skipped: "already-sent" });
    }

    if (!split.performed_date) {
      throw new Error("Completed flow split has no performed date");
    }

    const { data: members, error: membersError } = await supabase
      .from("members")
      .select("email")
      .eq("active", true)
      .eq("flow_team", true);

    if (membersError) throw membersError;

    const recipients = (members ?? [])
      .map((member) => member.email?.trim())
      .filter((email): email is string => Boolean(email));
    const readyDate = addCalendarDays(split.performed_date, 3);

    if (recipients.length > 0) {
      await sendEmail(
        recipients,
        `Flow plate expected on ${readyDate} (P${split.split_number})`,
        `Hello Flow Team,\n\nPassage P${split.split_number} was performed on ${split.performed_date} with ${split.flow_plate_count} flow plate${split.flow_plate_count === 1 ? "" : "s"}.\n\nThe flow plate is expected to be ready on ${readyDate}.\n\n- iPSC-DvirLab`,
        await getAccessToken()
      );
    } else {
      console.log(`[${VERSION}] No active Flow Team recipients`);
    }

    const { error: updateError } = await supabase
      .from("splits")
      .update({ flow_notification_sent_at: new Date().toISOString() })
      .eq("id", split.id)
      .is("flow_notification_sent_at", null);

    if (updateError) throw updateError;

    return Response.json({
      ok: true,
      version: VERSION,
      recipients: recipients.length,
      ready_date: readyDate,
    });
  } catch (error) {
    console.error(`[${VERSION}] Failed`, error);
    return Response.json(
      {
        ok: false,
        version: VERSION,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
});
