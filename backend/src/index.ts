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

dotenv.config({ path: '.env.local' });

const fastify = Fastify({ logger: true });

// Register CORS for development
fastify.register(cors, {
  origin: true,
  credentials: true,
});

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  'http://localhost:3001/api/auth/google/callback'
);

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
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

fastify.get('/health', async (request, reply) => {
  return { status: 'ok' };
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
    return reply.redirect('http://localhost:5173/?gmail_error=1');
  }
  try {
    const { tokens } = await oauth2Client.getToken(code);

    // Decode the id_token to get the user's email (optional, for logging)
    const decoded: any = jwt.decode(tokens.id_token as string);
    const email = decoded?.email;

    // Store tokens in Supabase using the user_id (UUID) from state
    const { error } = await supabase
      .from('gmail_tokens')
      .upsert({
        user_id: state,
        email,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: new Date(Date.now() + (tokens.expiry_date ? tokens.expiry_date - Date.now() : 0)).toISOString(),
        created_at: new Date().toISOString(),
      });

    if (error) {
      return reply.redirect('http://localhost:5173/?gmail_error=1');
    }

    return reply.redirect('http://localhost:5173/?gmail_connected=1');
  } catch (err) {
    fastify.log.error(err);
    return reply.redirect('http://localhost:5173/?gmail_error=1');
  }
});

// Utility to get a valid Gmail access token for a user (refresh if needed)
async function getValidAccessToken(user_id: string) {
  // 1. Get tokens from Supabase
  const { data, error } = await supabase
    .from('gmail_tokens')
    .select('*')
    .eq('user_id', user_id)
    .single();

  if (error || !data) throw new Error('No tokens found for user');

  const { access_token, refresh_token, expires_at } = data;

  // 2. Check if access_token is expired
  if (new Date(expires_at) > new Date()) {
    // Not expired, return it
    return access_token;
  }

  // 3. Refresh the token using getAccessToken and credentials.expiry_date
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    'http://localhost:3001/api/auth/google/callback'
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

    // 3. Get user's time zone from param or gmail_tokens
    let tz = time_zone;
    if (!tz) {
      const { data: tokenRow } = await supabase
        .from('gmail_tokens')
        .select('time_zone')
        .eq('user_id', user_id)
        .single();
      tz = tokenRow?.time_zone || 'UTC';
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

    // 5. Count sent emails for the day
    const sentRes = await gmail.users.messages.list({
      userId: 'me',
      q: `after:${after} before:${before} from:me`,
    });
    const emails_sent = sentRes.data.resultSizeEstimate || 0;

    // 6. Count received emails for the day (Inbox, not sent by me)
    const receivedRes = await gmail.users.messages.list({
      userId: 'me',
      q: `after:${after} before:${before} label:INBOX -from:me`,
    });
    const emails_received = receivedRes.data.resultSizeEstimate || 0;

    // 7. Store stats in Supabase (using local date string)
    const dateStr = start.toISODate();
    const { error } = await supabase
      .from('email_stats')
      .upsert({
        user_id,
        date: dateStr,
        emails_sent,
        emails_received,
      }, { onConflict: 'user_id,date' });
    if (error) {
      return reply.status(500).send({ error: error.message });
    }
    return reply.send({ success: true, emails_sent, emails_received });
  } catch (err: any) {
    fastify.log.error(err);
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

// NEW: Hourly cron job to send reports at midnight in each user's time zone
cron.schedule('0 * * * *', async () => {
  try {
    // Get all users with Gmail tokens (including their email and time_zone)
    const { data: users, error: userError } = await supabase.from('gmail_tokens').select('user_id, email, time_zone');
    if (userError) {
      fastify.log.error('Failed to fetch users for report cron job:', userError);
      return;
    }
    const utcNow = DateTime.utc();
    for (const user of users) {
      try {
        const tz = user.time_zone || 'UTC';
        const userNow = utcNow.setZone(tz);
        // Only send if it's midnight in user's time zone
        if (userNow.hour === 0 && userNow.minute === 0) {
          // Get previous day's date in user's time zone
          const dateStr = userNow.minus({ days: 1 }).startOf('day').toISODate();

          // Check if report already sent for this user/date
          const { data: sentRow, error: sentError } = await supabase
            .from('reports_sent')
            .select('id')
            .eq('user_id', user.user_id)
            .eq('date', dateStr)
            .single();
          if (sentRow) {
            fastify.log.info(`Report already sent for user ${user.user_id} on ${dateStr}, skipping.`);
            continue;
          }

          // Check if stats exist for that day
          const { data: stats, error: statsError } = await supabase
            .from('email_stats')
            .select('*')
            .eq('user_id', user.user_id)
            .eq('date', dateStr)
            .single();
          if (statsError || !stats) {
            fastify.log.error(`No stats for user ${user.user_id} on ${dateStr}`);
            continue;
          }
          // Use the user's email from gmail_tokens
          const toEmail = user.email;
          if (!toEmail) {
            fastify.log.error(`No email for user ${user.user_id}. Skipping email send.`);
            continue;
          }
          // Fetch hourly stats for today
          let hourlySent: number[] = [];
          let hourlyReceived: number[] = [];
          try {
            // 1. Get a valid access token
            const accessToken = await getValidAccessToken(user.user_id);
            // 2. Set up Gmail API client
            const oauth2Client = new google.auth.OAuth2();
            oauth2Client.setCredentials({ access_token: accessToken });
            const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
            // 3. Get user's time zone from param or gmail_tokens
            const tz = user.time_zone || 'UTC';
            // 4. Get date range for today in user's time zone
            const now = DateTime.now().setZone(tz);
            const start = now.startOf('day');
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
              const hour = DateTime.fromMillis(ts, { zone: tz }).hour;
              hourlySent[hour]++;
            });
            receivedDates.forEach((ts) => {
              const hour = DateTime.fromMillis(ts, { zone: tz }).hour;
              hourlyReceived[hour]++;
            });
          } catch (err) {
            fastify.log.error('Failed to fetch hourly stats for email report:', err);
          }
          // Generate simple HTML report using React Email (no JSX)
          const html = await render(
            React.createElement(DailyReportEmail, {
              date: dateStr || '',
              emailsSent: stats.emails_sent,
              emailsReceived: stats.emails_received,
              hourlySent,
              hourlyReceived,
            })
          );
          // Send email via Resend
          await resend.emails.send({
            from: 'onboarding@resend.dev',
            to: toEmail,
            subject: 'Your Daily Email KPI Report',
            html,
          });
          // Insert a row into reports_sent to mark as sent
          await supabase.from('reports_sent').insert({ user_id: user.user_id, date: dateStr });
          fastify.log.info(`Sent report to ${toEmail} for user ${user.user_id} (hourly cron)`);
        }
      } catch (err) {
        fastify.log.error(`Failed to send report for user ${user.user_id}:`, err);
      }
    }
  } catch (err) {
    fastify.log.error('Hourly report cron job error:', err);
  }
});

