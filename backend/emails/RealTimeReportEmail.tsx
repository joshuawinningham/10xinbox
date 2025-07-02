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
  newThreads: number;
  replies: number;
  totalSent: number;
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
  sentEmailsWithViews?: Array<{ name: string; email: string; subject: string; views: number; isReply: boolean }>;
};

const baseUrl = "https://app.10xinbox.com";

// Consistent styling constants
const styles = {
  container: {
    background: "#fff",
    borderRadius: 12,
    padding: 32,
    margin: "40px auto",
    maxWidth: 600,
    boxShadow: "0 2px 12px #0001"
  },
  header: {
    textAlign: "center" as const,
    marginBottom: 32
  },
  title: {
    fontSize: 24,
    fontWeight: 700,
    margin: 0,
    letterSpacing: -0.5,
    color: "#1a1a1a"
  },
  subtitle: {
    fontSize: 16,
    color: "#666",
    margin: "8px 0 0"
  },
  section: {
    marginBottom: 32
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 600,
    marginBottom: 16,
    color: "#1a1a1a"
  },
  card: {
    background: "#f8fafc",
    borderRadius: 12,
    padding: 24,
    border: "1px solid #e2e8f0",
    height: '100%',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    textAlign: 'center' as const,
  },
  gradientCard: {
    borderRadius: 12,
    padding: 16,
    textAlign: "center" as const,
    color: "#fff",
    height: '100%',
    minHeight: 90,
    display: 'flex',
    flexDirection: 'column' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
  },
  cardLabel: {
    fontSize: 14,
    color: "#64748b",
    margin: "0 0 8px"
  },
  cardValue: {
    fontSize: 28,
    fontWeight: 700,
    margin: "0 0 8px",
    color: "#1a1a1a"
  },
  cardSubtext: {
    fontSize: 12,
    color: "#64748b",
    margin: 0
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const
  },
  tableHeader: {
    padding: "12px 8px",
    textAlign: 'left' as const,
    borderBottom: "1px solid #e2e8f0",
    fontSize: 14,
    color: "#64748b",
    fontWeight: 500
  },
  tableHeaderRight: {
    padding: "12px 8px",
    textAlign: 'right' as const,
    borderBottom: "1px solid #e2e8f0",
    fontSize: 14,
    color: "#64748b",
    fontWeight: 500
  },
  tableCell: {
    padding: "12px 8px",
    borderBottom: "1px solid #e2e8f0",
    fontSize: 14,
    color: "#1a1a1a"
  },
  tableCellRight: {
    padding: "12px 8px",
    textAlign: 'right' as const,
    borderBottom: "1px solid #e2e8f0",
    fontSize: 14,
    color: "#1a1a1a"
  },
  footer: {
    textAlign: "center" as const,
    marginTop: 32,
    paddingTop: 24,
    borderTop: "1px solid #e2e8f0"
  },
  footerText: {
    fontSize: 14,
    color: "#64748b",
    margin: "0 0 16px"
  },
  button: {
    background: "#2563eb",
    color: "#fff",
    padding: "12px 24px",
    borderRadius: 8,
    textDecoration: "none",
    fontSize: 14,
    fontWeight: 500
  }
};

