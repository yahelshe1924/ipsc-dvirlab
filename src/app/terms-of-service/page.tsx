import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service | iPSC-DvirLab",
  description: "Terms of Service for the iPSC-DvirLab lab management application.",
};

const LAST_UPDATED = "May 7, 2026";

export default function TermsOfServicePage() {
  return (
    <div style={page}>
      <article style={article}>
        <p style={eyebrow}>iPSC-DvirLab</p>
        <h1 style={title}>Terms of Service</h1>
        <p style={updated}>Last updated: {LAST_UPDATED}</p>

        <section style={section}>
          <h2 style={sectionTitle}>Use of the Application</h2>
          <p style={paragraph}>
            iPSC-DvirLab is a private lab management application for authorized
            lab members. It is intended for coordinating lab duties, split and
            passage records, reminders, calendar events, and related operational
            workflows.
          </p>
        </section>

        <section style={section}>
          <h2 style={sectionTitle}>Authorized Access</h2>
          <p style={paragraph}>
            Access is limited to approved lab members. Users must sign in with
            their authorized Google account and may not share access credentials
            or attempt to access information they are not permitted to view.
          </p>
        </section>

        <section style={section}>
          <h2 style={sectionTitle}>User Responsibilities</h2>
          <p style={paragraph}>Users agree to:</p>
          <ul style={list}>
            <li>Enter accurate lab duty and split/passaging information.</li>
            <li>Use the application only for legitimate lab operations.</li>
            <li>Respect the privacy and confidentiality of other lab members.</li>
            <li>Report incorrect data or access issues to the lab administrator.</li>
          </ul>
        </section>

        <section style={section}>
          <h2 style={sectionTitle}>Google Services</h2>
          <p style={paragraph}>
            The application may use Google sign-in, Gmail, and Google Calendar
            APIs to provide authentication, email notifications, and calendar
            event features. These features are used only for lab workflow
            purposes and may depend on user preferences and administrator
            configuration.
          </p>
        </section>

        <section style={section}>
          <h2 style={sectionTitle}>Availability and Accuracy</h2>
          <p style={paragraph}>
            The application is provided for internal coordination. While we aim
            to keep records accurate and available, the application may contain
            errors or experience interruptions. Lab members should verify
            critical operational information when needed.
          </p>
        </section>

        <section style={section}>
          <h2 style={sectionTitle}>Changes to the Service</h2>
          <p style={paragraph}>
            Features, access rules, and workflows may be updated over time to
            support lab operations, security, or compliance needs.
          </p>
        </section>

        <section style={section}>
          <h2 style={sectionTitle}>Termination of Access</h2>
          <p style={paragraph}>
            Access may be removed when a user is no longer an authorized lab
            member, violates these terms, or no longer requires access for lab
            operations.
          </p>
        </section>

        <section style={section}>
          <h2 style={sectionTitle}>Privacy</h2>
          <p style={paragraph}>
            Use of the application is also governed by the iPSC-DvirLab Privacy
            Policy, which explains how information is collected and used.
          </p>
        </section>

        <section style={section}>
          <h2 style={sectionTitle}>Contact</h2>
          <p style={paragraph}>
            For questions about these Terms of Service or the application,
            contact the iPSC-DvirLab administrator.
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