// Endpoint to manually send the daily report to a user (for testing or on-demand)
fastify.post('/api/report/send', async (request, reply) => {
  const { user_id } = request.body as { user_id?: string };
  if (!user_id) {
    return reply.status(400).send({ error: 'Missing user_id' });
  }
  try {
    // Fetch user email and time zone from gmail_tokens
    const { data: user, error: userError } = await supabase
      .from('gmail_tokens')
      .select('email, time_zone')
      .eq('user_id', user_id)
      .single();
    if (userError || !user?.email) {
      return reply.status(404).send({ error: 'User email not found' });
    }
    const toEmail = user.email;
    const tz = user.time_zone || 'UTC';

    // Get today's date in user's local time zone
    const now = DateTime.now().setZone(tz);
    const dateStr = now.startOf('day').toISODate();

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
      // 3. Get user's time zone from param or gmail_tokens
      const tz = user.time_zone || 'UTC';
      // 4. Get date range for today in user's time zone
      const now = DateTime.now().setZone(tz);
      const start = now.startOf('day');
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
        const hour = DateTime.fromMillis(ts, { zone: tz }).hour;
        hourlySent[hour]++;
      });
      receivedDates.forEach((ts) => {
        const hour = DateTime.fromMillis(ts, { zone: tz }).hour;
        hourlyReceived[hour]++;
      });
    } catch (err) {
      fastify.log.error('Failed to fetch hourly stats for email report:', err);
    }

    // Render the report email
    const html = await render(
      React.createElement(DailyReportEmail, {
        date: dateStr || '',
        emailsSent: stats.emails_sent,
        emailsReceived: stats.emails_received,
        hourlySent,
        hourlyReceived,
      })
    );

    // Send the email
    await resend.emails.send({
      from: 'onboarding@resend.dev',
      to: toEmail,
      subject: 'Your Real-Time Email KPI Report',
      html,
    });

    return reply.send({ success: true, to: toEmail });
  } catch (err: any) {
    fastify.log.error(err);
    return reply.status(500).send({ error: err.message || 'Failed to send report' });
  }
});

