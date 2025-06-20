import Fastify from 'fastify';
import dotenv from 'dotenv';
import { google, gmail_v1 } from 'googleapis';
import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';
import cron from 'node-cron';
import { Resend } from 'resend';
import { render } from "@react-email/render";
import DailyReportEmail from "../emails/DailyReportEmail";
import React from 'react';
import cors from '@fastify/cors';
import { DateTime } from 'luxon';
import { GaxiosResponse } from 'gaxios';
import { v4 as uuidv4 } from 'uuid';
import RealTimeReportEmail from "../emails/RealTimeReportEmail";
import { sendEmail } from './email';
import fastifyMultipart from '@fastify/multipart';
import { calculateResponseTime } from './updateResponseTimeCache';
import { getValidAccessToken } from './utils/gmail';
import { OAuth2Client } from 'google-auth-library';

dotenv.config({ path: '.env.local' });

const fastify = Fastify({ logger: true });
fastify.register(fastifyMultipart);

// Register CORS for development
fastify.register(cors, {
  origin: true,
  credentials: true,
});

const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  `${BASE_URL}/api/auth/google/callback`
);

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/userinfo.email',
  'openid',
  'email',
  'profile',
];

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

const resend = new Resend(process.env.RESEND_API_KEY);

// Place this at the top of your file, before any usage
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

fastify.get('/health', async (request, reply) => {
  return { status: 'ok' };
});

// Root endpoint for Render health checks
fastify.get('/', async (request, reply) => {
  return { status: 'ok', message: 'Email KPI Backend API' };
});

// Endpoint to start OAuth flow
fastify.get('/api/auth/google', async (request, reply) => {
  const { user_id } = request.query as { user_id?: string };
  if (!user_id) {
    return reply.status(400).send({ error: 'Missing user_id' });
  }
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
    state: user_id,
  });
  reply.redirect(url);
});

// OAuth callback endpoint
fastify.get('/api/auth/google/callback', async (request, reply) => {
  const { code, state } = request.query as { code?: string; state?: string };
  if (!code || !state) {
    return reply.redirect(`${FRONTEND_URL}/?gmail_error=1`);
  }
  try {
    const { tokens } = await oauth2Client.getToken(code);

    // Decode the id_token to get the user's email and name
    const decoded: any = jwt.decode(tokens.id_token as string);
    const email = decoded?.email;
    const name = decoded?.name || decoded?.given_name || '';

    // Store tokens in Supabase using the user_id (UUID) from state
    const { error } = await supabase
      .from('gmail_tokens')
      .upsert({
        user_id: state,
        email,
        name, // Store the name
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: new Date(Date.now() + (tokens.expiry_date ? tokens.expiry_date - Date.now() : 0)).toISOString(),
        created_at: new Date().toISOString(),
      });

    if (error) {
      return reply.redirect(`${FRONTEND_URL}/?gmail_error=1`);
    }

    return reply.redirect(`${FRONTEND_URL}/?gmail_connected=1`);
  } catch (err) {
    fastify.log.error(err);
    return reply.redirect(`${FRONTEND_URL}/?gmail_error=1`);
  }
});

// Test endpoint to get a valid Gmail access token for a user
fastify.get('/api/gmail/test-token', async (request, reply) => {
  const { user_id } = request.query as { user_id?: string };
  if (!user_id) {
    return reply.status(400).send({ error: 'Missing user_id' });
  }
  try {
    const accessToken = await getValidAccessToken(user_id);
    return reply.send({ access_token: accessToken });
  } catch (err: any) {
    fastify.log.error(err);
    return reply.status(500).send({ error: err.message || 'Failed to get access token' });
  }
});

// Endpoint to fetch and store previous day's email stats for a user
fastify.post('/api/gmail/fetch-stats', async (request, reply) => {
  const { user_id, time_zone, day } = request.body as { user_id?: string, time_zone?: string, day?: string };
  if (!user_id) {
    return reply.status(400).send({ error: 'Missing user_id' });
  }
  try {
    // 1. Get a valid access token
    const accessToken = await getValidAccessToken(user_id);

    // 2. Set up Gmail API client
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    // 3. Get user's time zone from param or user_settings
    let tz = time_zone;
    if (!tz) {
      const { data: settingsRow } = await supabase
        .from('user_settings')
        .select('time_zone')
        .eq('user_id', user_id)
        .single();
      tz = settingsRow?.time_zone || 'UTC';
    }

    // 4. Get date range in user's time zone
    const now = DateTime.now().setZone(tz);
    let start, end;
    if (day === 'today') {
      start = now.startOf('day');
    } else {
      start = now.minus({ days: 1 }).startOf('day');
    }
    end = start.plus({ days: 1 });
    const after = Math.floor(start.toUTC().toSeconds());
    const before = Math.floor(end.toUTC().toSeconds());

    // 5. Get detailed sent emails to calculate new threads vs replies
    const { count: replyCount, totalSent } = await calculateResponseTime(user_id, gmail, tz || 'UTC', day === 'today' ? 'today' : 'yesterday');
    const replies = replyCount || 0;
    const newThreads = totalSent - replies;

    // 6. Count received emails for the day (Inbox, not sent by me)
    const receivedRes = await gmail.users.messages.list({
      userId: 'me',
      q: `after:${after} before:${before} label:INBOX -from:me`,
    });
    const emails_received = receivedRes.data.resultSizeEstimate || 0;

    // 7. Store stats in Supabase (using local date string)
    const dateStr = start.toISODate();
    if (dateStr) {
      const { error } = await supabase
        .from('email_stats')
        .upsert({
          user_id,
          date: dateStr,
          emails_sent: totalSent,
          emails_received,
        }, { onConflict: 'user_id,date' });
      if (error) {
        // Log the error but don't block the response
        fastify.log.error('Failed to upsert email_stats:', error);
      }
    }
    
    return reply.send({ 
      success: true, 
      total_sent: totalSent,
      new_threads: newThreads,
      replies: replies,
      emails_received 
    });
  } catch (err: any) {
    fastify.log.error(err);
    // Check for insufficient permissions error from Google
    if (err && err.errors && Array.isArray(err.errors)) {
      const insufficient = err.errors.find((e: any) => e.reason === 'insufficientPermissions');
      if (insufficient) {
        return reply.status(403).send({ error: 'insufficient_permissions' });
      }
    }
    return reply.status(500).send({ error: err.message || 'Failed to fetch/store email stats' });
  }
});

// Cron job: fetch and store email stats for all users every day at 1am UTC
cron.schedule('0 1 * * *', async () => {
  try {
    const { data: users, error } = await supabase.from('gmail_tokens').select('user_id');
    if (error) {
      fastify.log.error('Failed to fetch users for cron job:', error);
      return;
    }
    for (const user of users) {
      try {
        // Directly call the fetch-stats logic for each user
        await fastify.inject({
          method: 'POST',
          url: '/api/gmail/fetch-stats',
          payload: { user_id: user.user_id },
        });
        fastify.log.info(`Fetched and stored stats for user ${user.user_id}`);
      } catch (err) {
        fastify.log.error(`Failed for user ${user.user_id}:`, err);
      }
    }
  } catch (err) {
    fastify.log.error('Cron job error:', err);
  }
});

// Note: Daily email reports are now handled by the dedicated nightly report script (sendNightlyReports.ts)
// which runs once per day at midnight in each user's time zone.

