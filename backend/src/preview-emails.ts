import { render } from '@react-email/render';
import DailyReportEmail from '../emails/DailyReportEmail';
import RealTimeReportEmail from '../emails/RealTimeReportEmail';
import fs from 'fs';
import path from 'path';

// Sample data for preview
const sampleData = {
  date: new Date().toISOString(),
  emailsSent: 42,
  emailsReceived: 38,
  avgResponseTime: '2h 15m',
  inboxZeroBusinessDays: 5,
  consecutiveInboxZeroDays: 3,
  currentInboxCount: 12,
  hourlySent: Array.from({ length: 24 }, () => Math.floor(Math.random() * 10)),
  hourlyReceived: Array.from({ length: 24 }, () => Math.floor(Math.random() * 10)),
  topSenders: [
    { email: 'john@example.com', name: 'John Doe', count: 15 },
    { email: 'jane@example.com', name: 'Jane Smith', count: 12 },
    { email: 'bob@example.com', name: 'Bob Johnson', count: 8 }
  ],
  topRecipients: [
    { email: 'team@example.com', name: 'Team', count: 20 },
    { email: 'support@example.com', name: 'Support', count: 15 },
    { email: 'sales@example.com', name: 'Sales', count: 10 }
  ],
  responseTimeDistribution: [
    { range: '0-1 hour', count: 25 },
    { range: '1-4 hours', count: 15 },
    { range: '4-24 hours', count: 8 },
    { range: '>24 hours', count: 2 }
  ],
  peakActivityHour: 14,
  busiestHour: 10,
  totalResponseTime: 5400,
  quickestResponseTime: '5m',
  slowestResponseTime: '48h',
  emailThreads: 12,
  averageThreadLength: 3.5,
  longestThread: 8,
  sentEmailsWithViews: [
    { name: 'John Doe', email: 'john@example.com', subject: 'Welcome!', views: 3 },
    { name: 'Jane Smith', email: 'jane@example.com', subject: 'Your Invoice', views: 1 },
    { name: 'Bob Johnson', email: 'bob@example.com', subject: 'Meeting Follow-up', views: 0 },
  ],
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