// Endpoint to set the user's time zone before OAuth
fastify.post('/api/auth/set-timezone', async (request, reply) => {
  const { user_id, time_zone } = request.body as { user_id?: string; time_zone?: string };
  if (!user_id || !time_zone) {
    return reply.status(400).send({ error: 'Missing user_id or time_zone' });
  }
  const { error } = await supabase
    .from('gmail_tokens')
    .upsert({ user_id, time_zone }, { onConflict: 'user_id' });
  if (error) {
    return reply.status(500).send({ error: error.message });
  }
  return reply.send({ success: true });
});

// Endpoint to get the user's time zone
fastify.post('/api/auth/get-timezone', async (request, reply) => {
  const { user_id } = request.body as { user_id?: string };
  if (!user_id) {
    return reply.status(400).send({ error: 'Missing user_id' });
  }
  const { data, error } = await supabase
    .from('gmail_tokens')
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
  const { user_id, days } = request.body as { user_id?: string, days?: number };
  if (!user_id) {
    return reply.status(400).send({ error: 'Missing user_id' });
  }
  const numDays = days && days > 0 && days <= 90 ? days : 30; // Limit to max 90 days
  try {
    const sinceDate = DateTime.utc().minus({ days: numDays - 1 }).toISODate();
    const { data: stats, error } = await supabase
      .from('email_stats')
      .select('*')
      .eq('user_id', user_id)
      .gte('date', sinceDate)
      .order('date', { ascending: true });
    if (error) {
      return reply.status(500).send({ error: error.message });
    }
    return reply.send({ stats });
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
    // 3. Get user's time zone from param or gmail_tokens
    let tz = time_zone;
    if (!tz) {
      const { data: tokenRow } = await supabase
        .from('gmail_tokens')
        .select('time_zone')
        .eq('user_id', user_id)
        .single();
      tz = tokenRow?.time_zone || 'UTC';
    }
    // 4. Get date range for today in user's time zone
    const now = DateTime.now().setZone(tz);
    const start = now.startOf('day');
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
    const sentByHour = Array(24).fill(0);
    const receivedByHour = Array(24).fill(0);
    sentDates.forEach((ts) => {
      const hour = DateTime.fromMillis(ts, { zone: tz }).hour;
      sentByHour[hour]++;
    });
    receivedDates.forEach((ts) => {
      const hour = DateTime.fromMillis(ts, { zone: tz }).hour;
      receivedByHour[hour]++;
    });
    return reply.send({ sent: sentByHour, received: receivedByHour });
  } catch (err: any) {
    fastify.log.error(err);
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
      .select('user_id')
      .eq('user_id', user_id)
      .single();
    if (error && error.code !== 'PGRST116') { // PGRST116: No rows found
      return reply.status(500).send({ error: error.message });
    }
    return reply.send({ connected: !!data });
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
    // 1. Get a valid access token
    const accessToken = await getValidAccessToken(user_id);
    // 2. Set up Gmail API client
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    // 3. Get user's time zone from param or gmail_tokens
    let tz = time_zone;
    if (!tz) {
      const { data: tokenRow } = await supabase
        .from('gmail_tokens')
        .select('time_zone')
        .eq('user_id', user_id)
        .single();
      tz = tokenRow?.time_zone || 'UTC';
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
    return reply.status(500).send({ error: err.message || 'Failed to fetch top senders' });
  }
});

const start = async () => {
  try {
    await fastify.listen({ port: Number(process.env.PORT) || 3001, host: '0.0.0.0' });
    console.log(`Server listening on port ${process.env.PORT || 3001}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start(); 