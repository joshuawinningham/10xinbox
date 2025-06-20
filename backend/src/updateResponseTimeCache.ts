import { createClient } from '@supabase/supabase-js';
import { google, gmail_v1 } from 'googleapis';
import dotenv from 'dotenv';
import { DateTime } from 'luxon';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

async function getValidAccessToken(user_id: string) {
  const { data, error } = await supabase
    .from('gmail_tokens')
    .select('*')
    .eq('user_id', user_id)
    .single();
  if (error || !data) throw new Error('No tokens found for user');
  const { access_token, refresh_token, expires_at } = data;
  if (new Date(expires_at) > new Date()) return access_token;
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.BASE_URL}/api/auth/google/callback`
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

export async function calculateResponseTime(user_id: string, tz: string) {
  const now = DateTime.now().setZone(tz);
  const startOfDay = now.startOf('day');
  const endOfDay = now.endOf('day');

  const accessToken = await getValidAccessToken(user_id);
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  // 1. Fetch all emails sent today
  const sentRes = await gmail.users.messages.list({
    userId: 'me',
    q: `from:me after:${startOfDay.toSeconds()} before:${endOfDay.toSeconds()}`,
  });

  const sentMessages = sentRes.data.messages || [];
  if (sentMessages.length === 0) {
    return { average_response_time: null, count: 0 };
  }

  let totalResponseTime = 0;
  let responseCount = 0;

  // 2. For each sent message, get its thread and find the message it replied to.
  for (const sentMsg of sentMessages) {
    try {
      if (!sentMsg.id || !sentMsg.threadId) continue;

      // Get the full thread
      const threadRes = await gmail.users.threads.get({
        userId: 'me',
        id: sentMsg.threadId,
      });

      const threadMessages = threadRes.data.messages || [];
      
      // Find our sent message in the thread to get its internalDate
      const currentSentMessage = threadMessages.find(m => m.id === sentMsg.id);
      if (!currentSentMessage || !currentSentMessage.internalDate) continue;

      const sentTimestamp = parseInt(currentSentMessage.internalDate, 10);

      // Find the latest message in the thread that was received *before* our sent message
      const originalMessage = threadMessages
        .filter(m => 
          m.id !== sentMsg.id && 
          !m.labelIds?.includes('SENT') && 
          m.internalDate &&
          parseInt(m.internalDate, 10) < sentTimestamp
        )
        .sort((a, b) => parseInt(b.internalDate!, 10) - parseInt(a.internalDate!, 10))[0];

      if (originalMessage && originalMessage.internalDate) {
        const receivedTimestamp = parseInt(originalMessage.internalDate, 10);
        
        // We have a match, calculate response time in seconds
        const diffSeconds = Math.round((sentTimestamp - receivedTimestamp) / 1000);
        if (diffSeconds > 0) {
          totalResponseTime += diffSeconds;
          responseCount++;
        }
      }

    } catch (error) {
      console.error('Error processing thread for response time:', {
        messageId: sentMsg.id,
        threadId: sentMsg.threadId,
        error: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
  }

  return {
    average_response_time: responseCount > 0 ? Math.round(totalResponseTime / responseCount) : null,
    count: responseCount,
  };
}

async function main() {
  console.log('Starting response time cache update job...');
  // 1. Get all user IDs
  const { data: users, error: userError } = await supabase
    .from('user_settings')
    .select('user_id, time_zone');
  if (userError) {
    console.error('Failed to fetch users:', userError);
    process.exit(1);
  }
  const today = DateTime.now().toISODate();
  for (const user of users || []) {
    const user_id = user.user_id;
    const tz = user.time_zone || 'UTC';
    try {
      console.log(`Processing user ${user_id} (${tz})...`);
      const { average_response_time, count } = await calculateResponseTime(user_id, tz);
      await supabase.from('response_time_cache').upsert({
        user_id,
        date: today,
        average_response_time,
        reply_count: count,
        updated_at: new Date().toISOString(),
      });
      console.log(`User ${user_id}: avg=${average_response_time}, count=${count}`);
    } catch (err) {
      console.error(`Error processing user ${user_id}:`, err);
    }
  }
  console.log('Response time cache update job complete.');
}

// Only run main() if this file is executed directly
if (require.main === module) {
  main();
} 