// Endpoint to manually send the daily report to a user (for testing or on-demand)
fastify.post('/api/report/send', async (request, reply) => {
  const { user_id } = request.body as { user_id?: string };
  if (!user_id) {
    return reply.status(400).send({ error: 'Missing user_id' });
  }
  try {
    // Fetch user email from gmail_tokens, but time zone from user_settings
    const { data: user, error: userError } = await supabase
      .from('gmail_tokens')
      .select('email')
      .eq('user_id', user_id)
      .single();
    if (userError || !user?.email) {
      return reply.status(404).send({ error: 'User email not found' });
    }
    const toEmail = user.email;
    // Fetch time zone from user_settings
    const { data: settingsRow } = await supabase
      .from('user_settings')
      .select('time_zone')
      .eq('user_id', user_id)
      .single();
    const tz = settingsRow?.time_zone || 'UTC';

    // Get today's date in user's local time zone
    const nowManual = DateTime.now().setZone(tz);
    const dateStr = nowManual.startOf('day').toISODate();

    // Try to fetch today's stats
    let { data: stats, error: statsError } = await supabase
      .from('email_stats')
      .select('*')
      .eq('user_id', user_id)
      .eq('date', dateStr)
      .single();

    // If no stats, trigger a real-time fetch for today
    if (statsError || !stats) {
      const fetchRes = await fastify.inject({
        method: 'POST',
        url: '/api/gmail/fetch-stats',
        payload: { user_id, time_zone: tz, day: 'today' },
      });
      const fetchData = fetchRes.json();
      if (!fetchRes.statusCode || fetchRes.statusCode >= 400) {
        return reply.status(404).send({ error: 'No stats found for today and failed to fetch.' });
      }
      // Try to fetch again from DB
      ({ data: stats } = await supabase
        .from('email_stats')
        .select('*')
        .eq('user_id', user_id)
        .eq('date', dateStr)
        .single());
      if (!stats) {
        return reply.status(404).send({ error: 'No stats found for today after fetch.' });
      }
    }

    // Fetch hourly stats for today
    let hourlySent: number[] = [];
    let hourlyReceived: number[] = [];
    try {
      // 1. Get a valid access token
      const accessToken = await getValidAccessToken(user_id);
      // 2. Set up Gmail API client
      const oauth2Client = new google.auth.OAuth2();
      oauth2Client.setCredentials({ access_token: accessToken });
      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
      // 3. Get user's time zone from param or user_settings
      const { data: settingsRow } = await supabase
        .from('user_settings')
        .select('time_zone')
        .eq('user_id', user_id)
        .single();
      const tz = settingsRow?.time_zone || 'UTC';
      // 4. Get date range for today in user's time zone
      const nowManual = DateTime.now().setZone(tz);
      const start = nowManual.startOf('day');
      const end = start.plus({ days: 1 });
      const after = Math.floor(start.toUTC().toSeconds());
      const before = Math.floor(end.toUTC().toSeconds());
      // 5. Helper to fetch all messages matching a query (handles pagination)
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
      // 6. Fetch sent and received messages for today
      const sentMessages = await fetchAllMessages(`after:${after} before:${before} from:me`);
      const receivedMessages = await fetchAllMessages(`after:${after} before:${before} label:INBOX -from:me`);
      // 7. Fetch message details to get internalDate (in parallel, but limit concurrency)
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
      // 8. Aggregate by hour (local to user)
      hourlySent = Array(24).fill(0);
      hourlyReceived = Array(24).fill(0);
      sentDates.forEach((ts) => {
        const local = DateTime.fromMillis(ts, { zone: tz });
        if (local >= start && local < end) {
          hourlySent[local.hour]++;
        }
      });
      receivedDates.forEach((ts) => {
        const local = DateTime.fromMillis(ts, { zone: tz });
        if (local >= start && local < end) {
          hourlyReceived[local.hour]++;
        }
      });
    } catch (err) {
      fastify.log.error('Failed to fetch hourly stats for email report:', err);
    }

    // Fetch inbox zero history for the current month
    const inboxZeroRes = await fetch(`${BASE_URL}/api/gmail/inbox-zero-history`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id, time_zone: tz }),
    });
    const inboxZeroHistory = await inboxZeroRes.json();

    // Calculate Inbox Zero Working Days
    const nowBusiness = DateTime.now().setZone(tz);
    const currentYear = nowBusiness.year;
    const currentMonth = nowBusiness.month - 1;
    const workingDays = inboxZeroHistory.filter((d: any) => {
      const date = new Date(d.date);
      return (
        date.getFullYear() === currentYear &&
        date.getMonth() === currentMonth &&
        d.isWorkingDay // Use working days from user settings
      );
    });
    const inboxZeroWorkingDays = workingDays.filter((d: any) => d.inboxCount === 0).length;

    // Calculate Consecutive Inbox Zero Working Days
    let streak = 0;
    for (let i = workingDays.length - 1; i >= 0; i--) {
      if (workingDays[i].inboxCount === 0) {
        streak++;
      } else {
        break;
      }
    }
    const consecutiveInboxZeroDays = streak;

    // Calculate Avg. Response Time (for today)
    const responseRes = await fetch(`${BASE_URL}/api/gmail/response-time`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id, time_zone: tz, day: 'today' }),
    });
    const responseData = await responseRes.json();
    const avgResponseTime = responseData.average_response_time != null
      ? formatDuration(responseData.average_response_time)
      : '--';

    // Fetch all sent emails for the day
    const safeDateStr = dateStr || '';
    const nextDay = DateTime.fromISO(safeDateStr).plus({ days: 1 }).toISODate() || safeDateStr;
    const { data: sentEmails, error: sentEmailsError } = await supabase
      .from('sent_emails')
      .select('email_id, to_name, to_email, subject, sent_at, is_reply')
      .eq('user_id', user_id)
      .gte('sent_at', dateStr)
      .lt('sent_at', nextDay);
    if (sentEmailsError) throw sentEmailsError;

    // Calculate email stats
    const newThreads = sentEmails.filter(email => !email.is_reply).length;
    const replies = sentEmails.filter(email => email.is_reply).length;
    const totalSent = newThreads + replies;

    // For each sent email, count the number of open events
    const sentEmailsWithViews = await Promise.all(
      sentEmails.map(async (email) => {
        const { data: opens, error: opensError } = await supabase
          .from('email_opens')
          .select('id')
          .eq('user_id', user_id)
          .eq('email_id', email.email_id);
        return {
          name: email.to_name || '',
          email: email.to_email || '',
          subject: email.subject || '',
          views: opens ? opens.length : 0,
          isReply: email.is_reply
        };
      })
    );

    // Calculate peak activity and busiest hour from hourlySent/hourlyReceived
    const peakActivityHour = hourlySent && hourlySent.length ? hourlySent.indexOf(Math.max(...hourlySent)) : undefined;
    const busiestHour = hourlyReceived && hourlyReceived.length ? hourlyReceived.indexOf(Math.max(...hourlyReceived)) : undefined;

    // Send the email
    console.log('sentEmailsWithViews:', sentEmailsWithViews);
    await sendEmail({
      to: toEmail,
      subject: `Your Real-Time Email KPI Report for ${DateTime.fromISO(dateStr || '').toFormat('MM-dd-yyyy')}`,
      react: RealTimeReportEmail({
        date: dateStr || '',
        newThreads,
        replies,
        totalSent,
        emailsReceived: stats.emails_received,
        avgResponseTime,
        inboxZeroWorkingDays,
        inboxZeroStreak: consecutiveInboxZeroDays,
        consecutiveInboxZeroDays,
        hourlySent,
        hourlyReceived,
        currentInboxCount: stats.current_inbox_count,
        peakActivityHour,
        busiestHour,
        sentEmailsWithViews,
      })
    });

    return reply.send({ success: true, to: toEmail });
  } catch (err: any) {
    fastify.log.error(err);
    return reply.status(500).send({ error: err.message || 'Failed to send report' });
  }
});

// Endpoint to set the user's time zone
fastify.post('/api/auth/set-timezone', async (request, reply) => {
  const { user_id, time_zone } = request.body as { user_id?: string; time_zone?: string };
  if (!user_id || !time_zone) {
    fastify.log.error('Missing user_id or time_zone in request:', { user_id, time_zone });
    return reply.status(400).send({ error: 'Missing user_id or time_zone' });
  }
  fastify.log.info('Setting time zone:', { user_id, time_zone });
  const { error } = await supabase
    .from('user_settings')
    .upsert({ user_id, time_zone }, { onConflict: 'user_id' });
  if (error) {
    fastify.log.error('Failed to set time zone:', error);
    return reply.status(500).send({ error: error.message });
  }
  fastify.log.info('Successfully set time zone');
  return reply.send({ success: true });
});

// Endpoint to get the user's time zone
fastify.post('/api/auth/get-timezone', async (request, reply) => {
  const { user_id } = request.body as { user_id?: string };
  if (!user_id) {
    return reply.status(400).send({ error: 'Missing user_id' });
  }
  const { data, error } = await supabase
    .from('user_settings')
    .select('time_zone')
    .eq('user_id', user_id)
    .single();
  if (error) {
    return reply.status(500).send({ error: error.message });
  }
  return reply.send({ time_zone: data?.time_zone || 'UTC' });
});

// Endpoint to fetch historical email stats for a user
fastify.post('/api/gmail/stats', async (request, reply) => {
  const { user_id, days, time_zone } = request.body as { user_id?: string, days?: number, time_zone?: string };
  if (!user_id) {
    return reply.status(400).send({ error: 'Missing user_id' });
  }
  const numDays = days && days > 0 && days <= 90 ? days : 30; // Limit to max 90 days
  try {
    // Get user's time zone from param or user_settings
    let tz = time_zone;
    if (!tz) {
      const { data: settingsRow } = await supabase
        .from('user_settings')
        .select('time_zone')
        .eq('user_id', user_id)
        .single();
      tz = settingsRow?.time_zone || 'UTC';
    }
    // Calculate the start date in the user's local time zone
    const now = DateTime.now().setZone(tz);
    const startDate = now.minus({ days: numDays - 1 }).startOf('day');
    const startDateStr = startDate.toISODate();
    // Fetch stats from DB
    const { data: stats, error } = await supabase
      .from('email_stats')
      .select('*')
      .eq('user_id', user_id)
      .gte('date', startDateStr)
      .order('date', { ascending: true });
    if (error) {
      return reply.status(500).send({ error: error.message });
    }
    // Filter out any future days (relative to user's local time)
    const todayStr = now.toISODate();
    if (!todayStr) {
      return reply.status(500).send({ error: 'Failed to generate today\'s date string' });
    }
    const filteredStats = (stats || []).filter(row => row.date <= todayStr);
    return reply.send({ stats: filteredStats });
  } catch (err: any) {
    fastify.log.error(err);
    return reply.status(500).send({ error: err.message || 'Failed to fetch historical stats' });
  }
});

