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
  const start = now.startOf('day');
  const end = start.plus({ days: 1 });
  const dateStr = start.toISODate();
  const nextDay = end.toISODate();

  // Get sent emails that are replies from the sent_emails table
  const { data: sentEmails, error: sentEmailsError } = await supabase
    .from('sent_emails')
    .select('in_reply_to, sent_at')
    .eq('user_id', user_id)
    .eq('is_reply', true)
    .gte('sent_at', dateStr)
    .lt('sent_at', nextDay)
    .not('in_reply_to', 'is', null);

  if (sentEmailsError) {
    throw new Error(`Failed to fetch sent emails: ${sentEmailsError.message}`);
  }

  if (!sentEmails || sentEmails.length === 0) {
    return { average_response_time: null, count: 0 };
  }

  // Get access token for Gmail API
  const accessToken = await getValidAccessToken(user_id);
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  let totalResponseTime = 0;
  let responseCount = 0;

  // For each reply, get the original message it's replying to
  for (const email of sentEmails) {
    try {
      if (!email.in_reply_to) continue;

      const originalMsgId = email.in_reply_to.replace(/[<>]/g, '');
      const originalMsgRes = await gmail.users.messages.get({
        userId: 'me',
        id: originalMsgId,
        format: 'metadata',
        metadataHeaders: ['Date']
      });

      const originalDate = originalMsgRes.data.payload?.headers?.find(h => h.name === 'Date')?.value;
      if (!originalDate) continue;

      const receivedTime = new Date(originalDate).getTime();
      const sentTime = new Date(email.sent_at).getTime();
      
      if (sentTime > receivedTime) {
        totalResponseTime += sentTime - receivedTime;
        responseCount++;
      }
    } catch (error) {
      console.error('Error processing email for response time:', {
        in_reply_to: email.in_reply_to,
        error: error instanceof Error ? error.message : String(error)
      });
      continue;
    }
  }

  return {
    average_response_time: responseCount > 0 ? (totalResponseTime / responseCount) / 1000 : null, // Return seconds
    count: responseCount
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