export default function RealTimeReportEmail({
  date,
  newThreads,
  replies,
  totalSent,
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
        <Container style={styles.container}>
          {/* Header with logo and title */}
          <Section style={styles.header}>
            <Img src={`${baseUrl}/logo.png`} width={64} height={64} alt="Logo" style={{ margin: "0 auto 16px" }} />
            <Text style={styles.title}>
              Your Real-Time Email KPI Report
            </Text>
            <Text style={styles.subtitle}>
              {formatDate(date)}
            </Text>
          </Section>

          {/* Main Stats Grid (table-based for email compatibility) */}
          <Section style={{ marginBottom: 32 }}>
            <table width="100%" cellPadding="0" cellSpacing="0" style={{ borderSpacing: 0, borderCollapse: 'collapse' }}>
              <tr>
                <td style={{ width: '50%', padding: '0 8px' }}>
                  <div style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', borderRadius: 12, padding: 16, color: '#fff', textAlign: 'center', minHeight: 90 }}>
                    <div style={{ fontSize: 14, opacity: 0.9, marginBottom: 8 }}>Emails Received</div>
                    <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>{emailsReceived}</div>
                    <div style={{ fontSize: 12, opacity: 0, height: 16 }}>&nbsp;</div>
                  </div>
                </td>
                <td style={{ width: '50%', padding: '0 8px' }}>
                  <div style={{ background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)', borderRadius: 12, padding: 16, color: '#fff', textAlign: 'center', minHeight: 90 }}>
                    <div style={{ fontSize: 14, opacity: 0.9, marginBottom: 8 }}>Outgoing Emails</div>
                    <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>{totalSent}</div>
                    <div style={{ fontSize: 12, opacity: 0.9 }}>{newThreads} new &middot; {replies} replies</div>
                  </div>
                </td>
              </tr>
            </table>
          </Section>

          {/* Performance Metrics (table-based for email compatibility) */}
          <Section style={{ marginBottom: 32 }}>
            <Text style={styles.sectionTitle}>Performance Metrics</Text>
            <table width="100%" cellPadding="0" cellSpacing="0" style={{ borderSpacing: 0, borderCollapse: 'collapse' }}>
              <tr>
                <td style={{ width: '50%', padding: '0 8px' }}>
                  <div style={{ background: '#f8fafc', borderRadius: 12, padding: 16, border: '1px solid #e2e8f0', textAlign: 'center', minHeight: 90 }}>
                    <div style={{ fontSize: 14, color: '#64748b', marginBottom: 8 }}>Avg. Response Time</div>
                    <div style={{ fontSize: 28, fontWeight: 700, color: '#1a1a1a', marginBottom: 8 }}>{avgResponseTime}</div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>{replies} replies</div>
                  </div>
                </td>
                <td style={{ width: '50%', padding: '0 8px' }}>
                  <div style={{ background: '#f8fafc', borderRadius: 12, padding: 16, border: '1px solid #e2e8f0', textAlign: 'center', minHeight: 90 }}>
                    <div style={{ fontSize: 14, color: '#64748b', marginBottom: 8 }}>Inbox Zero Days</div>
                    <div style={{ fontSize: 28, fontWeight: 700, color: '#1a1a1a', marginBottom: 8 }}>{inboxZeroWorkingDays}</div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>Current Streak: {inboxZeroStreak} days</div>
                  </div>
                </td>
              </tr>
            </table>
          </Section>

          {/* Activity Hours (table-based for email compatibility) */}
          <Section style={{ marginBottom: 32 }}>
            <Text style={styles.sectionTitle}>Activity Hours</Text>
            <table width="100%" cellPadding="0" cellSpacing="0" style={{ borderSpacing: 0, borderCollapse: 'collapse' }}>
              <tr>
                <td style={{ width: '50%', padding: '0 8px' }}>
                  <div style={{ background: '#f8fafc', borderRadius: 12, padding: 16, border: '1px solid #e2e8f0', textAlign: 'center', minHeight: 90 }}>
                    <div style={{ fontSize: 14, color: '#64748b', marginBottom: 8 }}>Peak Activity</div>
                    <div style={{ fontSize: 28, fontWeight: 700, color: '#1a1a1a', marginBottom: 8 }}>{peakActivityHour !== undefined ? formatHour(peakActivityHour) : '--'}</div>
                    <div style={{ fontSize: 12, color: '#64748b', height: 16 }}>&nbsp;</div>
                  </div>
                </td>
                <td style={{ width: '50%', padding: '0 8px' }}>
                  <div style={{ background: '#f8fafc', borderRadius: 12, padding: 16, border: '1px solid #e2e8f0', textAlign: 'center', minHeight: 90 }}>
                    <div style={{ fontSize: 14, color: '#64748b', marginBottom: 8 }}>Busiest Hour</div>
                    <div style={{ fontSize: 28, fontWeight: 700, color: '#1a1a1a', marginBottom: 8 }}>{busiestHour !== undefined ? formatHour(busiestHour) : '--'}</div>
                    <div style={{ fontSize: 12, color: '#64748b', height: 16 }}>&nbsp;</div>
                  </div>
                </td>
              </tr>
            </table>
          </Section>

          {/* Top Contacts */}
          {(topSenders?.length || topRecipients?.length) && (
            <Section style={styles.section}>
              <Text style={styles.sectionTitle}>Top Contacts</Text>
              <Row>
                {topSenders?.length && (
                  <Column style={{ padding: "0 8px" }}>
                    <div style={styles.card}>
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
                    <div style={styles.card}>
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
            <Section style={styles.section}>
              <Text style={styles.sectionTitle}>Response Time Distribution</Text>
              <div style={styles.card}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.tableHeader}>Time Range</th>
                      <th style={styles.tableHeaderRight}>Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {responseTimeDistribution.map((item, i) => (
                      <tr key={i}>
                        <td style={{ ...styles.tableCell, borderBottom: i < responseTimeDistribution.length - 1 ? "1px solid #e2e8f0" : "none" }}>{item.range}</td>
                        <td style={{ ...styles.tableCellRight, borderBottom: i < responseTimeDistribution.length - 1 ? "1px solid #e2e8f0" : "none" }}>{item.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          {/* Sent Emails & View Counts Section */}
          {sentEmailsWithViews && sentEmailsWithViews.length > 0 && (
            <Section style={styles.section}>
              <Text style={styles.sectionTitle}>Sent Emails & View Counts</Text>
              <div style={styles.card}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.tableHeader}>Name</th>
                      <th style={styles.tableHeader}>Email</th>
                      <th style={styles.tableHeader}>Subject</th>
                      <th style={styles.tableHeaderRight}>Views</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sentEmailsWithViews.map((email, i) => (
                      <tr key={i}>
                        <td style={{ ...styles.tableCell, borderBottom: i < sentEmailsWithViews.length - 1 ? "1px solid #e2e8f0" : "none" }}>{email.name}</td>
                        <td style={{ ...styles.tableCell, borderBottom: i < sentEmailsWithViews.length - 1 ? "1px solid #e2e8f0" : "none" }}>{email.email}</td>
                        <td style={{ ...styles.tableCell, borderBottom: i < sentEmailsWithViews.length - 1 ? "1px solid #e2e8f0" : "none" }}>{email.subject}</td>
                        <td style={{ ...styles.tableCellRight, borderBottom: i < sentEmailsWithViews.length - 1 ? "1px solid #e2e8f0" : "none" }}>{email.views}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          {/* Hourly Breakdown */}
          {hourlySent && hourlyReceived && (
            <Section style={styles.section}>
              <Text style={styles.sectionTitle}>Hourly Breakdown</Text>
              <div style={styles.card}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.tableHeader}>Hour</th>
                      <th style={styles.tableHeaderRight}>Sent</th>
                      <th style={styles.tableHeaderRight}>Received</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hourlySent.map((sent, i) => (
                      <tr key={i}>
                        <td style={{ ...styles.tableCell, borderBottom: i < hourlySent.length - 1 ? "1px solid #e2e8f0" : "none" }}>{formatHour(i)}</td>
                        <td style={{ ...styles.tableCellRight, borderBottom: i < hourlySent.length - 1 ? "1px solid #e2e8f0" : "none" }}>{sent}</td>
                        <td style={{ ...styles.tableCellRight, borderBottom: i < hourlySent.length - 1 ? "1px solid #e2e8f0" : "none" }}>{hourlyReceived[i]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          {/* Footer */}
          <Section style={styles.footer}>
            <Text style={styles.footerText}>
              Sent by <strong style={{ color: "#1a1a1a" }}>Email KPI App</strong>
            </Text>
            <Button
              href={baseUrl}
              style={styles.button}
            >
              View Full Dashboard
            </Button>
          </Section>
        </Container>
      </Body>
    </Html>
  );
} 