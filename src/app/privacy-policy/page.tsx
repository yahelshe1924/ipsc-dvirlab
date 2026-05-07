import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | iPSC-DvirLab",
  description: "Privacy Policy for the iPSC-DvirLab lab management application.",
};

const LAST_UPDATED = "May 7, 2026";

export default function PrivacyPolicyPage() {
  return (
    <div style={page}>
      <article style={article}>
        <p style={eyebrow}>iPSC-DvirLab</p>
        <h1 style={title}>Privacy Policy</h1>
        <p style={updated}>Last updated: {LAST_UPDATED}</p>

        <section style={section}>
          <h2 style={sectionTitle}>Overview</h2>
          <p style={paragraph}>
            iPSC-DvirLab is a private lab management application used to manage
            stem-cell lab duties, calendar assignments, split/passaging records,
            reminders, and related lab workflow information.
          </p>
          <p style={paragraph}>
            This policy explains what information the application accesses,
            stores, and uses when lab members sign in with Google or use the
            application.
          </p>
        </section>

        <section style={section}>
          <h2 style={sectionTitle}>Information We Collect</h2>
          <p style={paragraph}>The application may collect and store:</p>
          <ul style={list}>
            <li>Name and email address for authorized lab members.</li>
            <li>Lab duty assignments, dates, notes, and reported volumes.</li>
            <li>Split/passaging registrations, completion records, and related counts.</li>
            <li>User preferences for email notifications and calendar event creation.</li>
            <li>Basic authentication information provided by Google sign-in.</li>
          </ul>
        </section>

        <section style={section}>
          <h2 style={sectionTitle}>Google User Data</h2>
          <p style={paragraph}>
            When you sign in with Google, the application uses your Google
            account email address to verify that you are an authorized lab
            member. If enabled, the application may use Google APIs to send
            email notifications and create calendar events related to lab duties.
          </p>
          <p style={paragraph}>
            Google user data is used only to provide the application features
            requested by authorized lab members. The application does not sell
            Google user data and does not use it for advertising.
          </p>
        </section>

        <section style={section}>
          <h2 style={sectionTitle}>How We Use Information</h2>
          <p style={paragraph}>Information is used to:</p>
          <ul style={list}>
            <li>Authenticate and authorize lab members.</li>
            <li>Display and manage lab duty calendars and archive records.</li>
            <li>Send duty notifications and reminders.</li>
            <li>Create or update Google Calendar events when enabled.</li>
            <li>Maintain operational history for lab coordination.</li>
          </ul>
        </section>

        <section style={section}>
          <h2 style={sectionTitle}>Data Sharing</h2>
          <p style={paragraph}>
            Data is shared only as needed to operate the application, including
            with infrastructure and API providers such as Supabase, Vercel, and
            Google APIs. We do not sell personal information.
          </p>
        </section>

        <section style={section}>
          <h2 style={sectionTitle}>Data Retention and Access</h2>
          <p style={paragraph}>
            Lab workflow records may be retained for operational and archive
            purposes. Access is limited to authorized lab members. If you need
            to correct or remove information, contact the lab administrator.
          </p>
        </section>

        <section style={section}>
          <h2 style={sectionTitle}>Security</h2>
          <p style={paragraph}>
            The application uses authentication and access controls to limit use
            to authorized lab members. Secrets and API credentials are stored in
            server-side environments and are not intentionally exposed to users.
          </p>
        </section>

        <section style={section}>
          <h2 style={sectionTitle}>Contact</h2>
          <p style={paragraph}>
            For questions about this Privacy Policy or the application, contact
            the iPSC-DvirLab administrator.
          </p>
        </section>
      </article>
    </div>
  );
}

const page: React.CSSProperties = {
  padding: "32px 0",
};

const article: React.CSSProperties = {
  maxWidth: 820,
  margin: "0 auto",
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: 12,
  padding: 32,
  boxShadow: "0 8px 24px rgba(15,23,42,0.04)",
};

const eyebrow: React.CSSProperties = {
  margin: "0 0 8px",
  color: "#0e7490",
  fontSize: 13,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
};

const title: React.CSSProperties = {
  margin: 0,
  color: "#0f172a",
  fontSize: 36,
  lineHeight: 1.15,
};

const updated: React.CSSProperties = {
  margin: "10px 0 28px",
  color: "#64748b",
  fontSize: 14,
};

const section: React.CSSProperties = {
  marginTop: 24,
};

const sectionTitle: React.CSSProperties = {
  margin: "0 0 8px",
  color: "#0f172a",
  fontSize: 20,
};

const paragraph: React.CSSProperties = {
  margin: "0 0 12px",
  color: "#334155",
  fontSize: 15,
  lineHeight: 1.7,
};

const list: React.CSSProperties = {
  margin: "0 0 12px 20px",
  padding: 0,
  color: "#334155",
  fontSize: 15,
  lineHeight: 1.8,
};
