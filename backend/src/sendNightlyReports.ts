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

async function main() {
  try {
    const { data: users, error: userError } = await supabase.from('gmail_tokens').select('user_id, email, time_zone');
    if (userError) {
      console.error('Failed to fetch users for report cron job:', userError);
      process.exit(1);
    }
    const utcNow = DateTime.utc();
    for (const user of users) {
      try {
        const tz = user.time_zone || 'UTC';
        const now2 = utcNow.setZone(tz);
        if (now2.hour === 0 && now2.minute === 0) {
          const dateStr = now2.minus({ days: 1 }).startOf('day').toISODate();
          const { data: sentRow } = await supabase
            .from('reports_sent')
            .select('id')
            .eq('user_id', user.user_id)
            .eq('date', dateStr)
            .single();
          if (sentRow) {
            console.log(`Report already sent for user ${user.user_id} on ${dateStr}, skipping.`);
            continue;
          }
          const { data: stats, error: statsError } = await supabase
            .from('email_stats')
            .select('*')
            .eq('user_id', user.user_id)
            .eq('date', dateStr)
            .single();
          if (statsError || !stats) {
            console.error(`No stats for user ${user.user_id} on ${dateStr}`);
            continue;
          }
          const toEmail = user.email;
          if (!toEmail) {
            console.error(`No email for user ${user.user_id}. Skipping email send.`);
            continue;
          }
          let hourlySent: number[] = [];
          let hourlyReceived: number[] = [];
          try {
            const accessToken = await getValidAccessToken(user.user_id);
            const oauth2Client = new google.auth.OAuth2();
            oauth2Client.setCredentials({ access_token: accessToken });
            const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
            const now3 = DateTime.now().setZone(tz);
            const start = now3.startOf('day');
            const end = start.plus({ days: 1 });
            const after = Math.floor(start.toUTC().toSeconds());
            const before = Math.floor(end.toUTC().toSeconds());
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
            const sentMessages = await fetchAllMessages(`after:${after} before:${before} from:me`);
            const receivedMessages = await fetchAllMessages(`after:${after} before:${before} label:INBOX -from:me`);
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
            const sentDates = await fetchInternalDates(sentMessages);
            const receivedDates = await fetchInternalDates(receivedMessages);
            hourlySent = Array(24).fill(0);
            hourlyReceived = Array(24).fill(0);
            sentDates.forEach((ts) => {
              const hour = DateTime.fromMillis(ts, { zone: tz }).hour;
              hourlySent[hour]++;
            });
            receivedDates.forEach((ts) => {
              const hour = DateTime.fromMillis(ts, { zone: tz }).hour;
              hourlyReceived[hour]++;
            });
          } catch (err) {
            console.error('Failed to fetch hourly stats for email report:', err);
          }
          const inboxZeroRes = await fetch(`${BASE_URL}/api/gmail/inbox-zero-history`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: user.user_id, time_zone: tz }),
          });
          const inboxZeroHistory = await inboxZeroRes.json();
          const now4 = DateTime.now().setZone(tz);
          const currentYear = now4.year;
          const currentMonth = now4.month - 1;
          const businessDays = inboxZeroHistory.filter((d: any) => {
            const date = new Date(d.date);
            return (
              date.getFullYear() === currentYear &&
              date.getMonth() === currentMonth &&
              date.getDay() !== 0 &&
              date.getDay() !== 6
            );
          });
          const inboxZeroBusinessDays = businessDays.filter((d: any) => d.inboxCount === 0).length;
          let streak = 0;
          for (let i = businessDays.length - 1; i >= 0; i--) {
            if (businessDays[i].inboxCount === 0) {
              streak++;
            } else {
              break;
            }
          }
          const consecutiveInboxZeroDays = streak;
          const responseRes = await fetch(`${BASE_URL}/api/gmail/response-time`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: user.user_id, time_zone: tz, day: 'today' }),
          });
          const responseData = await responseRes.json();
          const avgResponseTime = responseData.average_response_time != null
            ? formatDuration(responseData.average_response_time)
            : '--';
          const html = await render(
            React.createElement(DailyReportEmail, {
              date: dateStr || '',
              emailsSent: stats.emails_sent,
              emailsReceived: stats.emails_received,
              avgResponseTime,
              inboxZeroBusinessDays,
              consecutiveInboxZeroDays,
              hourlySent,
              hourlyReceived,
            })
          );
          await resend.emails.send({
            from: 'onboarding@resend.dev',
            to: toEmail,
            subject: 'Your Daily Email KPI Report',
            html,
          });
          await supabase.from('reports_sent').insert({ user_id: user.user_id, date: dateStr });
          console.log(`Sent report to ${toEmail} for user ${user.user_id}`);
        }
      } catch (err) {
        console.error(`Failed to send report for user ${user.user_id}:`, err);
      }
    }
    process.exit(0);
  } catch (err) {
    console.error('Hourly report cron job error:', err);
    process.exit(1);
  }
}

main(); 