// Endpoint to get hourly stats for emails sent and received today
fastify.post('/api/gmail/hourly-stats', async (request, reply) => {
  const { user_id, time_zone } = request.body as { user_id?: string, time_zone?: string };
  if (!user_id) {
    return reply.status(400).send({ error: 'Missing user_id' });
  }
  try {
    // 1. Get a valid access token
    const accessToken = await getValidAccessToken(user_id);
    // 2. Set up Gmail API client
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    // 3. Get user's time zone from param or user_settings
    let tz = time_zone;
    if (!tz) {
      const { data: settingsRow } = await supabase
        .from('user_settings')
        .select('time_zone')
        .eq('user_id', user_id)
        .single();
      tz = settingsRow?.time_zone || 'UTC';
    }
    // 4. Get local day start/end in user's time zone
    const now = DateTime.now().setZone(tz);
    const localStart = now.startOf('day');
    const localEnd = localStart.plus({ days: 1 });
    // 5. Fetch a wider UTC window (midnight UTC to midnight UTC next day)
    const utcStart = localStart.toUTC().startOf('day');
    const utcEnd = utcStart.plus({ days: 2 });
    const after = Math.floor(utcStart.toSeconds());
    const before = Math.floor(utcEnd.toSeconds());
    // 6. Helper to fetch all messages matching a query (handles pagination)
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
    // 7. Fetch sent and received messages in the wide window
    const sentMessages = await fetchAllMessages(`after:${after} before:${before} from:me`);
    const receivedMessages = await fetchAllMessages(`after:${after} before:${before} label:INBOX -from:me`);
    // 8. Fetch message details to get internalDate (in parallel, but limit concurrency)
    async function fetchInternalDates(messages: any[]) {
      const results: { ts: number, id: string }[] = [];
      const batchSize = 20;
      for (let i = 0; i < messages.length; i += batchSize) {
        const batch = messages.slice(i, i + batchSize);
        const batchResults = await Promise.all(
          batch.map(async (msg) => {
            const res = await gmail.users.messages.get({ userId: 'me', id: msg.id, format: 'metadata' });
            return { ts: Number(res.data.internalDate), id: msg.id };
          })
        );
        results.push(...batchResults);
      }
      return results;
    }
    const sentDates = await fetchInternalDates(sentMessages);
    const receivedDates = await fetchInternalDates(receivedMessages);
    // 9. Filter and aggregate by local day/hour
    const sentByHour = Array(24).fill(0);
    const receivedByHour = Array(24).fill(0);
    sentDates.forEach(({ ts }) => {
      const local = DateTime.fromMillis(ts, { zone: tz });
      if (local >= localStart && local < localEnd) {
        sentByHour[local.hour]++;
      }
    });
    receivedDates.forEach(({ ts }) => {
      const local = DateTime.fromMillis(ts, { zone: tz });
      if (local >= localStart && local < localEnd) {
        receivedByHour[local.hour]++;
      }
    });
    return reply.send({ sent: sentByHour, received: receivedByHour });
  } catch (err: any) {
    fastify.log.error(err);
    // Check for insufficient permissions error from Google
    if (err && err.errors && Array.isArray(err.errors)) {
      const insufficient = err.errors.find((e: any) => e.reason === 'insufficientPermissions');
      if (insufficient) {
        return reply.status(403).send({ error: 'insufficient_permissions' });
      }
    }
    return reply.status(500).send({ error: err.message || 'Failed to fetch hourly stats' });
  }
});

// Endpoint to check if a user is connected to Gmail
fastify.post('/api/gmail/is-connected', async (request, reply) => {
  const { user_id } = request.body as { user_id?: string };
  if (!user_id) {
    return reply.status(400).send({ error: 'Missing user_id' });
  }
  try {
    const { data, error } = await supabase
      .from('gmail_tokens')
      .select('*')
      .eq('user_id', user_id)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116: No rows found
      return reply.status(500).send({ error: error.message });
    }
    if (!data) {
      return reply.send({ connected: false });
    }

    // Try to get a valid access token
    try {
      await getValidAccessToken(user_id); // This will throw if token is invalid
      return reply.send({ connected: true });
    } catch (err) {
      // Instead of deleting the row, clear only the token fields
      await supabase.from('gmail_tokens').update({
        access_token: null,
        refresh_token: null,
        expires_at: null
      }).eq('user_id', user_id);
      return reply.send({ connected: false });
    }
  } catch (err: any) {
    fastify.log.error(err);
    return reply.status(500).send({ error: err.message || 'Failed to check Gmail connection' });
  }
});

// Endpoint to disconnect Gmail for a user
fastify.post('/api/gmail/disconnect', async (request, reply) => {
  const { user_id } = request.body as { user_id?: string };
  if (!user_id) {
    return reply.status(400).send({ error: 'Missing user_id' });
  }
  try {
    // Remove the user's Gmail token row
    const { error } = await supabase
      .from('gmail_tokens')
      .delete()
      .eq('user_id', user_id);
    if (error) {
      return reply.status(500).send({ error: error.message });
    }
    return reply.send({ success: true });
  } catch (err: any) {
    fastify.log.error(err);
    return reply.status(500).send({ error: err.message || 'Failed to disconnect Gmail' });
  }
});

