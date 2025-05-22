import * as React from "react";
import { Html, Head, Body, Container, Section, Text, Img } from "@react-email/components";

// Helper to format hour as '2 AM', '3 PM', etc.
function formatHour(h: number) {
  if (h === 0) return '12 AM';
  if (h < 12) return `${h} AM`;
  if (h === 12) return '12 PM';
  return `${h - 12} PM`;
}

// Helper to format date as MM-DD-YYYY
function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${mm}-${dd}-${yyyy}`;
}

type DailyReportEmailProps = {
  date: string;
  emailsSent: number;
  emailsReceived: number;
  hourlySent?: number[];
  hourlyReceived?: number[];
};

export default function DailyReportEmail({ date, emailsSent, emailsReceived, hourlySent, hourlyReceived }: DailyReportEmailProps) {
  return (
    <Html>
      <Head />
      <Body style={{ backgroundColor: "#f6f9fc", fontFamily: "Inter, Arial, sans-serif", margin: 0, padding: 0 }}>
        <Container style={{ background: "#fff", borderRadius: 12, padding: 32, margin: "40px auto", maxWidth: 520, boxShadow: "0 2px 12px #0001" }}>
          {/* Header with logo and title */}
          <Section style={{ textAlign: "center", marginBottom: 24 }}>
            {/* Replace src with your logo URL if available */}
            <Img src="https://placehold.co/48x48?text=Logo" width={48} height={48} alt="Logo" style={{ margin: "0 auto 8px" }} />
            <Text style={{ fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: -0.5 }}>
              Email KPI Report for {formatDate(date)}
            </Text>
          </Section>

          {/* Highlighted KPIs */}
          <Section style={{ marginBottom: 32 }}>
            <table width="100%" cellPadding={0} cellSpacing={0} style={{ borderSpacing: 0, borderCollapse: "collapse" }}>
              <tr>
                <td align="center" style={{ paddingRight: 12, width: "50%" }}>
                  <div style={{ background: "#10b981", color: "#fff", borderRadius: 8, padding: "18px 0", fontSize: 18, fontWeight: 600, minWidth: 120, textAlign: "center" }}>
                    <div style={{ fontSize: 13, fontWeight: 400, opacity: 0.85, marginBottom: 4 }}>Emails Received</div>
                    {emailsReceived}
                  </div>
                </td>
                <td align="center" style={{ paddingLeft: 12, width: "50%" }}>
                  <div style={{ background: "#2563eb", color: "#fff", borderRadius: 8, padding: "18px 0", fontSize: 18, fontWeight: 600, minWidth: 120, textAlign: "center" }}>
                    <div style={{ fontSize: 13, fontWeight: 400, opacity: 0.85, marginBottom: 4 }}>Emails Sent</div>
                    {emailsSent}
                  </div>
                </td>
              </tr>
            </table>
          </Section>

          {/* Hourly Breakdown Table */}
          {hourlySent && hourlyReceived && (
            <Section style={{ marginTop: 8, marginBottom: 32 }}>
              <Text style={{ fontSize: 17, fontWeight: 600, marginBottom: 10, textAlign: "center" }}>Hourly Breakdown</Text>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, borderRadius: 8, overflow: 'hidden', boxShadow: '0 1px 4px #0001' }}>
                <thead>
                  <tr style={{ background: '#f3f4f6' }}>
                    <th style={{ padding: 8, textAlign: 'left', fontWeight: 600, fontSize: 13, letterSpacing: 0.2 }}>Hour</th>
                    <th style={{ padding: 8, textAlign: 'right', fontWeight: 600, fontSize: 13, letterSpacing: 0.2 }}>Sent</th>
                    <th style={{ padding: 8, textAlign: 'right', fontWeight: 600, fontSize: 13, letterSpacing: 0.2 }}>Received</th>
                  </tr>
                </thead>
                <tbody>
                  {hourlySent.map((sent, i) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#f6f9fc' }}>
                      <td style={{ padding: 8 }}>{formatHour(i)}</td>
                      <td style={{ padding: 8, textAlign: 'right' }}>{sent}</td>
                      <td style={{ padding: 8, textAlign: 'right' }}>{hourlyReceived[i]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          )}

          {/* Footer */}
          <Section style={{ textAlign: "center", marginTop: 32, color: "#6b7280", fontSize: 13, borderTop: "1px solid #e5e7eb", paddingTop: 18 }}>
            Sent by <strong>Email KPI App</strong> &bull; <a href="https://email-kpi.com" style={{ color: "#2563eb", textDecoration: "none" }}>email-kpi.com</a>
          </Section>
        </Container>
      </Body>
    </Html>
  );
} 