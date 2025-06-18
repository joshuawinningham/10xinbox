import * as React from "react";
import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Img,
  Row,
  Column,
  Link,
  Hr,
  Button,
} from "@react-email/components";

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

export type RealTimeReportEmailProps = {
  date: string;
  emailsSent: number;
  emailsReceived: number;
  avgResponseTime: string | number;
  inboxZeroWorkingDays: number;
  inboxZeroStreak: number;
  consecutiveInboxZeroDays: number;
  hourlySent?: number[];
  hourlyReceived?: number[];
  topSenders?: Array<{ email: string; name: string; count: number }>;
  topRecipients?: Array<{ email: string; name: string; count: number }>;
  responseTimeDistribution?: Array<{ range: string; count: number }>;
  peakActivityHour?: number;
  busiestHour?: number;
  totalResponseTime?: number;
  quickestResponseTime?: string;
  slowestResponseTime?: string;
  emailThreads?: number;
  averageThreadLength?: number;
  longestThread?: number;
  currentInboxCount?: number;
  sentEmailsWithViews?: Array<{ name: string; email: string; subject: string; views: number }>;
};

const baseUrl = "https://email-kpi.vercel.app";

export default function RealTimeReportEmail({
  date,
  emailsSent,
  emailsReceived,
  avgResponseTime,
  inboxZeroWorkingDays,
  inboxZeroStreak,
  consecutiveInboxZeroDays,
  hourlySent,
  hourlyReceived,
  topSenders,
  topRecipients,
  responseTimeDistribution,
  peakActivityHour,
  busiestHour,
  totalResponseTime,
  quickestResponseTime,
  slowestResponseTime,
  emailThreads,
  averageThreadLength,
  longestThread,
  currentInboxCount,
  sentEmailsWithViews,
}: RealTimeReportEmailProps) {
  return (
    <Html>
      <Head />
      <Body style={{ backgroundColor: "#f6f9fc", fontFamily: "Inter, Arial, sans-serif", margin: 0, padding: 0 }}>
        <Container style={{ background: "#fff", borderRadius: 12, padding: 32, margin: "40px auto", maxWidth: 600, boxShadow: "0 2px 12px #0001" }}>
          {/* Header with logo and title */}
          <Section style={{ textAlign: "center", marginBottom: 32 }}>
            <Img src={`${baseUrl}/logo.png`} width={64} height={64} alt="Logo" style={{ margin: "0 auto 16px" }} />
            <Text style={{ fontSize: 24, fontWeight: 700, margin: 0, letterSpacing: -0.5, color: "#1a1a1a" }}>
              Your Real-Time Email KPI Report
            </Text>
            <Text style={{ fontSize: 16, color: "#666", margin: "8px 0 0" }}>
              {formatDate(date)}
            </Text>
          </Section>

          {/* Main Stats Grid */}
          <Section style={{ marginBottom: 32 }}>
            <Row>
              <Column style={{ padding: "0 8px" }}>
                <div style={{ background: "linear-gradient(135deg, #10b981 0%, #059669 100%)", borderRadius: 12, padding: 24, textAlign: "center", color: "#fff" }}>
                  <Text style={{ fontSize: 14, opacity: 0.9, margin: "0 0 8px" }}>Emails Received</Text>
                  <Text style={{ fontSize: 32, fontWeight: 700, margin: 0 }}>{emailsReceived}</Text>
                </div>
              </Column>
              <Column style={{ padding: "0 8px" }}>
                <div style={{ background: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)", borderRadius: 12, padding: 24, textAlign: "center", color: "#fff" }}>
                  <Text style={{ fontSize: 14, opacity: 0.9, margin: "0 0 8px" }}>Emails Sent</Text>
                  <Text style={{ fontSize: 32, fontWeight: 700, margin: 0 }}>{emailsSent}</Text>
                </div>
              </Column>
            </Row>
          </Section>

          {/* Performance Metrics */}
          <Section style={{ marginBottom: 32 }}>
            <Text style={{ fontSize: 18, fontWeight: 600, marginBottom: 16, color: "#1a1a1a" }}>Performance Metrics</Text>
            <Row>
              <Column style={{ padding: "0 8px" }}>
                <div style={{ background: "#f8fafc", borderRadius: 12, padding: 20, border: "1px solid #e2e8f0" }}>
                  <Text style={{ fontSize: 14, color: "#64748b", margin: "0 0 8px" }}>Avg. Response Time</Text>
                  <Text style={{ fontSize: 20, fontWeight: 600, margin: 0, color: "#1a1a1a" }}>{avgResponseTime}</Text>
                </div>
              </Column>
              <Column style={{ padding: "0 8px" }}>
                <div style={{ background: "#f8fafc", borderRadius: 12, padding: 20, border: "1px solid #e2e8f0" }}>
                  <Text style={{ fontSize: 14, color: "#64748b", margin: "0 0 8px" }}>Inbox Zero Days</Text>
                  <Text style={{ fontSize: 20, fontWeight: 600, margin: 0, color: "#1a1a1a" }}>{inboxZeroWorkingDays}</Text>
                </div>
              </Column>
              <Column style={{ padding: "0 8px" }}>
                <div style={{ background: "#f8fafc", borderRadius: 12, padding: 20, border: "1px solid #e2e8f0" }}>
                  <Text style={{ fontSize: 14, color: "#64748b", margin: "0 0 8px" }}>Consecutive Days</Text>
                  <Text style={{ fontSize: 20, fontWeight: 600, margin: 0, color: "#1a1a1a" }}>{consecutiveInboxZeroDays}</Text>
                </div>
              </Column>
            </Row>
          </Section>

          {/* Activity Hours */}
          <Section style={{ marginBottom: 32 }}>
            <Text style={{ fontSize: 18, fontWeight: 600, marginBottom: 16, color: "#1a1a1a" }}>Activity Hours</Text>
            <Row>
              <Column style={{ padding: "0 8px" }}>
                <div style={{ background: "#f8fafc", borderRadius: 12, padding: 20, border: "1px solid #e2e8f0" }}>
                  <Text style={{ fontSize: 14, color: "#64748b", margin: "0 0 8px" }}>Peak Activity</Text>
                  <Text style={{ fontSize: 20, fontWeight: 600, margin: 0, color: "#1a1a1a" }}>
                    {peakActivityHour !== undefined ? formatHour(peakActivityHour) : '--'}
                  </Text>
                </div>
              </Column>
              <Column style={{ padding: "0 8px" }}>
                <div style={{ background: "#f8fafc", borderRadius: 12, padding: 20, border: "1px solid #e2e8f0" }}>
                  <Text style={{ fontSize: 14, color: "#64748b", margin: "0 0 8px" }}>Busiest Hour</Text>
                  <Text style={{ fontSize: 20, fontWeight: 600, margin: 0, color: "#1a1a1a" }}>
                    {busiestHour !== undefined ? formatHour(busiestHour) : '--'}
                  </Text>
                </div>
              </Column>
            </Row>
          </Section>

          {/* Top Contacts */}
          {(topSenders?.length || topRecipients?.length) && (
            <Section style={{ marginBottom: 32 }}>
              <Text style={{ fontSize: 18, fontWeight: 600, marginBottom: 16, color: "#1a1a1a" }}>Top Contacts</Text>
              <Row>
                {topSenders?.length && (
                  <Column style={{ padding: "0 8px" }}>
                    <div style={{ background: "#f8fafc", borderRadius: 12, padding: 20, border: "1px solid #e2e8f0" }}>
                      <Text style={{ fontSize: 16, fontWeight: 600, margin: "0 0 12px", color: "#1a1a1a" }}>Top Senders</Text>
                      {topSenders.map((sender, i) => (
                        <div key={i} style={{ marginBottom: i < topSenders.length - 1 ? 12 : 0 }}>
                          <Text style={{ fontSize: 14, margin: 0, color: "#1a1a1a" }}>{sender.name || sender.email}</Text>
                          <Text style={{ fontSize: 12, color: "#64748b", margin: "2px 0 0" }}>{sender.count} emails</Text>
                        </div>
                      ))}
                    </div>
                  </Column>
                )}
                {topRecipients?.length && (
                  <Column style={{ padding: "0 8px" }}>
                    <div style={{ background: "#f8fafc", borderRadius: 12, padding: 20, border: "1px solid #e2e8f0" }}>
                      <Text style={{ fontSize: 16, fontWeight: 600, margin: "0 0 12px", color: "#1a1a1a" }}>Top Recipients</Text>
                      {topRecipients.map((recipient, i) => (
                        <div key={i} style={{ marginBottom: i < topRecipients.length - 1 ? 12 : 0 }}>
                          <Text style={{ fontSize: 14, margin: 0, color: "#1a1a1a" }}>{recipient.name || recipient.email}</Text>
                          <Text style={{ fontSize: 12, color: "#64748b", margin: "2px 0 0" }}>{recipient.count} emails</Text>
                        </div>
                      ))}
                    </div>
                  </Column>
                )}
              </Row>
            </Section>
          )}

          {/* Response Time Distribution */}
          {responseTimeDistribution?.length && (
            <Section style={{ marginBottom: 32 }}>
              <Text style={{ fontSize: 18, fontWeight: 600, marginBottom: 16, color: "#1a1a1a" }}>Response Time Distribution</Text>
              <div style={{ background: "#f8fafc", borderRadius: 12, padding: 20, border: "1px solid #e2e8f0" }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ padding: "8px", textAlign: 'left', borderBottom: "1px solid #e2e8f0", fontSize: 14, color: "#64748b", fontWeight: 500 }}>Time Range</th>
                      <th style={{ padding: "8px", textAlign: 'right', borderBottom: "1px solid #e2e8f0", fontSize: 14, color: "#64748b", fontWeight: 500 }}>Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {responseTimeDistribution.map((item, i) => (
                      <tr key={i}>
                        <td style={{ padding: "12px 8px", borderBottom: i < responseTimeDistribution.length - 1 ? "1px solid #e2e8f0" : "none", fontSize: 14, color: "#1a1a1a" }}>{item.range}</td>
                        <td style={{ padding: "12px 8px", textAlign: 'right', borderBottom: i < responseTimeDistribution.length - 1 ? "1px solid #e2e8f0" : "none", fontSize: 14, color: "#1a1a1a" }}>{item.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          {/* Sent Emails & View Counts Section */}
          {sentEmailsWithViews && sentEmailsWithViews.length > 0 && (
            <Section style={{ marginBottom: 32 }}>
              <Text style={{ fontSize: 18, fontWeight: 600, marginBottom: 16, color: "#1a1a1a" }}>Sent Emails & View Counts</Text>
              <div style={{ background: "#f8fafc", borderRadius: 12, padding: 20, border: "1px solid #e2e8f0" }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ padding: "8px", textAlign: 'left', borderBottom: "1px solid #e2e8f0", fontSize: 14, color: "#64748b", fontWeight: 500 }}>Name</th>
                      <th style={{ padding: "8px", textAlign: 'left', borderBottom: "1px solid #e2e8f0", fontSize: 14, color: "#64748b", fontWeight: 500 }}>Email</th>
                      <th style={{ padding: "8px", textAlign: 'left', borderBottom: "1px solid #e2e8f0", fontSize: 14, color: "#64748b", fontWeight: 500 }}>Subject</th>
                      <th style={{ padding: "8px", textAlign: 'right', borderBottom: "1px solid #e2e8f0", fontSize: 14, color: "#64748b", fontWeight: 500 }}>Views</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sentEmailsWithViews.map((email, i) => (
                      <tr key={i}>
                        <td style={{ padding: "12px 8px", borderBottom: i < sentEmailsWithViews.length - 1 ? "1px solid #e2e8f0" : "none", fontSize: 14, color: "#1a1a1a" }}>{email.name}</td>
                        <td style={{ padding: "12px 8px", borderBottom: i < sentEmailsWithViews.length - 1 ? "1px solid #e2e8f0" : "none", fontSize: 14, color: "#1a1a1a" }}>{email.email}</td>
                        <td style={{ padding: "12px 8px", borderBottom: i < sentEmailsWithViews.length - 1 ? "1px solid #e2e8f0" : "none", fontSize: 14, color: "#1a1a1a" }}>{email.subject}</td>
                        <td style={{ padding: "12px 8px", textAlign: 'right', borderBottom: i < sentEmailsWithViews.length - 1 ? "1px solid #e2e8f0" : "none", fontSize: 14, color: "#1a1a1a" }}>{email.views}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          {/* Hourly Breakdown */}
          {hourlySent && hourlyReceived && (
            <Section style={{ marginBottom: 32 }}>
              <Text style={{ fontSize: 18, fontWeight: 600, marginBottom: 16, color: "#1a1a1a" }}>Hourly Breakdown</Text>
              <div style={{ background: "#f8fafc", borderRadius: 12, padding: 20, border: "1px solid #e2e8f0" }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ padding: "8px", textAlign: 'left', borderBottom: "1px solid #e2e8f0", fontSize: 14, color: "#64748b", fontWeight: 500 }}>Hour</th>
                      <th style={{ padding: "8px", textAlign: 'right', borderBottom: "1px solid #e2e8f0", fontSize: 14, color: "#64748b", fontWeight: 500 }}>Sent</th>
                      <th style={{ padding: "8px", textAlign: 'right', borderBottom: "1px solid #e2e8f0", fontSize: 14, color: "#64748b", fontWeight: 500 }}>Received</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hourlySent.map((sent, i) => (
                      <tr key={i}>
                        <td style={{ padding: "12px 8px", borderBottom: i < hourlySent.length - 1 ? "1px solid #e2e8f0" : "none", fontSize: 14, color: "#1a1a1a" }}>{formatHour(i)}</td>
                        <td style={{ padding: "12px 8px", textAlign: 'right', borderBottom: i < hourlySent.length - 1 ? "1px solid #e2e8f0" : "none", fontSize: 14, color: "#1a1a1a" }}>{sent}</td>
                        <td style={{ padding: "12px 8px", textAlign: 'right', borderBottom: i < hourlySent.length - 1 ? "1px solid #e2e8f0" : "none", fontSize: 14, color: "#1a1a1a" }}>{hourlyReceived[i]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          {/* Footer */}
          <Section style={{ textAlign: "center", marginTop: 32, paddingTop: 24, borderTop: "1px solid #e2e8f0" }}>
            <Text style={{ fontSize: 14, color: "#64748b", margin: "0 0 16px" }}>
              Sent by <strong style={{ color: "#1a1a1a" }}>Email KPI App</strong>
            </Text>
            <Button
              href="https://email-kpi.vercel.app"
              style={{
                background: "#2563eb",
                color: "#fff",
                padding: "12px 24px",
                borderRadius: 8,
                textDecoration: "none",
                fontSize: 14,
                fontWeight: 500,
              }}
            >
              View Full Dashboard
            </Button>
          </Section>
        </Container>
      </Body>
    </Html>
  );
} 