// Endpoint to get top senders for a user in a date range
fastify.post('/api/gmail/top-senders', async (request, reply) => {
    const { user_id, time_zone, start_date, end_date, limit } = request.body as {
        user_id?: string;
        time_zone?: string;
        start_date?: string;
        end_date?: string;
        limit?: number;
    };
    if (!user_id) {
        return reply.status(400).send({ error: 'Missing user_id' });
    }
    try {
        const accessToken = await getValidAccessToken(user_id);
        const oauth2Client = new google.auth.OAuth2();
        oauth2Client.setCredentials({ access_token: accessToken });
        const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
        // 3. Get user's time zone from param or user_settings
        let tz = time_zone;
        if (!tz) {
          const { data: settingsRow } = await supabase
            .from('user_settings')
            .select('time_zone')
            .eq('user_id', user_id)
            .single();
          tz = settingsRow?.time_zone || 'UTC';
        }
        // 4. Get date range
        let start, end;
        if (start_date && end_date) {
          start = DateTime.fromISO(start_date, { zone: tz }).startOf('day');
          end = DateTime.fromISO(end_date, { zone: tz }).endOf('day');
        } else {
          // Default: last 30 days
          end = DateTime.now().setZone(tz).endOf('day');
          start = end.minus({ days: 29 }).startOf('day');
        }
        const after = Math.floor(start.toUTC().toSeconds());
        const before = Math.floor(end.toUTC().toSeconds());
        // 5. Fetch all received messages in the date range (INBOX, not from me)
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
        const receivedMessages = await fetchAllMessages(`after:${after} before:${before} label:INBOX -from:me`);
        // 6. Fetch sender info for each message (batch, limit concurrency)
        const senderCounts: Record<string, { name: string; count: number }> = {};
        const batchSize = 20;
        for (let i = 0; i < receivedMessages.length; i += batchSize) {
          const batch = receivedMessages.slice(i, i + batchSize);
          const batchResults = await Promise.all(
            batch.map(async (msg) => {
              const res = await gmail.users.messages.get({ userId: 'me', id: msg.id, format: 'metadata' });
              const headers = res.data.payload?.headers || [];
              const fromHeader = headers.find((h) => h.name?.toLowerCase() === 'from');
              if (fromHeader && fromHeader.value) {
                // Parse name and email from the From header
                const match = fromHeader.value.match(/^(.*?)(?:\s*<(.+?)>)?$/);
                let name = '', email = '';
                if (match) {
                  name = match[1]?.replace(/"/g, '').trim();
                  email = match[2] || match[1];
                  if (!email.includes('@')) email = '';
                }
                if (email) {
                  if (!senderCounts[email]) senderCounts[email] = { name, count: 0 };
                  senderCounts[email].count++;
                  if (name && !senderCounts[email].name) senderCounts[email].name = name;
                }
              }
            })
          );
        }
        // 7. Sort and return top N senders
        const top = Object.entries(senderCounts)
          .map(([email, { name, count }]) => ({ email, name, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, limit || 10);
        return reply.send(top);
    } catch (err: any) {
        fastify.log.error(err);
        // Check for insufficient permissions error from Google
        if (err && err.errors && Array.isArray(err.errors)) {
          const insufficient = err.errors.find((e: any) => e.reason === 'insufficientPermissions');
          if (insufficient) {
            return reply.status(403).send({ error: 'insufficient_permissions' });
          }
        }
        return reply.status(500).send({ error: err.message || 'Failed to fetch top senders' });
    }
});

// Endpoint to get average response time for today (or a given day)
fastify.post('/api/gmail/response-time', async (request, reply) => {
    const { user_id, time_zone, day = 'today' } = request.body as { user_id?: string, time_zone?: string, day?: 'today' | 'yesterday' };
    if (!user_id) {
      return reply.status(400).send({ error: 'Missing user_id' });
    }
    try {
      // Use user's timezone to determine the correct date for the cache key
      let tz = time_zone;
      if (!tz) {
        const { data: settingsRow } = await supabase.from('user_settings').select('time_zone').eq('user_id', user_id).single();
        tz = settingsRow?.time_zone || 'UTC';
      }
      const date = DateTime.now().setZone(tz).startOf('day').toISODate();

      // Check for cached value for the correct date
      if (date) {
        const { data: cache } = await supabase
          .from('response_time_cache')
          .select('average_response_time, reply_count, updated_at')
          .eq('user_id', user_id)
          .eq('date', date)
          .single();
    
        if (cache && new Date().getTime() - new Date(cache.updated_at).getTime() < 300000) { // 5-minute cache
          return reply.send({
            average_response_time: cache.average_response_time,
            reply_count: cache.reply_count,
          });
        }
      }
  
      const accessToken = await getValidAccessToken(user_id);
      const oauth2Client = new google.auth.OAuth2();
      oauth2Client.setCredentials({ access_token: accessToken });
      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
  
      const { average_response_time, count } = await calculateResponseTime(user_id, gmail, tz || 'UTC', day);
      
      // Update cache with the date
      if (date) {
        await supabase.from('response_time_cache').upsert({
          user_id,
          date,
          average_response_time,
          reply_count: count,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id,date' });
      }
  
      reply.send({ average_response_time, reply_count: count });
    } catch (error: any) {
      if (error.message.includes('Token has been expired or revoked') || error.message.includes('No tokens found for user')) {
        return reply.status(401).send({ error: 'insufficient_permissions' });
      }
      fastify.log.error(error);
      reply.status(500).send({ error: error.message || 'Failed to calculate response time' });
    }
  });

// Endpoint to get inbox count at the end of each day for the last N days
fastify.post('/api/gmail/inbox-zero-history', async (request, reply) => {
  const { user_id, time_zone, days } = request.body as { user_id?: string, time_zone?: string, days?: number };
  if (!user_id) {
    return reply.status(400).send({ error: 'Missing user_id' });
  }
  try {
    // Get user's time zone and working hours from user_settings
    let tz = time_zone;
    let workingHours = null;
    if (!tz) {
      const { data: settingsRow } = await supabase
        .from('user_settings')
        .select('time_zone, working_hours_start, working_hours_end, working_days, inbox_zero_buffer_minutes')
        .eq('user_id', user_id)
        .single();
      tz = settingsRow?.time_zone || 'UTC';
      workingHours = settingsRow;
    } else {
      // Still get working hours even if timezone is provided
      const { data: settingsRow } = await supabase
        .from('user_settings')
        .select('working_hours_start, working_hours_end, working_days, inbox_zero_buffer_minutes')
        .eq('user_id', user_id)
        .single();
      workingHours = settingsRow;
    }

    // Helper function to check if a day is a working day
    const isWorkingDay = (date: DateTime) => {
      if (!workingHours?.working_days) return true; // Default to all days if not set
      const dayOfWeek = date.weekday; // 1=Monday, 2=Tuesday, etc.
      return workingHours.working_days.includes(dayOfWeek);
    };

    // Calculate date range
    const numDays = days && days > 0 && days <= 90 ? days : 30;
    const now = DateTime.now().setZone(tz);
    const startDate = now.minus({ days: numDays - 1 }).startOf('day');
    const startDateStr = startDate.toISODate();
    const nowDateStr = now.toISODate();

    if (!startDateStr || !nowDateStr) {
      throw new Error('Failed to generate date strings');
    }

    // Fetch data from inbox_zero_days table
    const { data: inboxZeroData, error: inboxZeroError } = await supabase
      .from('inbox_zero_days')
      .select('date, inbox_count')
      .eq('user_id', user_id)
      .gte('date', startDateStr)
      .lte('date', nowDateStr)
      .order('date', { ascending: true });

    if (inboxZeroError) {
      throw inboxZeroError;
    }

    // If we have gaps in the data, fetch from Gmail API for those dates
    const results: { date: string, inboxCount: number, isWorkingDay: boolean }[] = [];
    const existingDates = new Set(inboxZeroData.map(d => d.date));
    
    // Get a valid access token for Gmail API
    const accessToken = await getValidAccessToken(user_id);
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    // For each day in range
    for (let i = 0; i < numDays; i++) {
      const day = now.minus({ days: i });
      const dateStr = day.toISODate();
      
      if (!dateStr) {
        continue; // Skip invalid dates
      }
      
      const isWorking = isWorkingDay(day);
      
      if (existingDates.has(dateStr)) {
        // Use data from database
        const dayData = inboxZeroData.find(d => d.date === dateStr);
        if (dayData) {
          results.push({ 
            date: dateStr, 
            inboxCount: dayData.inbox_count,
            isWorkingDay: isWorking
          });
        }
      } else {
        // Fetch from Gmail API with buffer consideration
        const startOfDay = day.startOf('day');
        
        // Calculate the buffer cutoff time for this day
        const bufferMinutes = workingHours?.inbox_zero_buffer_minutes || 30;
        const workingHoursEnd = workingHours?.working_hours_end || '17:00:00';
        const [endHour, endMinute] = workingHoursEnd.split(':').map(Number);
        const bufferCutoff = day.set({ hour: endHour, minute: endMinute }).minus({ minutes: bufferMinutes });
        
        // Use buffer cutoff as the end time for counting emails
        const queryEndTime = bufferCutoff;
        
        const before = Math.floor(queryEndTime.toUTC().toSeconds());
        
        // Use accurate counting instead of resultSizeEstimate
        let inboxCount = 0;
        let nextPageToken: string | undefined = undefined;
        
        do {
          const res: GaxiosResponse<gmail_v1.Schema$ListMessagesResponse> = await gmail.users.messages.list({
            userId: 'me',
            q: `label:INBOX after:${Math.floor(startOfDay.toUTC().toSeconds())} before:${before}`,
            maxResults: 500,
            pageToken: nextPageToken
          });
          
          if (res.data.messages) {
            inboxCount += res.data.messages.length;
          }
          
          nextPageToken = res.data.nextPageToken ?? undefined;
        } while (nextPageToken);
        
        results.push({ 
          date: dateStr, 
          inboxCount,
          isWorkingDay: isWorking
        });

        // Store in database for future use
        await supabase
          .from('inbox_zero_days')
          .upsert({
            user_id,
            date: dateStr,
            inbox_count: inboxCount
          }, {
            onConflict: 'user_id,date'
          });
      }
    }

    // Return in ascending order (oldest first)
    return reply.send(results.reverse());
  } catch (error) {
    fastify.log.error('Failed to fetch inbox zero history:', error);
    return reply.status(500).send({ error: 'Failed to fetch inbox zero history' });
  }
});

// Endpoint to fetch a list of Gmail messages for a user (optionally filtered by label)
fastify.get('/api/gmail/messages', async (request, reply) => {
  const { user_id, label = 'INBOX', maxResults = 20, q, pageToken } = request.query as { user_id?: string, label?: string, maxResults?: string, q?: string, pageToken?: string };
  if (!user_id) {
    return reply.status(400).send({ error: 'Missing user_id' });
  }
  try {
    // 1. Get a valid access token
    const accessToken = await getValidAccessToken(user_id);
    // 2. Set up Gmail API client
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    // 3. Fetch message list
    const res = await gmail.users.messages.list({
      userId: 'me',
      labelIds: [label],
      maxResults: Number(maxResults),
      q: q || undefined,
      pageToken: pageToken || undefined,
    });
    const messages = res.data.messages || [];
    // 4. Fetch metadata for each message
    const batch = await Promise.all(
      messages.map(async (msg) => {
        const msgRes = await gmail.users.messages.get({
          userId: 'me',
          id: msg.id!,
          format: 'metadata',
          metadataHeaders: ['From', 'Subject', 'Date'],
        });
        const headers = msgRes.data.payload?.headers || [];
        const getHeader = (name: string) => headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || '';
        return {
          id: msg.id,
          threadId: msgRes.data.threadId,
          sender: getHeader('From'),
          subject: getHeader('Subject'),
          date: getHeader('Date'),
          snippet: msgRes.data.snippet || '',
          labelIds: msgRes.data.labelIds || [],
        };
      })
    );
    // Always return a valid JSON object
    return reply.send({ emails: batch, nextPageToken: res.data.nextPageToken || null });
  } catch (err: any) {
    fastify.log.error('Failed to fetch messages:', err);
    // Always return a valid JSON object on error
    return reply.send({ emails: [], nextPageToken: null, error: err.message || 'Failed to fetch messages' });
  }
});

// Endpoint to fetch the full body of a Gmail message for a user
fastify.get('/api/gmail/message', async (request, reply) => {
  const { user_id, message_id } = request.query as { user_id?: string, message_id?: string };
  if (!user_id || !message_id) {
    return reply.status(400).send({ error: 'Missing user_id or message_id' });
  }
  try {
    const accessToken = await getValidAccessToken(user_id);
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    const msgRes = await gmail.users.messages.get({
      userId: 'me',
      id: message_id,
      format: 'full',
    });

    // Helper to decode base64url
    function decodeBody(body: string) {
      return Buffer.from(body, 'base64').toString('utf-8');
    }

    // Find the plain text or HTML part
    let body = '';
    const payload = msgRes.data.payload;
    if (payload?.parts) {
      const part = payload.parts.find(p => p.mimeType === 'text/html') || payload.parts.find(p => p.mimeType === 'text/plain');
      if (part?.body?.data) {
        body = decodeBody(part.body.data);
      }
    } else if (payload?.body?.data) {
      body = decodeBody(payload.body.data);
    }

    return reply.send({ body });
  } catch (err: any) {
    fastify.log.error(err);
    return reply.status(500).send({ error: err.message || 'Failed to fetch message body' });
  }
});

// Endpoint to mark a Gmail message as read (remove UNREAD label)
fastify.post('/api/gmail/mark-read', async (request, reply) => {
  const { user_id, message_id } = request.body as { user_id?: string, message_id?: string };
  if (!user_id || !message_id) {
    return reply.status(400).send({ error: 'Missing user_id or message_id' });
  }
  try {
    // 1. Get a valid access token
    const accessToken = await getValidAccessToken(user_id);
    // 2. Set up Gmail API client
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    // 3. Modify the message to remove the UNREAD label
    await gmail.users.messages.modify({
      userId: 'me',
      id: message_id,
      requestBody: {
        removeLabelIds: ['UNREAD'],
      },
    });
    return reply.send({ success: true });
  } catch (err: any) {
    fastify.log.error(err);
    return reply.status(500).send({ error: err.message || 'Failed to mark message as read' });
  }
});

// Endpoint to send an email via Gmail API
fastify.post('/api/gmail/send', async (request, reply) => {
  console.log('Content-Type:', request.headers['content-type']);
  console.log('isMultipart:', typeof request.isMultipart === 'function' ? request.isMultipart() : 'no isMultipart');
  let user_id, to, subject, body, attachments = [];
  if (request.isMultipart()) {
    const parts = await request.parts();
    const fields: Record<string, any> = {};
    const files: any[] = [];
    for await (const part of parts) {
      if (part.type === 'file') {
        const bufs = [];
        for await (const chunk of part.file) bufs.push(chunk);
        files.push({
          filename: part.filename,
          mimetype: part.mimetype,
          buffer: Buffer.concat(bufs),
        });
      } else {
        fields[part.fieldname] = part.value;
      }
    }
    user_id = fields.user_id;
    to = fields.to;
    subject = fields.subject;
    body = fields.body;
    attachments = files;
  } else {
    ({ user_id, to, subject, body } = request.body as any);
  }
  if (!user_id || !to || !subject || !body) {
    return reply.status(400).send({ error: 'Missing user_id, to, subject, or body' });
  }
  try {
    // 1. Get tokens and user info from Supabase
    const { data: userData, error: userError } = await supabase
      .from('gmail_tokens')
      .select('email, name, access_token, refresh_token, expires_at')
      .eq('user_id', user_id)
      .single();

    if (userError || !userData) throw new Error('No tokens found for user');

    const { email: userEmail, name: userName, access_token, refresh_token, expires_at } = userData;

    // 2. Get a valid access token (refresh if needed)
    const accessToken = await getValidAccessToken(user_id);
    // 3. Set up Gmail API client
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    // 4. Generate a unique email_id for tracking
    const email_id = uuidv4();
    
    // Validate BASE_URL
    if (!BASE_URL) {
      console.error('[SEND EMAIL] BASE_URL is not set!');
      throw new Error('BASE_URL environment variable is required for email tracking');
    }

    // Use RENDER_EXTERNAL_URL if available, otherwise fall back to BASE_URL
    const trackingBaseUrl = process.env.RENDER_EXTERNAL_URL || process.env.BASE_URL;
    if (!trackingBaseUrl) {
      fastify.log.error({
        msg: '[TRACKING] Missing BASE_URL or RENDER_EXTERNAL_URL',
        requestId: request.id,
        env: {
          NODE_ENV: process.env.NODE_ENV,
          BASE_URL: process.env.BASE_URL,
          VITE_API_URL: process.env.VITE_API_URL
        }
      });
      reply.header('Content-Type', 'image/gif');
      return Buffer.from(
        'R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==',
        'base64'
      );
    }

    // 5. Append tracking pixel to the body with additional styling and alt text
    const trackingUrl = `${trackingBaseUrl}/track/open?email_id=${email_id}&user_id=${user_id}`;
    const trackingPixel = `
      <!-- Email tracking pixel -->
      <div style="display:none;max-height:0px;overflow:hidden;mso-hide:all;">
        <img src="${trackingUrl}" 
             width="1" height="1" 
             alt="Email tracking pixel"
             style="display:none;width:1px;height:1px;opacity:0;color:transparent;mso-hide:all;"
             referrerpolicy="no-referrer-when-downgrade"
             crossorigin="anonymous"
             loading="lazy"
             decoding="async"
             data-tracking="true" />
      </div>`;

    // Validate tracking pixel
    if (!trackingPixel.includes(email_id) || !trackingPixel.includes(user_id)) {
      console.error('[SEND EMAIL] Invalid tracking pixel generated:', { email_id, user_id, trackingPixel });
      throw new Error('Failed to generate valid tracking pixel');
    }

    const bodyWithPixel = body + trackingPixel;
    
    // LOGGING: Show the email_id and tracking pixel
    console.log('[SEND EMAIL] email_id:', email_id);
    console.log('[SEND EMAIL] trackingUrl:', trackingUrl);
    console.log('[SEND EMAIL] trackingPixel:', trackingPixel);
    console.log('[SEND EMAIL] BASE_URL:', BASE_URL);

    // 6. Check if this is a reply and get the original message ID if needed
    let inReplyTo = '';
    let references = '';
    if (subject.startsWith('Re:')) {
      fastify.log.info('Processing reply email', {
        userId: user_id,
        subject: subject,
        to: to,
        timestamp: new Date().toISOString()
      });
      
      try {
        // Extract the original subject (remove "Re: ")
        const originalSubject = subject.substring(3).trim();
        
        // Extract recipient email for more targeted search
        let recipientEmail = '';
        const toMatch = to.match(/<(.+?)>/);
        if (toMatch) {
          recipientEmail = toMatch[1];
        } else {
          recipientEmail = to.trim();
        }
        
        fastify.log.info('Reply search parameters', {
          originalSubject: originalSubject,
          recipientEmail: recipientEmail,
          fullTo: to
        });
        
        // Search for the original message in the last 7 days with multiple strategies
        const sevenDaysAgo = Math.floor(DateTime.now().minus({ days: 7 }).toUTC().toSeconds());
        const now = Math.floor(DateTime.now().toUTC().toSeconds());
        
        let originalMessage = null;
        
        // Strategy 1: Search by subject and from the recipient
        if (recipientEmail) {
          const searchQuery1 = `subject:"${originalSubject}" from:${recipientEmail} after:${sevenDaysAgo} before:${now} -from:me`;
          fastify.log.info('Trying search strategy 1', { query: searchQuery1 });
          
          const searchRes1 = await gmail.users.messages.list({
            userId: 'me',
            q: searchQuery1,
            maxResults: 5
          });
          
          fastify.log.info('Search strategy 1 results', {
            found: searchRes1.data.messages?.length || 0,
            messages: searchRes1.data.messages?.map(m => m.id) || []
          });
          
          if (searchRes1.data.messages && searchRes1.data.messages.length > 0) {
            originalMessage = searchRes1.data.messages[0];
            fastify.log.info('Found original message by subject + recipient', {
              originalMessageId: originalMessage.id,
              subject: originalSubject,
              recipient: recipientEmail
            });
          }
        }
        
        // Strategy 2: If not found, search by subject only
        if (!originalMessage) {
          const searchQuery2 = `subject:"${originalSubject}" after:${sevenDaysAgo} before:${now} -from:me`;
          fastify.log.info('Trying search strategy 2', { query: searchQuery2 });
          
          const searchRes2 = await gmail.users.messages.list({
            userId: 'me',
            q: searchQuery2,
            maxResults: 5
          });
          
          fastify.log.info('Search strategy 2 results', {
            found: searchRes2.data.messages?.length || 0,
            messages: searchRes2.data.messages?.map(m => m.id) || []
          });
          
          if (searchRes2.data.messages && searchRes2.data.messages.length > 0) {
            originalMessage = searchRes2.data.messages[0];
            fastify.log.info('Found original message by subject only', {
              originalMessageId: originalMessage.id,
              subject: originalSubject
            });
          }
        }
        
        // Strategy 3: If still not found, search by recipient in recent emails
        if (!originalMessage && recipientEmail) {
          const searchQuery3 = `from:${recipientEmail} after:${sevenDaysAgo} before:${now} -from:me`;
          fastify.log.info('Trying search strategy 3', { query: searchQuery3 });
          
          const searchRes3 = await gmail.users.messages.list({
            userId: 'me',
            q: searchQuery3,
            maxResults: 5
          });
          
          fastify.log.info('Search strategy 3 results', {
            found: searchRes3.data.messages?.length || 0,
            messages: searchRes3.data.messages?.map(m => m.id) || []
          });
          
          if (searchRes3.data.messages && searchRes3.data.messages.length > 0) {
            originalMessage = searchRes3.data.messages[0];
            fastify.log.info('Found original message by recipient only', {
              originalMessageId: originalMessage.id,
              recipient: recipientEmail
            });
          }
        }
        
        if (originalMessage && originalMessage.id) {
          const messageRes = await gmail.users.messages.get({
            userId: 'me',
            id: originalMessage.id,
            format: 'metadata',
            metadataHeaders: ['Message-ID', 'Subject', 'From']
          });
          
          const headers = messageRes.data.payload?.headers || [];
          const messageId = headers.find((h: any) => h.name?.toLowerCase() === 'message-id')?.value;
          
          if (messageId) {
            inReplyTo = messageId;
            references = messageId;
            fastify.log.info('Successfully linked reply to original message', {
              originalMessageId: originalMessage.id,
              messageId: messageId,
              subject: originalSubject,
              recipient: recipientEmail,
              inReplyTo: inReplyTo,
              references: references
            });
          } else {
            fastify.log.warn('Original message found but no Message-ID header', {
              originalMessageId: originalMessage.id,
              subject: originalSubject,
              headers: headers.map(h => ({ name: h.name, value: h.value }))
            });
          }
        } else {
          fastify.log.warn('No original message found for reply', {
            subject: originalSubject,
            recipient: recipientEmail,
            searchStrategies: ['subject+recipient', 'subject', 'recipient'],
            dateRange: { sevenDaysAgo, now }
          });
        }
      } catch (error) {
        fastify.log.warn('Failed to find original message for reply', {
          error: error instanceof Error ? error.message : String(error),
          subject: subject,
          recipient: to
        });
      }
    }

    // 7. Create MIME multipart message if attachments exist
    let encodedMessage;
    if (attachments && attachments.length > 0) {
      const boundary = '----=_Part_' + Date.now();
      let mime = '';
      mime += `MIME-Version: 1.0\r\n`;
      mime += `Content-Type: multipart/mixed; boundary=\"${boundary}\"\r\n`;
      mime += `From: \"${userName}\" <${userEmail}>\r\n`;
      mime += `To: ${to}\r\n`;
      mime += `Subject: ${subject}\r\n`;
      if (inReplyTo) mime += `In-Reply-To: ${inReplyTo}\r\n`;
      if (references) mime += `References: ${references}\r\n`;
      mime += `\r\n--${boundary}\r\n`;
      mime += `Content-Type: text/html; charset=utf-8\r\n\r\n`;
      mime += bodyWithPixel + '\r\n';
      for (const file of attachments) {
        mime += `--${boundary}\r\n`;
        mime += `Content-Type: ${file.mimetype || 'application/octet-stream'}; name=\"${file.filename}\"\r\n`;
        mime += `Content-Disposition: attachment; filename=\"${file.filename}\"\r\n`;
        mime += `Content-Transfer-Encoding: base64\r\n\r\n`;
        mime += file.buffer.toString('base64').replace(/(.{76})/g, '$1\r\n') + '\r\n';
      }
      mime += `--${boundary}--`;
      encodedMessage = Buffer.from(mime)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
    } else {
      const messageHeaders = [
        'Content-Type: text/html; charset=utf-8',
        'MIME-Version: 1.0',
        `From: \"${userName}\" <${userEmail}>`,
        `To: ${to}`,
        `Subject: ${subject}`,
      ];
      
      if (inReplyTo) messageHeaders.push(`In-Reply-To: ${inReplyTo}`);
      if (references) messageHeaders.push(`References: ${references}`);
      
      messageHeaders.push('', bodyWithPixel);
      
      const message = messageHeaders.join('\r\n');
      encodedMessage = Buffer.from(message)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
    }

    // 8. Send the email
    const sendResponse = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage,
      },
    });

    // Get the Gmail message ID from the response
    const gmailMessageId = sendResponse.data.id;

    // Log successful email send for debugging
    fastify.log.info('Email sent successfully', {
      userId: user_id,
      emailId: email_id,
      gmailMessageId,
      to: to,
      subject: subject,
      timestamp: new Date().toISOString(),
      isReply: subject.startsWith('Re:'),
      inReplyTo: inReplyTo || 'none'
    });

    // Temporary debugging: Log threading info for frontend
    if (subject.startsWith('Re:')) {
      console.log('=== EMAIL THREADING DEBUG ===');
      console.log('Subject:', subject);
      console.log('To:', to);
      console.log('In-Reply-To:', inReplyTo || 'NOT SET');
      console.log('References:', references || 'NOT SET');
      console.log('Threading Status:', inReplyTo ? 'SUCCESS' : 'FAILED');
      console.log('============================');
    }

    // 9. Insert into sent_emails
    // Parse to_name and to_email from the To field
    let to_name = '', to_email = '';
    const match = to.match(/^(.*?)(?:\s*<(.+?)>)?$/);
    if (match) {
      to_name = match[1]?.replace(/"/g, '').trim();
      to_email = match[2] || match[1];
      if (!to_email.includes('@')) to_email = '';
    }
    // LOGGING: Show the email_id used in sent_emails insert
    console.log('[SEND EMAIL] sent_emails insert email_id:', email_id);
    const { data: sentEmailData, error: sentEmailError } = await supabase.from('sent_emails').insert({
      email_id,
      user_id,
      to_email,
      to_name,
      subject,
      sent_at: new Date().toISOString(),
      body,
      is_reply: subject.startsWith('Re:') || !!inReplyTo, // Set is_reply based on subject prefix or inReplyTo header
      gmail_message_id: gmailMessageId,
      in_reply_to: inReplyTo || null, // Save the In-Reply-To header value
    });
    console.log('SENT_EMAILS INSERT:', { sentEmailData, sentEmailError });

    if (sentEmailError) {
      fastify.log.error('Failed to insert into sent_emails table', {
        error: sentEmailError,
        userId: user_id,
        emailId: email_id
      });
    } else {
      fastify.log.info('Email recorded in sent_emails table', {
        userId: user_id,
        emailId: email_id,
        toEmail: to_email
      });
    }

    return reply.send({ success: true });
  } catch (err: any) {
    fastify.log.error(err);
    return reply.status(500).send({ error: err.message || 'Failed to send email' });
  }
});

// Endpoint: Email Open Analytics
fastify.post('/api/email-tracking/analytics', async (request, reply) => {
  const { user_id } = request.body as { user_id?: string };
  if (!user_id) {
    return reply.status(400).send({ error: 'Missing user_id' });
  }
  try {
    // 1. Total sent emails (from email_stats table, sum emails_sent)
    const { data: sentRows, error: sentError } = await supabase
      .from('email_stats')
      .select('emails_sent')
      .eq('user_id', user_id);
    if (sentError) throw sentError;
    const totalSent = sentRows?.reduce((sum, row) => sum + (row.emails_sent || 0), 0) || 0;

    // 2. Total opened emails (distinct email_id in email_opens)
    const { data: openRows2, error: openError2 } = await supabase
      .from('email_opens')
      .select('email_id')
      .eq('user_id', user_id);
    if (openError2) throw openError2;
    const openCounts: Record<string, number> = {};
    openRows2?.forEach(row => {
      if (row.email_id) {
        openCounts[row.email_id] = (openCounts[row.email_id] || 0) + 1;
      }
    });
    let mostOpened = null;
    const sorted = Object.entries(openCounts).sort((a, b) => b[1] - a[1]);
    if (sorted.length > 0) {
      mostOpened = { email_id: sorted[0][0], count: sorted[0][1] };
    }

    // 3. Open rate
    const openRate = totalSent > 0 ? (Object.keys(openCounts).length / totalSent) * 100 : 0;

    // 4. Opens over time (last 30 days)
    const { data: openEvents, error: openEventsError } = await supabase
      .from('email_opens')
      .select('opened_at')
      .eq('user_id', user_id)
      .gte('opened_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
    if (openEventsError) throw openEventsError;
    // Group by date
    const opensByDate: Record<string, number> = {};
    openEvents?.forEach(ev => {
      const date = ev.opened_at?.slice(0, 10); // YYYY-MM-DD
      if (date) opensByDate[date] = (opensByDate[date] || 0) + 1;
    });
    const opensOverTime = Object.entries(opensByDate).map(([date, count]) => ({ date, count }));

    return reply.send({
      totalSent,
      totalOpened: Object.keys(openCounts).length,
      openRate,
      mostOpened,
      opensOverTime,
    });
  } catch (err: any) {
    fastify.log.error(err);
    return reply.status(500).send({ error: err.message || 'Failed to fetch analytics' });
  }
});

// Update sent-emails endpoint to use sent_emails table
fastify.post('/api/email-tracking/sent-emails', async (request, reply) => {
  const { user_id } = request.body as { user_id?: string };
  if (!user_id) return reply.status(400).send({ error: 'Missing user_id' });
  const { data, error } = await supabase
    .from('sent_emails')
    .select('email_id, to_name, to_email, subject, sent_at')
    .eq('user_id', user_id)
    .order('sent_at', { ascending: false });
  if (error) return reply.status(500).send({ error: error.message });
  return reply.send(data);
});

// Get open events for a specific email
fastify.post('/api/email-tracking/open-events', async (request, reply) => {
  const { user_id, email_id } = request.body as { user_id?: string, email_id?: string };
  if (!user_id || !email_id) return reply.status(400).send({ error: 'Missing user_id or email_id' });
  const { data, error } = await supabase
    .from('email_opens')
    .select('opened_at, user_agent')
    .eq('user_id', user_id)
    .eq('email_id', email_id)
    .order('opened_at', { ascending: true });
  if (error) return reply.status(500).send({ error: error.message });
  return reply.send(data);
});

// --- Tracking Pixel: Email Open Tracking ---
fastify.get('/track/open', async (request, reply) => {
  const requestId = request.id || 'unknown';
  
  // Add CORS headers to allow the tracking pixel to load
  reply.header('Access-Control-Allow-Origin', '*');
  reply.header('Access-Control-Allow-Methods', 'GET');
  reply.header('Access-Control-Allow-Headers', 'Content-Type');
  reply.header('Cache-Control', 'no-cache, no-store, must-revalidate');
  reply.header('Pragma', 'no-cache');
  reply.header('Expires', '0');
  reply.header('X-Content-Type-Options', 'nosniff');
  reply.header('X-Frame-Options', 'DENY');
  reply.header('Content-Security-Policy', "default-src 'none'");

  const { email_id, user_id } = request.query as { email_id?: string; user_id?: string };
  
  // Log all request details for debugging
  fastify.log.info({
    msg: '[TRACKING] Request received',
    requestId,
    email_id,
    user_id,
    headers: request.headers,
    url: request.url,
    method: request.method,
    ip: request.ip,
    baseUrl: BASE_URL,
    referer: request.headers.referer,
    origin: request.headers.origin,
    host: request.headers.host,
    query: request.query,
    env: {
      NODE_ENV: process.env.NODE_ENV,
      BASE_URL: process.env.BASE_URL,
      VITE_API_URL: process.env.VITE_API_URL
    }
  });

  if (!email_id) {
    fastify.log.warn({
      msg: '[TRACKING] Missing email_id',
      requestId,
      email_id,
      user_id
    });
    // Always return a 1x1 GIF, even if params are missing, to avoid breaking emails
    reply.header('Content-Type', 'image/gif');
    return Buffer.from(
      'R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==',
      'base64'
    );
  }

  const userAgent = request.headers['user-agent'] || '';

  // Skip known bot/preview user agents, but allow Gmail's image proxy
  const botPatterns = [
    /outlook/i,
    /apple-mail/i,
    /thunderbird/i,
    /mozilla\/5\.0.*applewebkit.*safari/i,
    /bot/i,
    /crawler/i,
    /spider/i,
    /preview/i,
    /security scan/i
  ];

  // Allow Gmail's image proxy and other email clients
  const isGmailProxy = userAgent.includes('ggpht.com GoogleImageProxy');
  const isEmailClient = userAgent.includes('Gmail') || 
                       userAgent.includes('Outlook') || 
                       userAgent.includes('Apple-Mail') ||
                       userAgent.includes('Thunderbird');
  const isBot = !isGmailProxy && !isEmailClient && botPatterns.some(pattern => pattern.test(userAgent));

  if (isBot) {
    fastify.log.info({
      msg: '[TRACKING] Skipping bot/preview open',
      requestId,
      email_id,
      userAgent,
      isGmailProxy,
      isEmailClient
    });
    reply.header('Content-Type', 'image/gif');
    return Buffer.from(
      'R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==',
      'base64'
    );
  }

  try {
    // Log the open event in Supabase
    const { data, error } = await supabase.from('email_opens').insert({
      email_id,
      user_id: user_id || null, // Make user_id optional
      opened_at: new Date().toISOString(),
      user_agent: userAgent
    });
    
    if (error) {
      fastify.log.error({
        msg: '[TRACKING] Failed to insert open event',
        requestId,
        email_id,
        error,
        headers: request.headers
      });
    } else {
      fastify.log.info({
        msg: '[TRACKING] Successfully recorded open event',
        requestId,
        email_id,
        data,
        isGmailProxy,
        isEmailClient,
        cfIp: request.headers['cf-connecting-ip']
      });
    }
  } catch (err) {
    fastify.log.error({
      msg: '[TRACKING] Error inserting open event',
      requestId,
      email_id,
      error: err,
      headers: request.headers
    });
  }
  
  reply.header('Content-Type', 'image/gif');
  return Buffer.from(
    'R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==',
    'base64'
  );
});

// Endpoint to get unique contacts for a user
fastify.post('/api/contacts', async (request, reply) => {
  const { user_id } = request.body as { user_id?: string };
  if (!user_id) return reply.status(400).send({ error: 'Missing user_id' });

  try {
    // Get a valid access token
    const accessToken = await getValidAccessToken(user_id);

    // Set up Gmail API client
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    // Get all sent emails for this user from our database
    const { data: sentData, error: sentError } = await supabase
      .from('sent_emails')
      .select('to_name, to_email')
      .eq('user_id', user_id);

    if (sentError) return reply.status(500).send({ error: sentError.message });

    // Get received emails from Gmail
    const receivedRes = await gmail.users.messages.list({
      userId: 'me',
      q: 'label:INBOX -from:me',
      maxResults: 100, // Limit to last 100 received emails for performance
    });

    // Build unique contacts list
    const contactsMap: Record<string, { name: string; email: string }> = {};

    // Add sent email contacts
    (sentData || []).forEach(row => {
      if (row.to_email) {
        contactsMap[row.to_email] = {
          name: row.to_name || row.to_email,
          email: row.to_email,
        };
      }
    });

    // Add received email contacts
    if (receivedRes.data.messages) {
      const messageDetails = await Promise.all(
        receivedRes.data.messages.map(async (message) => {
          const details = await gmail.users.messages.get({
            userId: 'me',
            id: message.id!,
            format: 'metadata',
            metadataHeaders: ['From'],
          });
          return details.data.payload?.headers?.find(h => h.name === 'From')?.value;
        })
      );

      messageDetails.forEach(from => {
        if (from) {
          // Parse "Name <email@example.com>" format
          const match = from.match(/^(.*?)\s*<([^>]+)>$/);
          if (match) {
            const [, name, email] = match;
            contactsMap[email] = {
              name: name.trim() || email,
              email: email,
            };
          } else {
            // If no name provided, use email as both
            contactsMap[from] = {
              name: from,
              email: from,
            };
          }
        }
      });
    }

    // Return as array
    return reply.send(Object.values(contactsMap));
  } catch (err: any) {
    fastify.log.error(err);
    return reply.status(500).send({ error: err.message || 'Failed to fetch contacts' });
  }
});

// Endpoint to set the user's theme
fastify.post('/api/auth/set-theme', async (request, reply) => {
  const { user_id, theme } = request.body as { user_id?: string; theme?: string };
  if (!user_id || !theme) {
    fastify.log.error('Missing user_id or theme in request:', { user_id, theme });
    return reply.status(400).send({ error: 'Missing user_id or theme' });
  }
  fastify.log.info('Setting theme:', { user_id, theme });
  const { error } = await supabase
    .from('user_settings')
    .upsert({ user_id, theme }, { onConflict: 'user_id' });
  if (error) {
    fastify.log.error('Failed to set theme:', error);
    return reply.status(500).send({ error: error.message });
  }
  fastify.log.info('Successfully set theme');
  return reply.send({ success: true });
});

// Endpoint to get the user's theme
fastify.post('/api/auth/get-theme', async (request, reply) => {
  const { user_id } = request.body as { user_id?: string };
  if (!user_id) {
    fastify.log.error('Missing user_id in get-theme request:', { user_id });
    return reply.status(400).send({ error: 'Missing user_id' });
  }
  const { data, error } = await supabase
    .from('user_settings')
    .select('theme')
    .eq('user_id', user_id)
    .single();
  if (error) {
    fastify.log.error('Failed to get theme:', error);
    return reply.status(500).send({ error: error.message });
  }
  return reply.send({ theme: data?.theme || 'blue' });
});

// Endpoint to set the user's working hours
fastify.post('/api/auth/set-working-hours', async (request, reply) => {
  const { user_id, working_hours_start, working_hours_end, working_days, inbox_zero_buffer_minutes } = request.body as { 
    user_id?: string; 
    working_hours_start?: string; 
    working_hours_end?: string; 
    working_days?: number[];
    inbox_zero_buffer_minutes?: number;
  };
  if (!user_id || !working_hours_start || !working_hours_end || !working_days) {
    fastify.log.error('Missing required fields in request:', { user_id, working_hours_start, working_hours_end, working_days });
    return reply.status(400).send({ error: 'Missing required fields' });
  }
  fastify.log.info('Setting working hours:', { user_id, working_hours_start, working_hours_end, working_days, inbox_zero_buffer_minutes });
  const { error } = await supabase
    .from('user_settings')
    .upsert({ 
      user_id, 
      working_hours_start, 
      working_hours_end, 
      working_days,
      inbox_zero_buffer_minutes: inbox_zero_buffer_minutes || 30
    }, { onConflict: 'user_id' });
  if (error) {
    fastify.log.error('Failed to set working hours:', error);
    return reply.status(500).send({ error: error.message });
  }
  fastify.log.info('Successfully set working hours');
  return reply.send({ success: true });
});

// Endpoint to get the user's working hours
fastify.post('/api/auth/get-working-hours', async (request, reply) => {
  const { user_id } = request.body as { user_id?: string };
  if (!user_id) {
    return reply.status(400).send({ error: 'Missing user_id' });
  }
  const { data, error } = await supabase
    .from('user_settings')
    .select('working_hours_start, working_hours_end, working_days, inbox_zero_buffer_minutes')
    .eq('user_id', user_id)
    .single();
  if (error) {
    return reply.status(500).send({ error: error.message });
  }
  return reply.send({ 
    working_hours_start: data?.working_hours_start || '09:00:00',
    working_hours_end: data?.working_hours_end || '17:00:00',
    working_days: data?.working_days || [1, 2, 3, 4, 5],
    inbox_zero_buffer_minutes: data?.inbox_zero_buffer_minutes || 30
  });
});

// Debug endpoint to test response time calculation
fastify.post('/api/gmail/debug-response-time', async (request, reply) => {
  const { user_id, time_zone, day } = request.body as { user_id?: string, time_zone?: string, day?: string };
  if (!user_id) {
    return reply.status(400).send({ error: 'Missing user_id' });
  }
  
  try {
    // 1. Get a valid access token
    const accessToken = await getValidAccessToken(user_id);
    // 2. Set up Gmail API client
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    // 3. Get user's time zone from param or user_settings
    let tz = time_zone;
    if (!tz) {
      const { data: settingsRow } = await supabase
        .from('user_settings')
        .select('time_zone')
        .eq('user_id', user_id)
        .single();
      tz = settingsRow?.time_zone || 'UTC';
    }
    // 4. Get date range in user's time zone
    const now = DateTime.now().setZone(tz);
    let start, end;
    if (day === 'today' || !day) {
      start = now.startOf('day');
    } else {
      start = now.minus({ days: 1 }).startOf('day');
    }
    end = start.plus({ days: 1 });
    const after = Math.floor(start.toUTC().toSeconds());
    const before = Math.floor(end.toUTC().toSeconds());
    
    // 5. Fetch all received emails for today (Inbox, not sent by me)
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
    
    // 6. Also fetch sent emails for comparison
    const receivedMessages = await fetchAllMessages(`after:${after} before:${before} label:INBOX -from:me`);
    const sentMessages = await fetchAllMessages(`after:${after} before:${before} from:me`);
    
    const debugInfo = {
      dateRange: {
        start: start.toISO(),
        end: end.toISO(),
        after,
        before
      },
      receivedMessagesCount: receivedMessages.length,
      sentMessagesCount: sentMessages.length,
      receivedMessages: receivedMessages.slice(0, 5).map(msg => ({ id: msg.id })),
      sentMessages: sentMessages.slice(0, 5).map(msg => ({ id: msg.id })),
      threads: [] as any[],
      receivedEmailsWithStatus: [] as any[],
      sentMessagesDetails: [] as any[],
      timeZoneUsed: tz
    };
    
    // 6.5. Get details for all sent messages
    for (let i = 0; i < sentMessages.length; i++) {
      const msg = sentMessages[i];
      try {
        const res = await gmail.users.messages.get({ userId: 'me', id: msg.id, format: 'metadata' });
        const sentInternalDate = Number(res.data.internalDate);
        const threadId = res.data.threadId;
        
        if (threadId) {
          const threadRes = await gmail.users.threads.get({ userId: 'me', id: threadId });
          const threadMessages = threadRes.data.messages || [];
          
          // Find the received message this is replying to
          const receivedMessage = threadMessages.find((m) => {
            if (m.id === msg.id) return false; // skip the sent message itself
            if (!m.labelIds?.includes('SENT')) {
              const receivedDate = Number(m.internalDate);
              return receivedDate < sentInternalDate;
            }
            return false;
          });
          
          debugInfo.sentMessagesDetails.push({
            messageId: msg.id,
            threadId,
            sentDate: new Date(sentInternalDate).toISOString(),
            threadMessagesCount: threadMessages.length,
            isReplyToReceived: !!receivedMessage,
            receivedMessageId: receivedMessage?.id || null,
            receivedDate: receivedMessage ? new Date(Number(receivedMessage.internalDate)).toISOString() : null
          });
        }
      } catch (error) {
        debugInfo.sentMessagesDetails.push({
          messageId: msg.id,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
    
    // 7. Get details for all received messages and their response status, reply match, and response time
    const receivedEmailsWithStatus = [];
    const usedReplyIds = new Set(); // To prevent duplicate counting
    for (let i = 0; i < receivedMessages.length; i++) {
      const msg = receivedMessages[i];
      try {
        const res = await gmail.users.messages.get({ userId: 'me', id: msg.id, format: 'metadata' });
        const threadId = res.data.threadId;
        const receivedInternalDate = Number(res.data.internalDate);
        const headers = res.data.payload?.headers || [];
        const messageIdHeader = headers.find((h) => h.name?.toLowerCase() === 'message-id');
        const messageIdValue = messageIdHeader?.value;
        let matchInfo: { method: string | null, replyMessageId: string | null, replyDate: string | null, responseTimeSeconds: number | null } = { method: null, replyMessageId: null, replyDate: null, responseTimeSeconds: null };
        let threadMessagesCount = 1;
        
        if (threadId) {
          const threadRes = await gmail.users.threads.get({ userId: 'me', id: threadId });
          const threadMessages = threadRes.data.messages || [];
          threadMessagesCount = threadMessages.length;
          // Try to find reply in thread (must not be used already, and must match In-Reply-To)
          const reply = threadMessages.find((m) => {
            if (m.id === msg.id) return false;
            if (usedReplyIds.has(m.id)) return false;
            if (m.labelIds && m.labelIds.includes('SENT')) {
              const sentDate = Number(m.internalDate);
              // Check In-Reply-To header
              const replyHeaders = m.payload?.headers || [];
              const inReplyTo = replyHeaders.find((h) => h.name?.toLowerCase() === 'in-reply-to')?.value;
              return sentDate > receivedInternalDate && inReplyTo && messageIdValue && inReplyTo === messageIdValue;
            }
            return false;
          });
          if (reply) {
            usedReplyIds.add(reply.id);
            matchInfo = {
              method: 'thread',
              replyMessageId: reply.id || null,
              replyDate: new Date(Number(reply.internalDate)).toISOString(),
              responseTimeSeconds: Math.round((Number(reply.internalDate) - receivedInternalDate) / 1000)
            };
          } else if (messageIdValue) {
            // Try In-Reply-To search (must not be used already, and must match In-Reply-To)
            try {
              const searchQuery = `from:me after:${Math.floor(receivedInternalDate / 1000)} before:${Math.floor(receivedInternalDate / 1000) + 86400}`;
              const searchRes = await gmail.users.messages.list({
                userId: 'me',
                q: searchQuery,
                maxResults: 10
              });
              if (searchRes.data.messages) {
                for (const sentMsg of searchRes.data.messages) {
                  if (usedReplyIds.has(sentMsg.id)) continue;
                  const sentMsgRes = await gmail.users.messages.get({
                    userId: 'me',
                    id: sentMsg.id!,
                    format: 'metadata',
                    metadataHeaders: ['In-Reply-To', 'References', 'Subject']
                  });
                  const replyHeaders = sentMsgRes.data.payload?.headers || [];
                  const inReplyTo = replyHeaders.find((h) => h.name?.toLowerCase() === 'in-reply-to')?.value;
                  const subject = replyHeaders.find((h) => h.name?.toLowerCase() === 'subject')?.value;
                  const sentDate = Number(sentMsgRes.data.internalDate);
                  if (inReplyTo && inReplyTo === messageIdValue && subject?.startsWith('Re:') && sentDate > receivedInternalDate) {
                    usedReplyIds.add(sentMsg.id!);
                    matchInfo = {
                      method: 'in-reply-to',
                      replyMessageId: sentMsg.id || null,
                      replyDate: new Date(sentDate).toISOString(),
                      responseTimeSeconds: Math.round((sentDate - receivedInternalDate) / 1000)
                    };
                    break;
                  }
                }
              }
            } catch (searchError) {
              // ignore
            }
          }
        }
        receivedEmailsWithStatus.push({
          messageId: msg.id,
          threadId,
          receivedDate: new Date(receivedInternalDate).toISOString(),
          receivedDateLocal: DateTime.fromMillis(receivedInternalDate, { zone: tz }).toFormat('yyyy-MM-dd HH:mm:ss ZZZZ'),
          threadMessagesCount,
          hasReply: !!matchInfo.replyMessageId,
          replyMessageId: matchInfo.replyMessageId,
          replyDate: matchInfo.replyDate,
          replyDateLocal: matchInfo.replyDate ? DateTime.fromISO(matchInfo.replyDate, { zone: tz }).toFormat('yyyy-MM-dd HH:mm:ss ZZZZ') : null,
          responseTimeSeconds: matchInfo.responseTimeSeconds,
          matchMethod: matchInfo.method
        });
      } catch (error) {
        receivedEmailsWithStatus.push({
          messageId: msg.id,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
    debugInfo.timeZoneUsed = tz;
    debugInfo.receivedEmailsWithStatus = receivedEmailsWithStatus;
    return reply.send(debugInfo);
  } catch (err: any) {
    fastify.log.error('Debug response time calculation failed', {
      error: err.message,
      userId: user_id,
      stack: err.stack
    });
    return reply.status(500).send({ error: err.message || 'Failed to debug response time calculation' });
  }
});

// Test endpoint for inbox zero buffer
fastify.post('/api/test/inbox-zero-buffer', async (request, reply) => {
  const { user_id, test_time } = request.body as { user_id?: string, test_time?: string };
  if (!user_id || !test_time) {
    return reply.status(400).send({ error: 'Missing user_id or test_time' });
  }

  try {
    // Get user's settings
    const { data: settingsData, error: settingsError } = await supabase
      .from('user_settings')
      .select('working_hours_start, working_hours_end, working_days, inbox_zero_buffer_minutes, time_zone')
      .eq('user_id', user_id)
      .single();

    if (settingsError) {
      throw settingsError;
    }

    // Parse the test time
    const tz = settingsData?.time_zone || 'UTC';
    const testDateTime = DateTime.fromISO(test_time, { zone: tz });
    
    // Calculate buffer cutoff time
    const [endHour, endMinute] = (settingsData?.working_hours_end || '17:00').split(':').map(Number);
    const bufferMinutes = settingsData?.inbox_zero_buffer_minutes || 30;
    const workingDayEnd = testDateTime.set({ hour: endHour, minute: endMinute });
    const bufferCutoff = workingDayEnd.minus({ minutes: bufferMinutes });

    // Check if it's a working day
    const isWorkingDay = settingsData?.working_days?.includes(testDateTime.weekday) ?? true;

    // Determine if emails at this time would count
    const emailsCount = testDateTime < bufferCutoff;

    return reply.send({
      test_time: test_time,
      working_day: isWorkingDay,
      buffer_cutoff: bufferCutoff.toISO(),
      working_day_end: workingDayEnd.toISO(),
      emails_count: emailsCount,
      settings: {
        working_hours_end: settingsData?.working_hours_end,
        buffer_minutes: bufferMinutes,
        timezone: tz
      }
    });

  } catch (error) {
    fastify.log.error('Test endpoint error:', error);
    return reply.status(500).send({ error: 'Failed to run test' });
  }
});

const start = async () => {
  try {
    const port = Number(process.env.PORT) || 3001;
    const host = '0.0.0.0';
    
    console.log(`Starting server with configuration:`);
    console.log(`- PORT environment variable: ${process.env.PORT || 'not set (using default 3001)'}`);
    console.log(`- Binding to port: ${port}`);
    console.log(`- Binding to host: ${host}`);
    
    await fastify.listen({ port, host });
    console.log(`Server successfully listening on port ${port}`);
    console.log(`Server accessible at http://0.0.0.0:${port}`);
  } catch (err) {
    fastify.log.error('Failed to start server:', err);
    process.exit(1);
  }
};

start(); 