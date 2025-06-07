// Script for Render Cron Job: Send nightly email KPI reports to all users
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';
import { google, gmail_v1 } from 'googleapis';
import { Resend } from 'resend';
import { render } from '@react-email/render';
import DailyReportEmail from '../emails/DailyReportEmail';
import React from 'react';
import { DateTime } from 'luxon';
import { GaxiosResponse } from 'gaxios';
import { sendEmail } from "./email";
import RealTimeReportEmail from "../emails/RealTimeReportEmail";
import { formatDistanceToNow } from "date-fns";

interface Email {
  id: string;
  userId: string;
  direction: 'sent' | 'received';
  date: Date;
  threadId?: string;
  senderEmail?: string;
  senderName?: string;
  recipientEmail?: string;
  recipientName?: string;
  isRead: boolean;
}

interface User {
  id: string;
  email: string | null;
}

const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

const resend = new Resend(process.env.RESEND_API_KEY);

function formatDuration(seconds: number | null): string {
  if (seconds == null) return '--';
  if (seconds < 60) return `${seconds}s`;
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  if (min < 60) return `${min}m${sec > 0 ? ` ${sec}s` : ''}`;
  const hr = Math.floor(min / 60);
  const remMin = min % 60;
  return `${hr}h${remMin > 0 ? ` ${remMin}m` : ''}${sec > 0 ? ` ${sec}s` : ''}`;
}

async function getValidAccessToken(user_id: string) {
  const { data, error } = await supabase
    .from('gmail_tokens')
    .select('*')
    .eq('user_id', user_id)
    .single();
  if (error || !data) throw new Error('No tokens found for user');
  const { access_token, refresh_token, expires_at } = data;
  if (new Date(expires_at) > new Date()) {
    return access_token;
  }
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${BASE_URL}/api/auth/google/callback`
  );
  oauth2Client.setCredentials({ refresh_token });
  const { token: newAccessToken } = await oauth2Client.getAccessToken();
  const newExpiry = oauth2Client.credentials.expiry_date;
  await supabase
    .from('gmail_tokens')
    .update({
      access_token: newAccessToken,
      expires_at: new Date(newExpiry!).toISOString(),
    })
    .eq('user_id', user_id);
  return newAccessToken;
}

// Helper to format duration as "X hours Y minutes"
function formatDurationMinutes(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} minutes`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (remainingMinutes === 0) {
    return `${hours} hours`;
  }
  return `${hours} hours ${remainingMinutes} minutes`;
}

// Helper to get time range for response time distribution
function getResponseTimeRange(minutes: number): string {
  if (minutes < 15) return "Under 15 minutes";
  if (minutes < 30) return "15-30 minutes";
  if (minutes < 60) return "30-60 minutes";
  if (minutes < 120) return "1-2 hours";
  if (minutes < 240) return "2-4 hours";
  if (minutes < 480) return "4-8 hours";
  if (minutes < 1440) return "8-24 hours";
  return "Over 24 hours";
}

async function main() {
  try {
    const { data: users, error } = await supabase
      .from('gmail_tokens')
      .select('user_id, email')
      .not('email', 'is', null);
    if (error) throw error;

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const user of users) {
      if (!user.email) continue;

      // Get all emails for the user from yesterday
      const { data: emails, error: emailsError } = await supabase
        .from('sent_emails')
        .select('email_id, user_id, sent_at, to_email, to_name, subject, body')
        .eq('user_id', user.user_id)
        .gte('sent_at', yesterday.toISOString())
        .lt('sent_at', today.toISOString())
        .order('sent_at', { ascending: true });

      if (emailsError) throw emailsError;

      // Get current inbox count
      const { count: currentInboxCount, error: inboxCountError } = await supabase
        .from('sent_emails')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.user_id)
        .eq('inbox', true);
      if (inboxCountError) throw inboxCountError;

      // Calculate basic metrics
      const emailsSent = emails.length;
      const emailsReceived = 0;

      // Calculate hourly breakdown
      const hourlySent = new Array(24).fill(0);
      emails.forEach((email) => {
        const hour = new Date(email.sent_at).getHours();
        hourlySent[hour]++;
      });
      const hourlyReceived = new Array(24).fill(0); // No received emails

      // Find peak activity hour
      const peakActivityHour = hourlySent.indexOf(Math.max(...hourlySent));
      const busiestHour = 0; // No received emails

      // Calculate inbox zero days
      const { count: inboxZeroDays, error: inboxZeroDaysError } = await supabase
        .from('inbox_zero_day')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.user_id);
      if (inboxZeroDaysError) throw inboxZeroDaysError;

      // Calculate consecutive inbox zero days
      const { count: consecutiveInboxZeroDays, error: consecutiveInboxZeroDaysError } = await supabase
        .from('inbox_zero_day')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.user_id)
        .eq('consecutive', true);
      if (consecutiveInboxZeroDaysError) throw consecutiveInboxZeroDaysError;

      // Calculate business days for inbox zero
      const { count: businessDays, error: businessDaysError } = await supabase
        .from('inbox_zero_day')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.user_id)
        .eq('business_day', true);
      if (businessDaysError) throw businessDaysError;

      // Send daily report
      await sendEmail({
        to: user.email,
        subject: `Your Daily Email KPI Report for ${yesterday.toLocaleDateString()}`,
        react: DailyReportEmail({
          date: yesterday.toISOString(),
          emailsSent,
          emailsReceived,
          avgResponseTime: 'N/A',
          inboxZeroBusinessDays: businessDays ?? 0,
          consecutiveInboxZeroDays: consecutiveInboxZeroDays ?? 0,
          hourlySent,
          hourlyReceived,
          topSenders: [],
          topRecipients: [],
          responseTimeDistribution: [],
          peakActivityHour,
          busiestHour,
          totalResponseTime: 0,
          quickestResponseTime: undefined,
          slowestResponseTime: undefined,
          emailThreads: 0,
          averageThreadLength: 0,
          longestThread: 0,
        }),
      });

      // Send real-time report
      await sendEmail({
        to: user.email,
        subject: `Your Real-Time Email KPI Report for ${today.toLocaleDateString()}`,
        react: RealTimeReportEmail({
          date: today.toISOString(),
          emailsSent,
          emailsReceived,
          avgResponseTime: 'N/A',
          inboxZeroBusinessDays: businessDays ?? 0,
          consecutiveInboxZeroDays: consecutiveInboxZeroDays ?? 0,
          hourlySent,
          hourlyReceived,
          topSenders: [],
          topRecipients: [],
          responseTimeDistribution: [],
          peakActivityHour,
          busiestHour,
          totalResponseTime: 0,
          quickestResponseTime: undefined,
          slowestResponseTime: undefined,
          emailThreads: 0,
          averageThreadLength: 0,
          longestThread: 0,
        }),
      });
    }
    process.exit(0);
  } catch (error) {
    console.error('Failed to send reports:', error);
    if (error instanceof Error) {
      console.error('Error stack:', error.stack);
    }
    process.exit(1);
  }
}

main(); 