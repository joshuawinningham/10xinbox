import { render } from '@react-email/render';
import DailyReportEmail from '../emails/DailyReportEmail';
import RealTimeReportEmail from '../emails/RealTimeReportEmail';
import fs from 'fs';
import path from 'path';

// Sample data for preview
const sampleData = {
  date: '2024-03-14',
  emailsSent: 10,
  emailsReceived: 15,
  avgResponseTime: '2h 30m',
  inboxZeroBusinessDays: 5,
  inboxZeroStreak: 3,
  consecutiveInboxZeroDays: 3,
  currentInboxCount: 0,
  hourlySent: Array(24).fill(0),
  hourlyReceived: Array(24).fill(0),
  topSenders: [],
  topRecipients: [],
  responseTimeDistribution: [],
  peakActivityHour: 14,
  busiestHour: 15,
  totalResponseTime: 9000,
  quickestResponseTime: '5m',
  slowestResponseTime: '4h',
  emailThreads: 5,
  averageThreadLength: 3,
  longestThread: 7,
  sentEmailsWithViews: [],
  timezone: 'America/New_York'
};

async function generatePreviews() {
  // Create previews directory if it doesn't exist
  const previewsDir = path.join(__dirname, '../previews');
  if (!fs.existsSync(previewsDir)) {
    fs.mkdirSync(previewsDir);
  }

  // Generate HTML for both email templates
  const dailyReportHtml = await render(DailyReportEmail(sampleData));
  const realTimeReportHtml = await render(RealTimeReportEmail(sampleData));

  // Save the HTML files
  fs.writeFileSync(path.join(previewsDir, 'daily-report.html'), dailyReportHtml);
  fs.writeFileSync(path.join(previewsDir, 'real-time-report.html'), realTimeReportHtml);

  console.log('Email previews generated in the "previews" directory:');
  console.log('- daily-report.html');
  console.log('- real-time-report.html');
}

// Run the preview generation
generatePreviews().catch(console.error); 