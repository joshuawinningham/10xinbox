import { createClient } from '@supabase/supabase-js';
import { DateTime } from 'luxon';
import { google } from 'googleapis';
import logger from './utils/logger';
import DailyReportEmail from '../emails/DailyReportEmail';
import { sendEmail } from './email';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';

interface SentEmail {
  email_id: string;
  user_id: string;
  sent_at: string;
  to_email: string;
  to_name: string;
  subject: string;
  body: string;
  is_reply: boolean;
}

async function testReport() {
  try {
    logger.info('Starting test report generation for 2025-06-25');
    
    // Get the user
    const { data: users, error } = await supabase
      .from('gmail_tokens')
      .select('user_id, email')
      .not('email', 'is', null);
    if (error) throw error;

    const user = users[0]; // Get first user
    if (!user.email) {
      throw new Error('No user found');
    }

    logger.info(`Testing report for user ${user.user_id} (${user.email})`);

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

    // Set specific date to test: 2025-06-25
    const testDate = DateTime.fromISO('2025-06-25').setZone(tz);
    const testDateStr = testDate.toISODate();
    const nextDateStr = testDate.plus({ days: 1 }).toISODate();

    if (!testDateStr || !nextDateStr) {
      throw new Error('Failed to generate test date strings');
    }

    logger.info('Test date calculation', {
      userId: user.user_id,
      timezone: tz,
      testDate: testDate.toISO(),
      testDateStr,
      nextDateStr
    });

    // Get all emails for the user from the test date
    const { data: emails, error: emailsError } = await supabase
      .from('sent_emails')
      .select('email_id, user_id, sent_at, to_email, to_name, subject, body, is_reply')
      .eq('user_id', user.user_id)
      .gte('sent_at', `${testDateStr}T00:00:00`)
      .lt('sent_at', `${nextDateStr}T00:00:00`)
      .order('sent_at', { ascending: true });

    if (emailsError) {
      logger.error('Error fetching emails', { error: emailsError, userId: user.user_id });
      throw emailsError;
    }

    const typedEmails = (emails || []) as SentEmail[];

    logger.info(`Found ${typedEmails.length} emails for test date`, {
      userId: user.user_id,
      testDateStr,
      nextDateStr,
      dateRange: `${testDateStr}T00:00:00 to ${nextDateStr}T00:00:00`
    });

    // Debug: Check if there are any emails at all for this user
    if (typedEmails.length === 0) {
      const { data: allEmails, error: allEmailsError } = await supabase
        .from('sent_emails')
        .select('email_id, sent_at')
        .eq('user_id', user.user_id)
        .order('sent_at', { ascending: false })
        .limit(10);
      
      if (!allEmailsError && allEmails && allEmails.length > 0) {
        logger.info('Found emails in database but not in test date range', {
          userId: user.user_id,
          sampleEmails: allEmails.map(e => ({ email_id: e.email_id, sent_at: e.sent_at })),
          dateRange: `${testDateStr}T00:00:00 to ${nextDateStr}T00:00:00`
        });
      } else {
        logger.info('No emails found in database at all for user', {
          userId: user.user_id,
          error: allEmailsError
        });
      }
    }

    // Get emails_received from email_stats for the test date
    let emailsReceived = 0;
    const { data: statsRow, error: statsError } = await supabase
      .from('email_stats')
      .select('emails_received')
      .eq('user_id', user.user_id)
      .eq('date', testDateStr)
      .single();

    if (statsRow && typeof statsRow.emails_received === 'number') {
      emailsReceived = statsRow.emails_received;
    }

    logger.info('Email stats for test date', {
      userId: user.user_id,
      testDateStr,
      emailsReceived,
      emailsSent: typedEmails.length
    });

    // Calculate email stats
    const newThreads = typedEmails.filter(email => !email.is_reply).length;
    const replies = typedEmails.filter(email => email.is_reply).length;
    const totalSent = newThreads + replies;

    // Calculate hourly breakdown for sent emails
    const hourlySent = new Array(24).fill(0);
    typedEmails.forEach((email) => {
      const localTime = DateTime.fromISO(email.sent_at).setZone(tz);
      if (localTime.isValid) {
        hourlySent[localTime.hour]++;
      }
    });

    logger.info('Hourly sent breakdown', {
      hourlySent,
      userId: user.user_id
    });

    // Fetch received emails from Gmail for the test date and aggregate by hour
    let hourlyReceived = new Array(24).fill(0);
    try {
      // Get a valid access token
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
        `${process.env.BASE_URL || 'http://localhost:3001'}/api/auth/google/callback`
      );

      // Check if token needs refresh
      const tokenExpiry = new Date(tokenRow.expires_at);
      const currentTime = new Date();
      if (currentTime >= tokenExpiry) {
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

      // Calculate after/before in UTC seconds
      const after = Math.floor(testDate.toUTC().toUnixInteger());
      const before = Math.floor(testDate.plus({ days: 1 }).toUTC().toUnixInteger());
      
      logger.info('Fetching Gmail messages for test date', { 
        userId: user.user_id, 
        after, 
        before,
        timezone: tz 
      });

      // Helper to fetch all messages matching a query (handles pagination)
      async function fetchAllMessages(q: string) {
        let messages: any[] = [];
        let nextPageToken: string | undefined = undefined;
        do {
          const res: any = await gmail.users.messages.list({
            userId: 'me',
            q,
            pageToken: nextPageToken,
            maxResults: 500,
          });
          if (res.data.messages) {
            messages = messages.concat(res.data.messages);
          }
          nextPageToken = res.data.nextPageToken ?? undefined;
        } while (nextPageToken);
        return messages;
      }

      // Fetch received messages for the test date
      const receivedMessages = await fetchAllMessages(`after:${after} before:${before} label:INBOX -from:me`);
      
      logger.info('Fetched received messages for test date', { 
        count: receivedMessages.length,
        userId: user.user_id 
      });

      // Fetch message details to get internalDate
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
      
      logger.info('Processed received dates for test date', {
        count: receivedDates.length,
        userId: user.user_id
      });

      // Aggregate by hour (local to user)
      receivedDates.forEach((ts) => {
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

      logger.info('Hourly received breakdown for test date', {
        hourlyReceived,
        userId: user.user_id
      });

    } catch (err) {
      logger.error('Failed to fetch hourly received stats for test report:', {
        error: err,
        userId: user.user_id,
        timezone: tz
      });
    }

    // Find peak activity hour
    const peakActivityHour = hourlySent.indexOf(Math.max(...hourlySent));
    const busiestHour = hourlyReceived.indexOf(Math.max(...hourlyReceived));

    // Build sentEmailsWithViews for the report
    const sentEmailsWithViews = await Promise.all(
      typedEmails.map(async (email) => {
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
          isReply: email.is_reply
        };
      })
    );

    logger.info('Test report summary', {
      userId: user.user_id,
      testDateStr,
      emailsSent: typedEmails.length,
      emailsReceived,
      newThreads,
      replies,
      totalSent,
      hourlySent,
      hourlyReceived,
      peakActivityHour,
      busiestHour
    });

    // Send the test email
    await sendEmail({
      to: user.email,
      subject: `TEST: Your Daily Email Report for ${testDate.toFormat('MM-dd-yyyy')}`,
      react: DailyReportEmail({
        date: testDateStr,
        newThreads,
        replies,
        totalSent,
        emailsReceived: statsRow?.emails_received ?? 0,
        avgResponseTime: 'N/A',
        inboxZeroWorkingDays: 0,
        inboxZeroStreak: 0,
        hourlySent,
        hourlyReceived,
        peakActivityHour,
        busiestHour,
        sentEmailsWithViews,
        timezone: tz
      })
    });

    logger.info('Test report sent successfully');

  } catch (error) {
    logger.error('Failed to generate test report:', { error });
    if (error instanceof Error) {
      logger.error('Error details:', {
        message: error.message,
        stack: error.stack
      });
    }
  }
}

testReport(); 