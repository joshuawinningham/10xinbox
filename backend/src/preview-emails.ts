import { render } from '@react-email/render';
import DailyReportEmail from '../emails/DailyReportEmail';
import RealTimeReportEmail from '../emails/RealTimeReportEmail';
import fs from 'fs';
import path from 'path';

// Sample data for preview
const sampleData = {
  date: new Date().toISOString().split('T')[0],
  newThreads: 5,
  replies: 3,
  totalSent: 8,
  emailsSent: 8,
  emailsReceived: 12,
  avgResponseTime: '26s',
  inboxZeroWorkingDays: 15,
  inboxZeroStreak: 3,
  consecutiveInboxZeroDays: 3,
  currentInboxCount: 4,
  hourlySent: Array(24).fill(0).map(() => Math.floor(Math.random() * 5)),
  hourlyReceived: Array(24).fill(0).map(() => Math.floor(Math.random() * 5)),
  topSenders: [
    { email: 'alice@example.com', name: 'Alice Smith', count: 5 },
    { email: 'bob@example.com', name: 'Bob Jones', count: 3 },
  ],
  topRecipients: [
    { email: 'charlie@example.com', name: 'Charlie Brown', count: 4 },
    { email: 'diana@example.com', name: 'Diana Prince', count: 2 },
  ],
  responseTimeDistribution: [
    { range: '< 5 min', count: 10 },
    { range: '5-15 min', count: 5 },
    { range: '15-30 min', count: 3 },
    { range: '30-60 min', count: 2 },
  ],
  peakActivityHour: 14,
  busiestHour: 10,
  totalResponseTime: 1500000,
  quickestResponseTime: '45s',
  slowestResponseTime: '2h 15m',
  emailThreads: 25,
  averageThreadLength: 3.5,
  longestThread: 8,
  sentEmailsWithViews: [
    { name: 'Alice Smith', email: 'alice@example.com', subject: 'Project Update', views: 2, isReply: false },
    { name: 'Bob Jones', email: 'bob@example.com', subject: 'Re: Meeting Notes', views: 1, isReply: true },
  ],
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