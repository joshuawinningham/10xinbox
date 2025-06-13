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

      // Calculate inbox zero business days and streak
      let inboxZeroBusinessDays = 0;
      let inboxZeroStreak = 0;
      try {
        // Get the first day of the current month
        const firstDayOfMonth = today.startOf('month');
        
        // Get inbox zero data from the database
        const { data: inboxZeroData, error: inboxZeroError } = await supabase
          .from('inbox_zero_days')
          .select('date, inbox_count')
          .eq('user_id', user.user_id)
          .gte('date', firstDayOfMonth.toISODate())
          .lte('date', yesterday.toISODate())
          .order('date', { ascending: true });

        if (inboxZeroError) {
          throw inboxZeroError;
        }

        // Filter for business days (Monday to Friday) and count inbox zero days
        const businessDays = inboxZeroData.filter(day => {
          const date = DateTime.fromISO(day.date);
          const dayOfWeek = date.weekday;
          return dayOfWeek >= 1 && dayOfWeek <= 5 && day.inbox_count === 0;
        });

        inboxZeroBusinessDays = businessDays.length;

        // Calculate business days streak
        let currentStreak = 0;
        let maxStreak = 0;
        let lastDate: DateTime | null = null;

        for (const day of businessDays) {
          const currentDate = DateTime.fromISO(day.date);
          
          if (lastDate) {
            const dayDiff = currentDate.diff(lastDate, 'days').days;
            if (dayDiff === 1) {
              currentStreak++;
              maxStreak = Math.max(maxStreak, currentStreak);
            } else {
              currentStreak = 1;
            }
          } else {
            currentStreak = 1;
            maxStreak = 1;
          }
          
          lastDate = currentDate;
        }

        inboxZeroStreak = maxStreak;
      } catch (error) {
        logger.error('Failed to calculate inbox zero business days or streak:', error);
        inboxZeroBusinessDays = 0;
        inboxZeroStreak = 0;
      }

      // Fetch received emails from Gmail for the previous day and aggregate by hour
      let hourlyReceived = new Array(24).fill(0);
      try {
        // 1. Get a valid access token
        const { data: tokenRow, error: tokenError } = await supabase
          .from('gmail_tokens')
          .select('access_token, refresh_token, expires_at')
          .eq('user_id', user.user_id)
          .single();
        
        if (tokenError) {
          logger.error('Failed to fetch Gmail token:', { error: tokenError, userId: user.user_id });
          throw tokenError;
        }
        
        if (!tokenRow || !tokenRow.access_token) {
          logger.error('No Gmail token found for user:', { userId: user.user_id });
          throw new Error('No Gmail token found');
        }

        const oauth2Client = new google.auth.OAuth2(
          process.env.GOOGLE_CLIENT_ID,
          process.env.GOOGLE_CLIENT_SECRET,
          process.env.GOOGLE_REDIRECT_URI
        );

        // Check if token needs refresh
        const tokenExpiry = new Date(tokenRow.expires_at);
        const now = new Date();
        if (now >= tokenExpiry) {
          logger.info('Refreshing expired Gmail token', { userId: user.user_id });
          try {
            oauth2Client.setCredentials({
              refresh_token: tokenRow.refresh_token
            });
            const { credentials } = await oauth2Client.refreshAccessToken();
            
            // Update the token in the database
            const { error: updateError } = await supabase
              .from('gmail_tokens')
              .update({
                access_token: credentials.access_token,
                expires_at: new Date(Date.now() + (credentials.expiry_date || 3600000)).toISOString()
              })
              .eq('user_id', user.user_id);
            
            if (updateError) {
              logger.error('Failed to update refreshed token:', { error: updateError, userId: user.user_id });
              throw updateError;
            }
            
            oauth2Client.setCredentials({ access_token: credentials.access_token });
          } catch (refreshError) {
            logger.error('Failed to refresh Gmail token:', { error: refreshError, userId: user.user_id });
            throw refreshError;
          }
        } else {
          oauth2Client.setCredentials({ access_token: tokenRow.access_token });
        }

        const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

        // 2. Calculate after/before in UTC seconds
        const after = Math.floor(yesterday.toUTC().toSeconds());
        const before = Math.floor(today.toUTC().toSeconds());
        
        logger.info('Fetching Gmail messages', { 
          userId: user.user_id, 
          after, 
          before,
          timezone: tz 
        });

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
            if (res.data.messages) {
              messages = messages.concat(res.data.messages);
              logger.debug('Fetched messages batch', { 
                count: res.data.messages.length,
                total: messages.length,
                query: q
              });
            }
            nextPageToken = res.data.nextPageToken ?? undefined;
          } while (nextPageToken);
          return messages;
        }

        // 4. Fetch received messages for the previous day
        const receivedMessages = await fetchAllMessages(`after:${after} before:${before} label:INBOX -from:me`);
        
        logger.info('Fetched received messages', { 
          count: receivedMessages.length,
          userId: user.user_id 
        });

        if (receivedMessages.length === 0) {
          logger.info('No received messages found for the period', {
            userId: user.user_id,
            after,
            before
          });
        }

        // 5. Fetch message details to get internalDate (in parallel, limit concurrency)
        async function fetchInternalDates(messages: any[]) {
          const results: number[] = [];
          const batchSize = 20;
          for (let i = 0; i < messages.length; i += batchSize) {
            const batch = messages.slice(i, i + batchSize);
            const batchResults = await Promise.all(
              batch.map(async (msg) => {
                try {
                  const res = await gmail.users.messages.get({ userId: 'me', id: msg.id, format: 'metadata' });
                  return Number(res.data.internalDate);
                } catch (error) {
                  logger.error('Failed to fetch message details', {
                    error,
                    messageId: msg.id,
                    userId: user.user_id
                  });
                  return null;
                }
              })
            );
            results.push(...batchResults.filter((date): date is number => date !== null));
          }
          return results;
        }

        const receivedDates = await fetchInternalDates(receivedMessages);
        
        logger.info('Processed received dates', {
          count: receivedDates.length,
          userId: user.user_id
        });

        // 6. Aggregate by hour (local to user)
        receivedDates.forEach((ts) => {
          // Convert UTC timestamp to user's local timezone
          const localTime = DateTime.fromMillis(ts).setZone(tz);
          if (localTime.isValid) {
            hourlyReceived[localTime.hour]++;
          } else {
            logger.warn('Invalid timestamp encountered', {
              timestamp: ts,
              userId: user.user_id
            });
          }
        });

        logger.info('Hourly received breakdown', {
          hourlyReceived,
          userId: user.user_id
        });

      } catch (err) {
        logger.error('Failed to fetch hourly received stats for email report:', {
          error: err,
          userId: user.user_id,
          timezone: tz
        });
        // Don't throw here, continue with empty hourlyReceived array
      }

      // Calculate hourly breakdown
      const hourlySent = new Array(24).fill(0);
      emails.forEach((email) => {
        // Convert sent_at to user's local timezone
        const localTime = DateTime.fromISO(email.sent_at).setZone(tz);
        if (localTime.isValid) {
          hourlySent[localTime.hour]++;
        }
      });

      // Find peak activity hour
      const peakActivityHour = hourlySent.indexOf(Math.max(...hourlySent));
      const busiestHour = hourlyReceived.indexOf(Math.max(...hourlyReceived));

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
            inboxZeroStreak,
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
            timezone: tz
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