import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "iPSC-DvirLab",
  description: "Lab duty roster for iPSC medium changes",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body style={bodyStyle}>
        <div style={appShell}>
          <header style={headerStyle}>
            <div style={headerInner}>
              <div style={brandBlock}>
                <div style={brandTitle}>iPSC-DvirLab</div>
                <div style={brandSubtitle}>Medium change duty manager</div>
              </div>

              <nav style={navStyle}>
                <Link href="/calendar" style={navLink}>
                  Calendar
                </Link>
                <Link href="/people" style={navLink}>
                  People
                </Link>
                <Link href="/stats" style={navLink}>
                  Stats
                </Link>
                <Link href="/archive" style={navLink}>
                  Archive
                </Link>
              </nav>
            </div>
          </header>

          <main style={mainStyle}>{children}</main>
        </div>
      </body>
    </html>
  );
}

const bodyStyle: React.CSSProperties = {
  margin: 0,
  background: "#f8fafc",
  color: "#0f172a",
  fontFamily:
    'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
};

const appShell: React.CSSProperties = {
  minHeight: "100vh",
};

const headerStyle: React.CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 100,
  background: "rgba(255,255,255,0.92)",
  backdropFilter: "blur(10px)",
  borderBottom: "1px solid #e2e8f0",
};

const headerInner: React.CSSProperties = {
  maxWidth: 1200,
  margin: "0 auto",
  padding: "14px 20px",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 16,
  flexWrap: "wrap",
};

const brandBlock: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
};

const brandTitle: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 800,
  color: "#0f172a",
};

const brandSubtitle: React.CSSProperties = {
  fontSize: 12,
  color: "#64748b",
};

const navStyle: React.CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
};

const navLink: React.CSSProperties = {
  textDecoration: "none",
  color: "#334155",
  fontSize: 14,
  fontWeight: 600,
  padding: "8px 12px",
  borderRadius: 10,
  border: "1px solid #e2e8f0",
  background: "#ffffff",
};

const mainStyle: React.CSSProperties = {
  maxWidth: 1200,
  margin: "0 auto",
  padding: "24px 20px 40px",
};