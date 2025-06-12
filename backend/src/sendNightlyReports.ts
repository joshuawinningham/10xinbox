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
import logger from './utils/logger';

// Initialize Resend client
const resend = new Resend(process.env.RESEND_API_KEY);

// Add delay function at the top of the file after imports
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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

async function main() {
  try {
    logger.info('Starting nightly report generation');
    const { data: users, error } = await supabase
      .from('gmail_tokens')
      .select('user_id, email')
      .not('email', 'is', null);
    if (error) throw error;

    logger.info(`Found ${users.length} users to process`);

    for (const user of users) {
      if (!user.email) continue;

      // Fetch user's time zone from user_settings
      let tz = 'UTC';
      const { data: settingsRow, error: settingsError } = await supabase
        .from('user_settings')
        .select('time_zone')
        .eq('user_id', user.user_id)
        .single();
      if (settingsRow && settingsRow.time_zone) {
        tz = settingsRow.time_zone;
      }
      // Calculate yesterday and today in user's local time zone
      const now = DateTime.now().setZone(tz);
      const yesterday = now.minus({ days: 1 }).startOf('day');
      const today = now.startOf('day');
      const yesterdayISO = yesterday.toISO();
      const todayISO = today.toISO();
      const yesterdayDateStr = yesterday.toISODate();

      // Check if report already sent for this user/date
      const { data: sentRow, error: sentError } = await supabase
        .from('reports_sent')
        .select('id')
        .eq('user_id', user.user_id)
        .eq('date', yesterdayDateStr)
        .single();
      if (sentRow) {
        logger.info(`Report already sent for user ${user.user_id} on ${yesterdayDateStr}, skipping.`);
        continue;
      }

      // Get all emails for the user from yesterday (user's local time)
      const { data: emails, error: emailsError } = await supabase
        .from('sent_emails')
        .select('email_id, user_id, sent_at, to_email, to_name, subject, body')
        .eq('user_id', user.user_id)
        .gte('sent_at', yesterdayISO)
        .lt('sent_at', todayISO)
        .order('sent_at', { ascending: true });

      if (emailsError) {
        logger.error('Error fetching emails', { error: emailsError, userId: user.user_id });
        throw emailsError;
      }

      // Get emails_received from email_stats for the previous day
      let emailsReceived = 0;
      const { data: statsRow, error: statsError } = await supabase
        .from('email_stats')
        .select('emails_received')
        .eq('user_id', user.user_id)
        .eq('date', yesterdayDateStr)
        .single();
      if (statsRow && typeof statsRow.emails_received === 'number') {
        emailsReceived = statsRow.emails_received;
      }

      // Calculate basic metrics
      const emailsSent = emails.length;

      // Calculate Inbox Zero Business Days and Consecutive Days for the current month up to yesterday
      let inboxZeroBusinessDays = 0;
      let consecutiveInboxZeroDays = 0;
      try {
        // Get all inbox zero records for the current month up to yesterday
        const monthStart = yesterday.startOf('month');
        const { data: inboxZeroHistory, error: inboxZeroHistoryError } = await supabase
          .from('inbox_zero_day')
          .select('date, inboxCount')
          .eq('user_id', user.user_id)
          .gte('date', monthStart.toISODate())
          .lte('date', yesterdayDateStr);
        if (inboxZeroHistoryError) throw inboxZeroHistoryError;
        // Filter for business days (Mon-Fri)
        const businessDays = inboxZeroHistory.filter((d: any) => {
          const date = new Date(d.date);
          return date.getDay() !== 0 && date.getDay() !== 6; // not Sunday or Saturday
        });
        inboxZeroBusinessDays = businessDays.filter((d: any) => d.inboxCount === 0).length;
        // Calculate consecutive streak up to yesterday
        let streak = 0;
        for (let i = businessDays.length - 1; i >= 0; i--) {
          if (businessDays[i].inboxCount === 0) {
            streak++;
          } else {
            break;
          }
        }
        consecutiveInboxZeroDays = streak;
      } catch (err) {
        logger.error('Failed to calculate inbox zero business days or streak:', err);
      }

      // Fetch received emails from Gmail for the previous day and aggregate by hour
      let hourlyReceived = new Array(24).fill(0);
      try {
        // 1. Get a valid access token
        const { data: tokenRow, error: tokenError } = await supabase
          .from('gmail_tokens')
          .select('access_token')
          .eq('user_id', user.user_id)
          .single();
        if (tokenRow && tokenRow.access_token) {
          const oauth2Client = new google.auth.OAuth2();
          oauth2Client.setCredentials({ access_token: tokenRow.access_token });
          const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
          // 2. Calculate after/before in UTC seconds
          const after = Math.floor(yesterday.toUTC().toSeconds());
          const before = Math.floor(today.toUTC().toSeconds());
          // 3. Helper to fetch all messages matching a query (handles pagination)
          async function fetchAllMessages(q: string) {
            let messages: any[] = [];
            let nextPageToken: string | undefined = undefined;
            do {
              const res: GaxiosResponse<gmail_v1.Schema$ListMessagesResponse> = await gmail.users.messages.list({
                userId: 'me',
                q,
                pageToken: nextPageToken,
                maxResults: 500,
              });
              if (res.data.messages) messages = messages.concat(res.data.messages);
              nextPageToken = res.data.nextPageToken ?? undefined;
            } while (nextPageToken);
            return messages;
          }
          // 4. Fetch received messages for the previous day
          const receivedMessages = await fetchAllMessages(`after:${after} before:${before} label:INBOX -from:me`);
          // 5. Fetch message details to get internalDate (in parallel, limit concurrency)
          async function fetchInternalDates(messages: any[]) {
            const results: number[] = [];
            const batchSize = 20;
            for (let i = 0; i < messages.length; i += batchSize) {
              const batch = messages.slice(i, i + batchSize);
              const batchResults = await Promise.all(
                batch.map(async (msg) => {
                  const res = await gmail.users.messages.get({ userId: 'me', id: msg.id, format: 'metadata' });
                  return Number(res.data.internalDate);
                })
              );
              results.push(...batchResults);
            }
            return results;
          }
          const receivedDates = await fetchInternalDates(receivedMessages);
          // 6. Aggregate by hour (local to user)
          receivedDates.forEach((ts) => {
            const hour = DateTime.fromMillis(ts, { zone: tz }).hour;
            hourlyReceived[hour]++;
          });
        }
      } catch (err) {
        logger.error('Failed to fetch hourly received stats for email report:', err);
      }

      // Calculate hourly breakdown
      const hourlySent = new Array(24).fill(0);
      emails.forEach((email) => {
        const hour = new Date(email.sent_at).getHours();
        hourlySent[hour]++;
      });

      // Find peak activity hour
      const peakActivityHour = hourlySent.indexOf(Math.max(...hourlySent));
      const busiestHour = 0; // No received emails

      // Fetch avg. response time for the previous day
      let avgResponseTime = 'N/A';
      try {
        const responseRes = await fetch(`${BASE_URL}/api/gmail/response-time`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: user.user_id, time_zone: tz, day: 'yesterday' }),
        });
        const responseData = await responseRes.json();
        if (responseData.average_response_time != null) {
          avgResponseTime = responseData.average_response_time;
        }
      } catch (err) {
        logger.error('Failed to fetch avg. response time for nightly report:', err);
      }

      // Build sentEmailsWithViews for the report
      const sentEmailsWithViews = await Promise.all(
        emails.map(async (email) => {
          const { data: opens, error: opensError } = await supabase
            .from('email_opens')
            .select('id')
            .eq('user_id', user.user_id)
            .eq('email_id', email.email_id);
          return {
            name: email.to_name || '',
            email: email.to_email || '',
            subject: email.subject || '',
            views: opens ? opens.length : 0,
          };
        })
      );

      // Before sending the email, format the date safely
      const formattedDate = yesterdayDateStr
        ? DateTime.fromISO(yesterdayDateStr).toFormat('MM-dd-yyyy')
        : DateTime.now().toFormat('MM-dd-yyyy');

      // Send daily report
      await delay(1000);
      try {
        await sendEmail({
          to: user.email,
          subject: `Your Daily Email KPI Report for ${formattedDate}`,
          react: DailyReportEmail({
            date: yesterdayISO || '',
            emailsSent,
            emailsReceived,
            avgResponseTime,
            inboxZeroBusinessDays,
            consecutiveInboxZeroDays,
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
            sentEmailsWithViews,
          }),
        });
        logger.info(`Successfully sent daily report to ${user.email}`);
        // Insert a row into reports_sent to mark the report as sent
        await supabase.from('reports_sent').insert({
          user_id: user.user_id,
          date: yesterdayDateStr, // YYYY-MM-DD
          sent_at: new Date().toISOString()
        });
      } catch (error) {
        logger.error('Failed to send daily report', { error, userId: user.user_id, email: user.email });
      }
    }
    logger.info('Completed nightly report generation');
  } catch (error) {
    logger.error('Failed to send reports:', { error });
    if (error instanceof Error) {
      logger.error('Error details:', {
        message: error.message,
        stack: error.stack
      });
    } else {
      try {
        logger.error('Error details:', { error: JSON.stringify(error) });
      } catch (e) {
        logger.error('Error could not be stringified');
      }
    }
  }
}

main(); 